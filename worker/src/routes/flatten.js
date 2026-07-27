import { json, error } from '../lib/utils.js';

/**
 * POST /api/flatten  body: { key: "photos/vacation/" }
 *
 * Move every direct child of the folder (files + subfolders, with their whole
 * subtrees) up into the folder's parent, then remove the now-empty folder.
 * Metadata-only, like move: files keep their r2_key (only `parent` changes);
 * subfolders get their virtual r2_key rewritten.
 *
 * @param {Request} req
 * @param {object} env
 */
export const handleFlatten = async (req, env) => {
	const body = await req.json();
	const key = body?.key;
	if (typeof key !== 'string' || !key.endsWith('/')) return error('Missing folder "key"');

	// Parent prefix — strip the last path segment (same rule as folder creation).
	const parent = key.slice(0, key.slice(0, -1).lastIndexOf('/') + 1);

	const children = await env.DB.prepare(
		`SELECT id, r2_key, name, type FROM files WHERE parent = ? AND deleted_at IS NULL`
	).bind(key).all();

	const stmts = [];
	let moved = 0;

	for (const child of children.results) {
		if (child.type === 'folder') {
			const newChildKey = `${parent}${child.name}/`;

			// The subfolder itself: new parent + rewritten virtual key.
			stmts.push(env.DB.prepare(
				`UPDATE files SET parent = ?, r2_key = ?, updated_at = datetime('now') WHERE id = ?`
			).bind(parent, newChildKey, child.id));

			// Its whole subtree: rewrite the old folder prefix to the new one.
			const descendants = await env.DB.prepare(
				`SELECT id, r2_key, parent, type FROM files
				 WHERE (parent = ? OR parent LIKE ?) AND deleted_at IS NULL`
			).bind(child.r2_key, child.r2_key + '%').all();

			for (const d of descendants.results) {
				const newParent = d.parent.replace(child.r2_key, newChildKey);
				if (d.type === 'folder') {
					const newKey = d.r2_key.replace(child.r2_key, newChildKey);
					stmts.push(env.DB.prepare(
						`UPDATE files SET parent = ?, r2_key = ?, updated_at = datetime('now') WHERE id = ?`
					).bind(newParent, newKey, d.id));
				} else {
					stmts.push(env.DB.prepare(
						`UPDATE files SET parent = ?, updated_at = datetime('now') WHERE id = ?`
					).bind(newParent, d.id));
				}
			}
		} else {
			// File: only the parent changes; r2_key points at real R2 data.
			stmts.push(env.DB.prepare(
				`UPDATE files SET parent = ?, updated_at = datetime('now') WHERE id = ?`
			).bind(parent, child.id));
		}
		moved++;
	}

	// Remove the now-empty folder (D1 row).
	stmts.push(env.DB.prepare(
		`DELETE FROM files WHERE r2_key = ? AND type = 'folder'`
	).bind(key));

	try {
		if (stmts.length > 0) await env.DB.batch(stmts);
	} catch (e) {
		// r2_key is UNIQUE — a subfolder name already in the destination collides.
		return error(`Flatten failed — a name already exists in the destination: ${e.message}`, 409);
	}

	// Best-effort: drop the folder's R2 marker.
	await env.BUCKET.delete(key).catch(() => {});

	return json({ moved, destination: parent });
};
