import { json, error, keyName } from '../lib/utils.js';

/**
 * POST /api/move body: { keys: ["photos/a.jpg", "docs/"], destination: "archive/" }
 * Move files/folders by updating parent in D1. No R2 copy needed.
 * r2_key stays unchanged for files (points to actual R2 data).
 * Folder r2_key updates to reflect new virtual path (used for parent lookups).
 * @param {Request} req
 * @param {object} env
 */
export const handleMove = async (req, env) => {
	const body = await req.json();
	const { keys, destination } = body ?? {};
	if (!Array.isArray(keys) || keys.length === 0) return error('Missing "keys" array');
	if (typeof destination !== 'string') return error('Missing "destination" string');

	const dest = destination.endsWith('/') ? destination : destination + '/';
	let moved = 0;

	const stmts = [];
	for (const key of keys) {
		if (key.endsWith('/')) {
			// Folder: update this folder's parent and r2_key (virtual path)
			const folderName = keyName(key);
			const newFolderKey = `${dest}${folderName}/`;

			// Update the folder itself
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET parent = ?, r2_key = ?, updated_at = datetime('now')
					 WHERE r2_key = ? AND deleted_at IS NULL`
				).bind(dest, newFolderKey, key)
			);

			// Get all descendants
			const children = await env.DB.prepare(
				`SELECT id, r2_key, parent, type FROM files
				 WHERE (parent = ? OR parent LIKE ?) AND deleted_at IS NULL`
			).bind(key, key + '%').all();

			for (const child of children.results) {
				const newParent = child.parent.replace(key, newFolderKey);
				if (child.type === 'folder') {
					// Folder children: update both parent and r2_key (virtual path)
					const newChildKey = child.r2_key.replace(key, newFolderKey);
					stmts.push(
						env.DB.prepare(
							`UPDATE files SET parent = ?, r2_key = ?, updated_at = datetime('now')
							 WHERE id = ?`
						).bind(newParent, newChildKey, child.id)
					);
				} else {
					// File children: only update parent, keep r2_key (actual R2 location)
					stmts.push(
						env.DB.prepare(
							`UPDATE files SET parent = ?, updated_at = datetime('now')
							 WHERE id = ?`
						).bind(newParent, child.id)
					);
				}
			}
			moved += children.results.length + 1;
		} else {
			// File: only update parent, keep r2_key unchanged
			stmts.push(
				env.DB.prepare(
					`UPDATE files SET parent = ?, updated_at = datetime('now')
					 WHERE r2_key = ? AND deleted_at IS NULL`
				).bind(dest, key)
			);
			moved++;
		}
	}

	if (stmts.length > 0) {
		await env.DB.batch(stmts);
	}

	return json({ moved, destination: dest });
};
