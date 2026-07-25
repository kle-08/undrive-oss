const MAX_THUMB_SIZE = 400;
const THUMB_QUALITY = 0.8;

const IMAGE_EXTS = new Set([
	'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif',
]);

const VIDEO_EXTS = new Set([
	'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi',
]);

/**
 * @param {string} name
 * @returns {boolean}
 */
export const canGenerateThumb = (name) => {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	return IMAGE_EXTS.has(ext);
};

/**
 * @param {string} name
 * @returns {boolean}
 */
export const canGenerateVideoThumb = (name) => {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	return VIDEO_EXTS.has(ext);
};

/**
 * Generate a JPEG thumbnail from an image File.
 * Resizes to fit within MAX_THUMB_SIZE while maintaining aspect ratio.
 * @param {File} file
 * @returns {Promise<Blob|null>}
 */
export const generateThumbnail = (file) =>
	new Promise((resolve) => {
		const img = new Image();
		const url = URL.createObjectURL(file);

		img.onload = () => {
			URL.revokeObjectURL(url);

			let { width, height } = img;
			if (width <= MAX_THUMB_SIZE && height <= MAX_THUMB_SIZE) {
				resolve(null);
				return;
			}

			if (width > height) {
				height = Math.round((height / width) * MAX_THUMB_SIZE);
				width = MAX_THUMB_SIZE;
			} else {
				width = Math.round((width / height) * MAX_THUMB_SIZE);
				height = MAX_THUMB_SIZE;
			}

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0, width, height);
			canvas.toBlob((blob) => resolve(blob), 'image/jpeg', THUMB_QUALITY);
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};

		img.src = url;
	});

/**
 * Extract a frame from a video File and return a JPEG thumbnail blob.
 * Uses a hidden <video> element with an object URL (no network request).
 * @param {File} file
 * @returns {Promise<Blob|null>}
 */
export const generateVideoThumbnail = (file) =>
	new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement('video');
		video.muted = true;
		video.preload = 'metadata';

		const cleanup = () => {
			video.src = '';
			URL.revokeObjectURL(url);
		};

		const timeout = setTimeout(() => {
			cleanup();
			resolve(null);
		}, 15000);

		video.onloadeddata = () => {
			video.currentTime = Math.min(1, video.duration * 0.1);
		};

		video.onseeked = () => {
			clearTimeout(timeout);
			try {
				const canvas = document.createElement('canvas');
				const w = Math.min(video.videoWidth, MAX_THUMB_SIZE);
				const h = Math.round(w * (video.videoHeight / video.videoWidth));
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(video, 0, 0, w, h);
				canvas.toBlob(
					(blob) => {
						cleanup();
						resolve(blob);
					},
					'image/jpeg',
					THUMB_QUALITY
				);
			} catch {
				cleanup();
				resolve(null);
			}
		};

		video.onerror = () => {
			clearTimeout(timeout);
			cleanup();
			resolve(null);
		};

		video.src = url;
	});