import { json } from '../lib/utils.js';

/**
 * GET /api/duplicates
 * Find files with the same name and size at different R2 paths.
 * @param {Request} req
 * @param {object} env
 */
export const handleDuplicates = async (req, env) => {
	const rows = await env.DB.prepare(
		`SELECT name, size, COUNT(*) as count, GROUP_CONCAT(r2_key, '|||') as keys
		 FROM files
		 WHERE deleted_at IS NULL AND type != 'folder' AND size > 0
		 GROUP BY name, size
		 HAVING COUNT(*) > 1
		 ORDER BY size * (COUNT(*) - 1) DESC
		 LIMIT 100`
	).all();

	let wastedBytes = 0;
	const duplicates = rows.results.map((row) => {
		const wasted = row.size * (row.count - 1);
		wastedBytes += wasted;
		return {
			name: row.name,
			size: row.size,
			count: row.count,
			wasted,
			keys: row.keys.split('|||'),
		};
	});

	// Also get total size
	const totalRow = await env.DB.prepare(
		`SELECT SUM(size) as total FROM files WHERE deleted_at IS NULL AND type != 'folder'`
	).first();

	return json({
		totalIndexedSize: totalRow?.total || 0,
		totalIndexedSizeMB: Math.round((totalRow?.total || 0) / 1048576),
		duplicateGroups: duplicates.length,
		wastedBytes,
		wastedMB: Math.round(wastedBytes / 1048576),
		duplicates,
	});
};
