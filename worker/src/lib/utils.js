/**
 * @param {number} status
 * @param {object} body
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
export const json = (body, status = 200, headers = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers },
	});

/**
 * @param {string} message
 * @param {number} [status=400]
 * @returns {Response}
 */
export const error = (message, status = 400) => json({ error: message }, status);

/**
 * Normalize a path prefix for R2 listing.
 * Ensures it ends with `/` and strips leading `/`.
 * @param {string} prefix
 * @returns {string}
 */
export const normalizePrefix = (prefix) => {
	let p = prefix.replace(/^\/+/, '');
	if (p && !p.endsWith('/')) p += '/';
	return p;
};

/**
 * Extract the "filename" from a full R2 key.
 * @param {string} key - e.g. "photos/vacation/beach.jpg"
 * @returns {string} - e.g. "beach.jpg"
 */
export const keyName = (key) => {
	const trimmed = key.endsWith('/') ? key.slice(0, -1) : key;
	return trimmed.split('/').pop() || trimmed;
};

/**
 * Infer a simple file type from the key extension.
 * @param {string} key
 * @returns {'folder' | 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'}
 */
export const inferType = (key) => {
	if (key.endsWith('/')) return 'folder';
	const ext = key.split('.').pop()?.toLowerCase() ?? '';
	if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'avif', 'dng', 'cr2', 'arw', 'nef', 'orf', 'rw2', 'raf'].includes(ext)) return 'image';
	if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext)) return 'video';
	if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
	if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'json', 'html'].includes(ext)) return 'document';
	if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2'].includes(ext)) return 'archive';
	return 'other';
};

const RAW_EXTS = ['dng', 'cr2', 'arw', 'nef', 'orf', 'rw2', 'raf'];

/**
 * Check if an extension is a RAW image format.
 * @param {string} ext - lowercase extension without dot
 * @returns {boolean}
 */
export const isRawExt = (ext) => RAW_EXTS.includes(ext);

/** @type {Set<string>} */
const ensuredFolders = new Set();

/**
 * Ensure all parent folder entries exist in D1 for a given key.
 * e.g. for "a/b/c/file.jpg" → ensures "a/", "a/b/", "a/b/c/" exist.
 * Skips D1 call if all parents were already ensured in this Worker instance.
 * @param {object} env
 * @param {string} key
 */
export const ensureParentFolders = async (env, key) => {
	const parts = key.split('/').slice(0, -1);
	if (parts.length === 0) return;

	const deepest = parts.join('/') + '/';
	if (ensuredFolders.has(deepest)) return;

	const stmts = [];
	const now = new Date().toISOString();

	for (let i = 0; i < parts.length; i++) {
		const folderKey = parts.slice(0, i + 1).join('/') + '/';
		const parent = i === 0 ? '' : parts.slice(0, i).join('/') + '/';
		const name = parts[i];
		stmts.push(
			env.DB.prepare(
				`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 'folder', 0, ?, ?)
				 ON CONFLICT(r2_key) DO UPDATE SET deleted_at = NULL, updated_at = ?`
			).bind(crypto.randomUUID(), folderKey, name, parent, now, now, now)
		);
	}

	await env.DB.batch(stmts);
	ensuredFolders.add(deepest);
};

/**
 * Format file size to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export const formatSize = (bytes) => {
	if (bytes === 0) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};
