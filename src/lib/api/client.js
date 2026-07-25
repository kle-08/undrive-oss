const API_BASE = import.meta.env.VITE_API_URL
	? `${import.meta.env.VITE_API_URL}/api`
	: '/api';

let _backendDown = false;

export const isBackendDown = () => _backendDown;

/**
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
const apiFetch = async (path, options = {}) => {
	let res;
	try {
		res = await fetch(`${API_BASE}${path}`, {
			credentials: 'include',
			...options,
			headers: {
				...options.headers,
			},
		});
	} catch {
		_backendDown = true;
		throw new Error('Backend unavailable — is the dev server running?');
	}

	_backendDown = false;

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `API error: ${res.status}`);
	}

	return res.json();
};

/**
 * List files and folders at a given prefix.
 * @param {string} prefix - e.g. "" or "photos/"
 * @param {string} [cursor]
 * @returns {Promise<{ folders: any[], files: any[], cursor: string | null, prefix: string }>}
 */
export const listFiles = (prefix = '', cursor) => {
	const params = new URLSearchParams({ prefix });
	if (cursor) params.set('cursor', cursor);
	return apiFetch(`/files?${params}`);
};

/**
 * Upload a file directly through the Worker.
 * @param {string} key
 * @param {File} file
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<any>}
 */
export const uploadFile = async (key, file, onProgress) => {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `${API_BASE}/upload?key=${encodeURIComponent(key)}`);
		xhr.withCredentials = true;
		xhr.timeout = 120_000;
		xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && onProgress) {
				onProgress(Math.round((e.loaded / e.total) * 100));
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(JSON.parse(xhr.responseText));
			} else {
				reject(new Error(`Upload failed: ${xhr.status}`));
			}
		};

		xhr.onerror = () => reject(new Error('Upload failed — network error'));
		xhr.ontimeout = () => reject(new Error('Upload failed — timed out'));
		xhr.onabort = () => reject(new Error('Upload aborted'));
		xhr.send(file);
	});
};

const PART_SIZE = 8 * 1024 * 1024;
const WORKER_LIMIT = 10 * 1024 * 1024;

/**
 * @param {string} key
 * @param {string} contentType
 * @returns {Promise<{ key: string, uploadId: string }>}
 */
const createMultipartUpload = (key, contentType) =>
	apiFetch('/upload/multipart/create', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ key, contentType }),
	});

/**
 * Upload a part via the API (R2 binding, not presigned URL).
 * @param {string} key
 * @param {string} uploadId
 * @param {number} partNumber
 * @param {Blob} chunk
 * @param {(fraction: number) => void} [onProgress]
 * @returns {Promise<{ partNumber: number, etag: string }>}
 */
const uploadPart = (key, uploadId, partNumber, chunk, onProgress) =>
	new Promise((resolve, reject) => {
		const params = new URLSearchParams({ key, uploadId, partNumber: String(partNumber) });
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `${API_BASE}/upload/multipart/upload-part?${params}`);
		xhr.withCredentials = true;
		xhr.timeout = 300_000;

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && onProgress) {
				onProgress(e.loaded / e.total);
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				const data = JSON.parse(xhr.responseText);
				resolve({ partNumber: data.partNumber, etag: data.etag });
			} else {
				reject(new Error(`Part ${partNumber} upload failed: ${xhr.status}`));
			}
		};

		xhr.onerror = () => reject(new Error(`Part ${partNumber} failed — network error`));
		xhr.ontimeout = () => reject(new Error(`Part ${partNumber} failed — timed out`));
		xhr.onabort = () => reject(new Error(`Part ${partNumber} aborted`));
		xhr.send(chunk);
	});

/**
 * @param {string} key
 * @param {string} uploadId
 * @param {{ partNumber: number, etag: string }[]} parts
 * @param {number} size
 */
const completeMultipartUpload = (key, uploadId, parts, size) =>
	apiFetch('/upload/multipart/complete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ key, uploadId, parts, size }),
	});

/**
 * @param {string} key
 * @param {string} uploadId
 */
const abortMultipartUpload = (key, uploadId) =>
	apiFetch('/upload/multipart/abort', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ key, uploadId }),
	}).catch(() => {});

/**
 * @param {string} prefix
 * @param {File} file
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<{ key: string, size: number }>}
 */
const multipartUpload = async (prefix, file, onProgress) => {
	const key = `${prefix}${file.name}`;
	const contentType = file.type || 'application/octet-stream';

	const { uploadId } = await createMultipartUpload(key, contentType);

	const totalParts = Math.ceil(file.size / PART_SIZE);
	const partProgress = new Array(totalParts).fill(0);
	const uploadedParts = [];

	const updateProgress = () => {
		const total = partProgress.reduce((sum, p) => sum + p, 0);
		onProgress?.(Math.round((total / totalParts) * 100));
	};

	try {
		for (let i = 0; i < totalParts; i++) {
			const partNumber = i + 1;
			const start = i * PART_SIZE;
			const end = Math.min(start + PART_SIZE, file.size);
			const chunk = file.slice(start, end);

			const progressCb = (p) => {
				partProgress[i] = p;
				updateProgress();
			};

			let part;
			for (let attempt = 0; attempt < 6; attempt++) {
				try {
					part = await uploadPart(key, uploadId, partNumber, chunk, progressCb);
					break;
				} catch (e) {
					if (attempt === 5) throw e;
					const delay = Math.min(3000 * Math.pow(2, attempt), 30_000);
					await new Promise((r) => setTimeout(r, delay + delay * 0.3 * Math.random()));
					partProgress[i] = 0;
					updateProgress();
				}
			}

			uploadedParts.push(part);
			partProgress[i] = 1;
			updateProgress();
		}

		uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
		await completeMultipartUpload(key, uploadId, uploadedParts, file.size);
		onProgress?.(100);
		return { key, size: file.size };
	} catch (e) {
		await abortMultipartUpload(key, uploadId);
		throw e;
	}
};

/**
 * Smart upload: picks strategy based on file size.
 *   <10MB — direct POST through API (R2 binding)
 *   ≥10MB — multipart upload (8MB parts via R2 binding, sequential)
 * @param {string} prefix
 * @param {File} file
 * @param {(progress: number) => void} [onProgress]
 */
export const smartUpload = async (prefix, file, onProgress) => {
	const key = `${prefix}${file.name}`;
	const backoff = (attempt) => {
		const base = Math.min(2000 * Math.pow(2, attempt), 30_000);
		return base + base * 0.5 * Math.random();
	};

	if (file.size < WORKER_LIMIT) {
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await uploadFile(key, file, onProgress);
			} catch (e) {
				if (attempt === 2) throw e;
				await new Promise((r) => setTimeout(r, backoff(attempt)));
				onProgress?.(0);
			}
		}
	}

	return await multipartUpload(prefix, file, onProgress);
};

/**
 * Check which upload keys already exist in D1.
 * @param {string[]} keys
 * @returns {Promise<{ existing: Record<string, number> }>}
 */
export const checkExistingFiles = (keys) =>
	apiFetch('/upload/check', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ keys }),
	});

/**
 * Get download URL for a file.
 * @param {string} key
 * @returns {string}
 */
export const getDownloadUrl = (key) =>
	`${API_BASE}/download?key=${encodeURIComponent(key)}`;

/**
 * Get a same-origin inline streaming URL (Range-enabled).
 * Used for <video>/<audio> playback: unlike /api/presign it does not
 * 302-redirect to R2, so a crossorigin media load doesn't get its Origin
 * reset to "null" by the cross-origin redirect (which R2's CORS rejects).
 * @param {string} key
 * @returns {string}
 */
export const getInlineUrl = (key) =>
	`${API_BASE}/download?key=${encodeURIComponent(key)}&inline=1`;

/**
 * Get presign-redirect URL for an image thumbnail.
 * Returns a URL that 302-redirects to a presigned R2 URL.
 * @param {string} key
 * @returns {string}
 */
export const getPresignUrl = (key) =>
	`${API_BASE}/presign?key=${encodeURIComponent(key)}`;

/**
 * Soft-delete files (move to trash).
 * @param {string[]} keys
 * @returns {Promise<{ deleted: number }>}
 */
export const deleteFiles = (keys) =>
	apiFetch('/delete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ keys }),
	});

/**
 * Rename a file or folder.
 * @param {string} from
 * @param {string} to
 * @returns {Promise<{ from: string, to: string }>}
 */
export const renameFile = (from, to) =>
	apiFetch('/rename', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ from, to }),
	});

/**
 * Move files to a destination folder.
 * @param {string[]} keys
 * @param {string} destination
 * @returns {Promise<{ moved: number }>}
 */
export const moveFiles = (keys, destination) =>
	apiFetch('/move', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ keys, destination }),
	});

/**
 * Copy files to a destination folder (server-side R2 copy).
 * @param {string[]} keys
 * @param {string} destination
 * @returns {Promise<{ copied: number }>}
 */
export const copyFiles = (keys, destination) =>
	apiFetch('/copy', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ keys, destination }),
	});

/**
 * Create a new folder.
 * @param {string} path - e.g. "photos/vacation/"
 * @returns {Promise<{ path: string, created: boolean }>}
 */
export const createFolder = (path) =>
	apiFetch('/folder', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path }),
	});

/**
 * List trashed items.
 * @param {string} [cursor]
 * @returns {Promise<{ items: any[], cursor: string | null }>}
 */
export const listTrash = (cursor) => {
	const params = cursor ? `?cursor=${cursor}` : '';
	return apiFetch(`/trash${params}`);
};

/**
 * Restore files from trash.
 * @param {string[]} keys - Trash keys
 * @returns {Promise<{ restored: number }>}
 */
export const restoreFromTrash = (keys) =>
	apiFetch('/trash/restore', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ keys }),
	});

/**
 * Permanently purge trash items.
 * @param {number} [olderThanDays=0] - 0 means purge all
 * @returns {Promise<{ purged: number }>}
 */
export const purgeTrash = (olderThanDays = 0) =>
	apiFetch('/trash/purge', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ olderThanDays }),
	});

/**
 * Get a config object from R2.
 * @param {string} key - Config key (e.g. "img-gen")
 * @returns {Promise<any>}
 */
export const getConfig = (key) => apiFetch(`/config/${encodeURIComponent(key)}`);

/**
 * Save a config object to R2.
 * @param {string} key
 * @param {any} data
 * @returns {Promise<{ ok: boolean }>}
 */
export const putConfig = (key, data) =>
	apiFetch(`/config/${encodeURIComponent(key)}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	});

/**
 * Search files by name.
 * @param {string} query
 * @returns {Promise<{ files: any[] }>}
 */
export const searchFiles = (query) =>
	apiFetch(`/search?q=${encodeURIComponent(query)}`);

/**
 * Get storage stats.
 * @returns {Promise<{ total: number, totalSizeMB: number, totalSizeGB: string, folders: object }>}
 */
export const getStats = () => apiFetch('/stats');

/**
 * Create a share link for a file.
 * @param {string} key - R2 key
 * @param {{ expiresIn?: string, maxDownloads?: number, password?: string }} [options]
 * @returns {Promise<{ token: string, expiresAt: string|null, maxDownloads: number|null }>}
 */
export const createShare = (key, options = {}) =>
	apiFetch('/share', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ key, ...options }),
	});

/**
 * List active share links.
 * @returns {Promise<{ shares: any[] }>}
 */
export const listShares = () => apiFetch('/shares');

/**
 * Revoke a share link.
 * @param {string} token
 * @returns {Promise<{ deleted: boolean }>}
 */
export const deleteShare = (token) =>
	apiFetch(`/share/${token}`, { method: 'DELETE' });

/**
 * Get the public share URL for a token.
 * @param {string} token
 * @returns {string}
 */
export const getShareUrl = (token) => {
	const base = import.meta.env.VITE_API_URL || window.location.origin;
	return `${base}/s/${token}`;
};

/**
 * Get cached video thumbnail URL, or null if not cached.
 * @param {string} key - Video object key
 * @returns {Promise<string | null>}
 */
export const getVideoThumb = async (key) => {
	try {
		const res = await fetch(`${API_BASE}/thumb?key=${encodeURIComponent(key)}`, {
			credentials: 'include',
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.cached ? data.url : null;
	} catch {
		return null;
	}
};

/**
 * Upload a generated video thumbnail to R2 for caching.
 * @param {string} key - Video object key
 * @param {Blob} jpegBlob
 * @returns {Promise<string | null>} - Presigned URL of saved thumb
 */
export const saveVideoThumb = async (key, jpegBlob) => {
	try {
		const res = await fetch(`${API_BASE}/thumb?key=${encodeURIComponent(key)}`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'image/jpeg' },
			body: jpegBlob,
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.url ?? null;
	} catch {
		return null;
	}
};
