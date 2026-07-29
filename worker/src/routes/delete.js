import { json, error } from '../lib/utils.js';

/**
 * POST /api/delete body: { keys: ["a.jpg", "b.jpg"] }
 * Soft-delete: set deleted_at in D1. No R2 copy needed.
 * @param {Request} req
 * @param {object} env
 */
export const handleDelete = async (req, env) => {
	const body = await req.json();
	const keys = body?.keys;
	if (!Array.isArray(keys) || keys.length === 0) return error('Missing "keys" array');

	const now = new Date().toISOString();
	const stmts = [];

	for (const key of keys) {
		if (key.endsWith('/')) {
			// Folder: soft-delete folder and all children
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET deleted_at = ?, updated_at = ?
					 WHERE r2_key = ? AND deleted_at IS NULL`
				).bind(now, now, key)
			);
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET deleted_at = ?, updated_at = ?
					 WHERE (parent = ? OR parent LIKE ?) AND deleted_at IS NULL`
				).bind(now, now, key, key + '%')
			);
		} else {
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET deleted_at = ?, updated_at = ?
					 WHERE r2_key = ? AND deleted_at IS NULL`
				).bind(now, now, key)
			);
		}
	}

	const results = await env.DB.batch(stmts);
	const deleted = results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);

	return json({ deleted });
};

/**
 * POST /api/trash/restore body: { keys: ["photos/a.jpg", "docs/"] }
 * Restore: clear deleted_at in D1. No R2 copy needed.
 * @param {Request} req
 * @param {object} env
 */
export const handleRestore = async (req, env) => {
	const body = await req.json();
	const keys = body?.keys;
	if (!Array.isArray(keys) || keys.length === 0) return error('Missing "keys" array');

	const now = new Date().toISOString();
	const stmts = [];

	for (const key of keys) {
		if (key.endsWith('/')) {
			// Restore folder and all its children
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET deleted_at = NULL, updated_at = ?
					 WHERE r2_key = ? AND deleted_at IS NOT NULL`
				).bind(now, key)
			);
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET deleted_at = NULL, updated_at = ?
					 WHERE (parent = ? OR parent LIKE ?) AND deleted_at IS NOT NULL`
				).bind(now, key, key + '%')
			);
		} else {
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET deleted_at = NULL, updated_at = ?
					 WHERE r2_key = ? AND deleted_at IS NOT NULL`
				).bind(now, key)
			);
		}
	}

	const results = await env.DB.batch(stmts);
	const restored = results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);

	return json({ restored });
};

/**
 * GET /api/trash
 * List trashed files from D1.
 * @param {Request} req
 * @param {object} env
 */
export const handleListTrash = async (req, env) => {
	const rows = await env.DB.prepare(
		`SELECT r2_key, name, size, deleted_at
		 FROM files
		 WHERE deleted_at IS NOT NULL
		 ORDER BY deleted_at DESC
		 LIMIT 1000`
	).all();

	const items = rows.results.map((row) => ({
		trashKey: row.r2_key,
		originalKey: row.r2_key,
		name: row.name,
		size: row.size,
		deletedAt: row.deleted_at,
	}));

	return json({ items, cursor: null });
};

/**
 * POST /api/trash/purge body: { olderThanDays?: number }
 * Permanently delete trashed files from both D1 and R2.
 * @param {Request} req
 * @param {object} env
 */
export const handlePurgeTrash = async (req, env) => {
	const body = await req.json().catch(() => ({}));
	const olderThanDays = body?.olderThanDays || 0;

	let query = `SELECT id, r2_key FROM files WHERE deleted_at IS NOT NULL`;
	const binds = [];
	if (olderThanDays > 0) {
		query += ` AND deleted_at < datetime('now', ?)`;
		binds.push(`-${olderThanDays} days`);
	}

	const rows = await env.DB.prepare(query).bind(...binds).all();
	const r2Keys = rows.results.map((r) => r.r2_key);
	const ids = rows.results.map((r) => r.id);

	// Batch delete from R2
	for (let i = 0; i < r2Keys.length; i += 1000) {
		await env.BUCKET.delete(r2Keys.slice(i, i + 1000));
	}

	// Batch delete from D1
	if (ids.length > 0) {
		const placeholders = ids.map(() => '?').join(',');
		await env.DB.prepare(`DELETE FROM files WHERE id IN (${placeholders})`).bind(...ids).run();
	}

	// Remove any share links pointing at the purged files
	for (let i = 0; i < r2Keys.length; i += 500) {
		const chunk = r2Keys.slice(i, i + 500);
		const placeholders = chunk.map(() => '?').join(',');
		await env.DB.prepare(`DELETE FROM shares WHERE r2_key IN (${placeholders})`).bind(...chunk).run();
	}

	return json({ purged: ids.length });
};
