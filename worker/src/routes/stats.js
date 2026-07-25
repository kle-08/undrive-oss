import { json } from '../lib/utils.js';

/**
 * GET /api/stats
 * Count all objects in R2, grouped by top-level folder, with sizes.
 * @param {Request} req
 * @param {object} env
 */
export const handleStats = async (req, env) => {
	const folders = {};
	const folderSizes = {};
	let total = 0;
	let totalSize = 0;
	let cursor;

	do {
		const result = await env.BUCKET.list({ cursor, limit: 1000 });
		for (const obj of result.objects) {
			total++;
			totalSize += obj.size || 0;
			const top = obj.key.includes('/') ? obj.key.split('/')[0] + '/' : '(root)';
			folders[top] = (folders[top] || 0) + 1;
			folderSizes[top] = (folderSizes[top] || 0) + (obj.size || 0);
		}
		cursor = result.truncated ? result.cursor : undefined;
	} while (cursor);

	// Sort by size descending
	const sorted = Object.entries(folders)
		.sort((a, b) => (folderSizes[b[0]] || 0) - (folderSizes[a[0]] || 0))
		.reduce((acc, [k, v]) => {
			acc[k] = { count: v, sizeMB: Math.round((folderSizes[k] || 0) / 1048576) };
			return acc;
		}, {});

	return json({
		total,
		totalSizeMB: Math.round(totalSize / 1048576),
		totalSizeGB: (totalSize / 1073741824).toFixed(2),
		folders: sorted,
	});
};
