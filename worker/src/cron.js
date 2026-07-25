/**
 * Purge trash items older than 30 days.
 * Deletes from both R2 and D1.
 * @param {object} env
 */
const purgeOldTrash = async (env) => {
	const rows = await env.DB.prepare(
		`SELECT id, r2_key FROM files
		 WHERE deleted_at IS NOT NULL
		 AND deleted_at < datetime('now', '-30 days')`
	).all();

	if (rows.results.length === 0) return 0;

	const r2Keys = rows.results.map((r) => r.r2_key);
	const ids = rows.results.map((r) => r.id);

	for (let i = 0; i < r2Keys.length; i += 1000) {
		await env.BUCKET.delete(r2Keys.slice(i, i + 1000));
	}

	const placeholders = ids.map(() => '?').join(',');
	await env.DB.prepare(`DELETE FROM files WHERE id IN (${placeholders})`).bind(...ids).run();

	return ids.length;
};

export const handleScheduled = async (env) => {
	const trashPurged = await purgeOldTrash(env);
	console.log(`Cron complete: purged ${trashPurged} trash`);
};
