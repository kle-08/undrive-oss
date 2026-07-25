import { json, error, keyName, inferType, ensureParentFolders } from '../lib/utils.js';

/**
 * POST /api/copy body: { keys: ["photos/a.jpg"], destination: "archive/" }
 * Server-side R2 copy + D1 insert for each file.
 * Folders are recreated and their children copied recursively.
 * @param {Request} req
 * @param {object} env
 */
export const handleCopy = async (req, env) => {
	const body = await req.json();
	const { keys, destination } = body ?? {};
	if (!Array.isArray(keys) || keys.length === 0) return error('Missing "keys" array');
	if (typeof destination !== 'string') return error('Missing "destination" string');

	const dest = destination.endsWith('/') ? destination : destination + '/';
	let copied = 0;
	const now = new Date().toISOString();

	for (const key of keys) {
		if (key.endsWith('/')) {
			// Folder: recreate folder + copy all descendants
			const folderName = keyName(key);
			const newFolderKey = `${dest}${folderName}/`;

			await ensureParentFolders(env, newFolderKey + '_');

			// Create the folder entry
			await env.DB.prepare(
				`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 'folder', 0, ?, ?)
				 ON CONFLICT(r2_key) DO NOTHING`
			).bind(crypto.randomUUID(), newFolderKey, folderName, dest, now, now).run();

			// Get all descendants
			const children = await env.DB.prepare(
				`SELECT r2_key, name, parent, type, size FROM files
				 WHERE (parent = ? OR parent LIKE ?) AND deleted_at IS NULL`
			).bind(key, key + '%').all();

			for (const child of children.results) {
				const newParent = child.parent.replace(key, newFolderKey);

				if (child.type === 'folder') {
					const newChildKey = child.r2_key.replace(key, newFolderKey);
					await env.DB.prepare(
						`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
						 VALUES (?, ?, ?, ?, 'folder', 0, ?, ?)
						 ON CONFLICT(r2_key) DO NOTHING`
					).bind(crypto.randomUUID(), newChildKey, child.name, newParent, now, now).run();
				} else {
					// Copy R2 object
					const newR2Key = `${newParent}${child.name}`;
					const src = await env.BUCKET.get(child.r2_key);
					if (src) {
						await env.BUCKET.put(newR2Key, src.body, {
							httpMetadata: src.httpMetadata,
						});
						await env.DB.prepare(
							`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
							 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
							 ON CONFLICT(r2_key) DO UPDATE SET size = ?, updated_at = ?`
						).bind(
							crypto.randomUUID(), newR2Key, child.name, newParent,
							child.type, child.size, now, now, child.size, now
						).run();
					}
				}
				copied++;
			}
			copied++;
		} else {
			// File: R2 server-side copy + D1 insert
			const name = keyName(key);
			const newKey = `${dest}${name}`;

			await ensureParentFolders(env, newKey);

			const src = await env.BUCKET.get(key);
			if (!src) continue;

			await env.BUCKET.put(newKey, src.body, {
				httpMetadata: src.httpMetadata,
			});

			const type = inferType(newKey);
			await env.DB.prepare(
				`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(r2_key) DO UPDATE SET size = ?, updated_at = ?`
			).bind(
				crypto.randomUUID(), newKey, name, dest, type, src.size, now, now,
				src.size, now
			).run();

			copied++;
		}
	}

	return json({ copied, destination: dest });
};
