import { json, error, inferType, formatSize } from '../lib/utils.js';
import { presignGet } from '../lib/s3.js';

/**
 * GET /api/search?q=term
 * @param {Request} req
 * @param {object} env
 */
export const handleSearch = async (req, env) => {
	const url = new URL(req.url);
	const q = (url.searchParams.get('q') ?? '').trim();

	if (!q) return json({ files: [] });

	const rows = await env.DB.prepare(
		`SELECT id, r2_key, name, parent, type, size, created_at, updated_at
		 FROM files
		 WHERE name LIKE ? AND deleted_at IS NULL AND r2_key NOT LIKE '__trash/%' AND r2_key NOT LIKE '__vault/%'
		 ORDER BY type = 'folder' DESC, name ASC
		 LIMIT 50`
	).bind(`%${q}%`).all();

	const files = [];
	for (const row of rows.results) {
		const needsUrl = row.type === 'image' || row.type === 'video';
		files.push({
			key: row.r2_key,
			name: row.name,
			type: row.type,
			size: row.size,
			sizeFormatted: formatSize(row.size),
			modified: row.updated_at,
			parent: row.parent,
			url: needsUrl && env._s3
				? await presignGet(env._s3, env._bucketName, row.r2_key)
				: null,
		});
	}

	return json({ files });
};
