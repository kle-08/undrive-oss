import { json } from '../lib/utils.js';

const SKIP_PREFIXES = ['__thumbs/', '__trash/', '__config/', '__generated/', '__vault/'];

/**
 * Collect R2 keys and D1 keys for comparison.
 * @param {object} env
 * @returns {Promise<{ r2Keys: Set<string>, d1Keys: Set<string> }>}
 */
const collectKeys = async (env) => {
	const r2Keys = new Set();
	let cursor;
	do {
		const result = await env.BUCKET.list({ cursor, limit: 1000 });
		for (const obj of result.objects) {
			if (!SKIP_PREFIXES.some((p) => obj.key.startsWith(p))) {
				r2Keys.add(obj.key);
			}
		}
		cursor = result.truncated ? result.cursor : undefined;
	} while (cursor);

	const d1Keys = new Set();
	const rows = await env.DB.prepare(
		`SELECT r2_key FROM files WHERE deleted_at IS NULL`
	).all();
	for (const row of rows.results) {
		d1Keys.add(row.r2_key);
	}

	return { r2Keys, d1Keys };
};

/**
 * GET /api/verify
 * Compare R2 objects against D1 records and report discrepancies.
 * @param {Request} req
 * @param {object} env
 */
export const handleVerify = async (req, env) => {
	const { r2Keys, d1Keys } = await collectKeys(env);

	const inR2Only = [...r2Keys].filter((k) => !d1Keys.has(k));
	const inD1Only = [...d1Keys].filter((k) => !r2Keys.has(k) && !k.endsWith('/'));
	const implicitFolders = [...d1Keys].filter((k) => k.endsWith('/') && !r2Keys.has(k));

	return json({
		r2Count: r2Keys.size,
		d1Count: d1Keys.size,
		match: inR2Only.length === 0 && inD1Only.length === 0,
		inR2Only: inR2Only.length > 0 ? inR2Only : undefined,
		inD1Only: inD1Only.length > 0 ? inD1Only : undefined,
		implicitFolders: implicitFolders.length,
		summary: `R2: ${r2Keys.size} objects, D1: ${d1Keys.size} records (${implicitFolders.length} implicit folders)`,
	});
};

/**
 * POST /api/verify
 * Remove ghost D1 entries (files in D1 but not in R2).
 * Also cleans up orphaned __thumbs/ entries for removed files.
 * @param {Request} req
 * @param {object} env
 */
export const handleVerifyCleanup = async (req, env) => {
	const { r2Keys, d1Keys } = await collectKeys(env);
	const ghosts = [...d1Keys].filter((k) => !r2Keys.has(k) && !k.endsWith('/'));

	if (ghosts.length === 0) {
		return json({ cleaned: 0, message: 'No ghost entries found' });
	}

	const BATCH = 50;
	for (let i = 0; i < ghosts.length; i += BATCH) {
		const batch = ghosts.slice(i, i + BATCH);
		const placeholders = batch.map(() => '?').join(',');
		await env.DB.prepare(
			`DELETE FROM files WHERE r2_key IN (${placeholders}) AND deleted_at IS NULL`
		).bind(...batch).run();

		const thumbDeletes = batch.map((k) => env.BUCKET.delete(`__thumbs/${k}.jpg`));
		await Promise.all(thumbDeletes);
	}

	return json({ cleaned: ghosts.length, keys: ghosts });
};
