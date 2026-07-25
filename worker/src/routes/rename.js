import { json, error, keyName } from '../lib/utils.js';

/**
 * POST /api/rename body: { from: "docs/old.pdf", to: "docs/new.pdf" }
 * Rename a file or folder. D1 update only — no R2 copy needed.
 * Files: update name in D1, r2_key stays unchanged.
 * Folders: update virtual path in D1, children folders update r2_key.
 * @param {Request} req
 * @param {object} env
 */
export const handleRename = async (req, env) => {
	const body = await req.json();
	const { from, to } = body ?? {};
	if (!from || !to) return error('Missing "from" and "to" fields');
	if (from === to) return error('Source and destination are the same');

	if (from.endsWith('/')) {
		if (!to.endsWith('/')) return error('Folder destination must end with /');

		const stmts = [];
		const newName = keyName(to);

		// Update folder itself
		stmts.push(
			env.DB.prepare(
				`UPDATE files SET name = ?, r2_key = ?, updated_at = datetime('now')
				 WHERE r2_key = ? AND deleted_at IS NULL`
			).bind(newName, to, from)
		);

		// Update all descendants
		const children = await env.DB.prepare(
			`SELECT id, r2_key, parent, type FROM files
			 WHERE (parent = ? OR parent LIKE ?) AND deleted_at IS NULL`
		).bind(from, from + '%').all();

		for (const child of children.results) {
			const newParent = child.parent.replace(from, to);
			if (child.type === 'folder') {
				const newR2Key = child.r2_key.replace(from, to);
				stmts.push(
					env.DB.prepare(
						`UPDATE files SET parent = ?, r2_key = ?, updated_at = datetime('now')
						 WHERE id = ?`
					).bind(newParent, newR2Key, child.id)
				);
			} else {
				stmts.push(
					env.DB.prepare(
						`UPDATE files SET parent = ?, updated_at = datetime('now')
						 WHERE id = ?`
					).bind(newParent, child.id)
				);
			}
		}

		await env.DB.batch(stmts);
		return json({ renamed: children.results.length + 1, from, to });
	}

	// File rename: just update name in D1, keep r2_key unchanged
	const newName = keyName(to);
	await env.DB.prepare(
		`UPDATE files SET name = ?, updated_at = datetime('now')
		 WHERE r2_key = ? AND deleted_at IS NULL`
	).bind(newName, from).run();

	return json({ from, to });
};
