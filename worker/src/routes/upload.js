import { json, error, keyName, inferType, ensureParentFolders } from '../lib/utils.js';

/**
 * POST /api/upload/check
 * Check which keys already exist in D1 (for skipping duplicates).
 * Body: { keys: string[] }
 * Returns: { existing: { [key]: size } }
 * @param {Request} req
 * @param {object} env
 */
export const handleUploadCheck = async (req, env) => {
	const { keys } = await req.json();
	if (!Array.isArray(keys) || keys.length === 0) return json({ existing: {} });

	const existing = {};
	const BATCH = 50;
	for (let i = 0; i < keys.length; i += BATCH) {
		const chunk = keys.slice(i, i + BATCH);
		const placeholders = chunk.map(() => '?').join(',');
		const rows = await env.DB.prepare(
			`SELECT r2_key, size FROM files WHERE r2_key IN (${placeholders}) AND deleted_at IS NULL`
		).bind(...chunk).all();
		for (const row of rows.results) {
			existing[row.r2_key] = row.size;
		}
	}

	return json({ existing });
};

/**
 * POST /api/upload?key=photos/pic.jpg
 * Direct small-file upload through Worker.
 * @param {Request} req
 * @param {object} env
 */
export const handleUpload = async (req, env) => {
	const url = new URL(req.url);
	const key = url.searchParams.get('key');
	if (!key) return error('Missing "key" parameter');

	const contentType = req.headers.get('content-type') || 'application/octet-stream';

	const obj = await env.BUCKET.put(key, req.body, {
		httpMetadata: { contentType },
	});

	if (!obj) return error('Upload failed', 500);

	// Ensure parent folders exist in D1
	await ensureParentFolders(env, key);

	// Upsert into D1
	const name = keyName(key);
	const parent = key.slice(0, key.lastIndexOf('/') + 1);
	const type = inferType(key);
	const now = new Date().toISOString();

	await env.DB.prepare(
		`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(r2_key) DO UPDATE SET size = ?, updated_at = ?, deleted_at = NULL`
	).bind(
		crypto.randomUUID(), key, name, parent, type, obj.size, now, now,
		obj.size, now
	).run();

	return json({
		key: obj.key,
		size: obj.size,
		uploaded: obj.uploaded?.toISOString(),
	});
};
