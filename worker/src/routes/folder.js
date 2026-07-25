import { json, error, keyName } from '../lib/utils.js';

/**
 * POST /api/folder body: { path: "photos/vacation/" }
 * Create a folder: put marker in R2 + insert into D1.
 * @param {Request} req
 * @param {object} env
 */
export const handleCreateFolder = async (req, env) => {
	const body = await req.json();
	let path = body?.path;
	if (!path) return error('Missing "path" field');

	if (!path.endsWith('/')) path += '/';
	path = path.replace(/^\/+/, '');

	if (!path || path === '/') return error('Invalid folder path');

	await env.BUCKET.put(path, null);

	// Insert into D1
	const name = keyName(path);
	const parent = path.slice(0, path.slice(0, -1).lastIndexOf('/') + 1);
	const now = new Date().toISOString();

	await env.DB.prepare(
		`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 'folder', 0, ?, ?)
		 ON CONFLICT(r2_key) DO NOTHING`
	).bind(crypto.randomUUID(), path, name, parent, now, now).run();

	return json({ path, created: true });
};
