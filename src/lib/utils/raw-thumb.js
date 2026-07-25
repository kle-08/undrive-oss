const RAW_EXTS = ['dng', 'cr2', 'arw', 'nef', 'orf', 'rw2', 'raf'];

/**
 * Check if a filename is a RAW image format.
 * @param {string} name
 * @returns {boolean}
 */
export const isRawImage = (name) => {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	return RAW_EXTS.includes(ext);
};

/**
 * Extract the embedded JPEG preview from a RAW image file.
 * Works with TIFF-based RAW formats (DNG, CR2, ARW, NEF, ORF, RW2).
 * Falls back to scanning for JPEG markers if TIFF parsing fails.
 *
 * @param {File} file
 * @returns {Promise<Blob|null>} JPEG blob or null if extraction fails
 */
export const extractRawPreview = async (file) => {
	try {
		// Read enough of the header to parse all IFDs (256KB covers most cases)
		const headerSize = Math.min(file.size, 256 * 1024);
		const headerBuf = await file.slice(0, headerSize).arrayBuffer();
		const view = new DataView(headerBuf);

		// Check byte order
		const bom = view.getUint16(0);
		if (bom !== 0x4949 && bom !== 0x4D4D) return scanForJpeg(file);
		const le = bom === 0x4949;

		// Verify TIFF magic number
		const magic = view.getUint16(2, le);
		if (magic !== 42) return scanForJpeg(file);

		const ifdOffset = view.getUint32(4, le);

		/** @type {{ offset: number, length: number }[]} */
		const jpegs = [];

		/**
		 * @param {number} offset
		 * @param {number} depth
		 */
		const parseIFD = (offset, depth = 0) => {
			if (depth > 10 || offset < 8 || offset + 2 > headerBuf.byteLength) return;

			const numEntries = view.getUint16(offset, le);
			if (numEntries > 500) return; // sanity check

			let jpegOff = 0;
			let jpegLen = 0;
			let compression = 0;
			let stripOff = 0;
			let stripLen = 0;

			for (let i = 0; i < numEntries; i++) {
				const e = offset + 2 + i * 12;
				if (e + 12 > headerBuf.byteLength) break;

				const tag = view.getUint16(e, le);
				const type = view.getUint16(e + 2, le);
				const count = view.getUint32(e + 4, le);

				const getVal = () => {
					if (type === 3 && count === 1) return view.getUint16(e + 8, le);
					return view.getUint32(e + 8, le);
				};

				switch (tag) {
					case 0x0103: compression = getVal(); break;
					case 0x0111: stripOff = getVal(); break;
					case 0x0117: stripLen = getVal(); break;
					case 0x0201: jpegOff = getVal(); break;
					case 0x0202: jpegLen = getVal(); break;
					case 0x014A: { // SubIFDs
						if (count === 1) {
							parseIFD(getVal(), depth + 1);
						} else {
							const ptr = view.getUint32(e + 8, le);
							for (let j = 0; j < count && ptr + j * 4 + 4 <= headerBuf.byteLength; j++) {
								parseIFD(view.getUint32(ptr + j * 4, le), depth + 1);
							}
						}
						break;
					}
				}
			}

			if (jpegOff && jpegLen && jpegLen > 1000) {
				jpegs.push({ offset: jpegOff, length: jpegLen });
			}

			if ((compression === 6 || compression === 7) && stripOff && stripLen && stripLen > 1000) {
				jpegs.push({ offset: stripOff, length: stripLen });
			}

			// Follow next IFD link
			const nextPtr = offset + 2 + numEntries * 12;
			if (nextPtr + 4 <= headerBuf.byteLength) {
				const next = view.getUint32(nextPtr, le);
				if (next > 0 && next !== offset) {
					parseIFD(next, depth + 1);
				}
			}
		};

		parseIFD(ifdOffset);

		if (jpegs.length === 0) return scanForJpeg(file);

		// Pick the largest embedded JPEG (usually the full preview)
		jpegs.sort((a, b) => b.length - a.length);
		const best = jpegs[0];

		const jpegBuf = await file.slice(best.offset, best.offset + best.length).arrayBuffer();

		// Verify it starts with JPEG SOI marker
		const check = new Uint8Array(jpegBuf);
		if (check[0] !== 0xFF || check[1] !== 0xD8) return scanForJpeg(file);

		return new Blob([jpegBuf], { type: 'image/jpeg' });
	} catch {
		return scanForJpeg(file);
	}
};

/**
 * Fallback: scan the first 5MB for JPEG SOI/EOI markers.
 * @param {File} file
 * @returns {Promise<Blob|null>}
 */
const scanForJpeg = async (file) => {
	try {
		const scanSize = Math.min(file.size, 5 * 1024 * 1024);
		const buf = await file.slice(0, scanSize).arrayBuffer();
		const data = new Uint8Array(buf);

		/** @type {{ start: number, end: number }[]} */
		const found = [];
		let i = 0;

		while (i < data.length - 3) {
			// Look for SOI: 0xFF 0xD8 0xFF
			if (data[i] === 0xFF && data[i + 1] === 0xD8 && data[i + 2] === 0xFF) {
				const start = i;
				// Scan forward for EOI: 0xFF 0xD9
				let j = i + 3;
				while (j < data.length - 1) {
					if (data[j] === 0xFF && data[j + 1] === 0xD9) {
						found.push({ start, end: j + 2 });
						i = j + 2;
						break;
					}
					j++;
				}
				if (j >= data.length - 1) break;
			} else {
				i++;
			}
		}

		if (found.length === 0) return null;

		// Pick largest JPEG
		found.sort((a, b) => (b.end - b.start) - (a.end - a.start));
		const best = found[0];

		// Skip tiny JPEGs (likely just EXIF thumbnails < 10KB)
		if (best.end - best.start < 10000) return null;

		return new Blob([data.slice(best.start, best.end)], { type: 'image/jpeg' });
	} catch {
		return null;
	}
};
