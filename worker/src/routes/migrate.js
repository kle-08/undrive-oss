import { json, error, keyName, inferType } from '../lib/utils.js';

/**
 * POST /api/migrate
 * Scan R2 and populate D1 with file metadata.
 * Skips internal prefixes (__thumbs/, __trash/, __config/, __generated/).
 * Creates implicit folder entries for all parent paths.
 * Idempotent — skips keys that already exist in D1.
 * @param {Request} req
 * @param {object} env
 */
export const handleMigrate = async (req, env) => {
	const SKIP_PREFIXES = ['__thumbs/', '__trash/', '__config/', '__generated/'];
	let cursor;
	let inserted = 0;
	let skipped = 0;
	let total = 0;
	const seenFolders = new Set();

	do {
		const result = await env.BUCKET.list({ cursor, limit: 1000 });

		const batch = [];
		for (const obj of result.objects) {
			total++;
			if (SKIP_PREFIXES.some((p) => obj.key.startsWith(p))) {
				skipped++;
				continue;
			}

			const key = obj.key;
			const name = keyName(key);
			const isFolder = key.endsWith('/');
			const parent = isFolder
				? key.slice(0, key.slice(0, -1).lastIndexOf('/') + 1)
				: key.slice(0, key.lastIndexOf('/') + 1);
			const type = inferType(key);
			const id = crypto.randomUUID();

			batch.push({
				id,
				r2_key: key,
				name,
				parent,
				type: isFolder ? 'folder' : type,
				size: obj.size || 0,
				created_at: obj.uploaded?.toISOString() || new Date().toISOString(),
			});

			if (isFolder) seenFolders.add(key);

			// Collect all implicit parent folders
			let p = parent;
			while (p && p !== '' && !seenFolders.has(p)) {
				seenFolders.add(p);
				const folderName = keyName(p);
				const folderParent = p.slice(0, p.slice(0, -1).lastIndexOf('/') + 1);
				batch.push({
					id: crypto.randomUUID(),
					r2_key: p,
					name: folderName,
					parent: folderParent,
					type: 'folder',
					size: 0,
					created_at: new Date().toISOString(),
				});
				p = folderParent;
			}
		}

		if (batch.length > 0) {
			const stmt = env.DB.prepare(
				`INSERT OR IGNORE INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			);
			const ops = batch.map((f) =>
				stmt.bind(f.id, f.r2_key, f.name, f.parent, f.type, f.size, f.created_at, f.created_at)
			);
			const results = await env.DB.batch(ops);
			inserted += results.filter((r) => r.meta?.changes > 0).length;
			skipped += results.filter((r) => r.meta?.changes === 0).length;
		}

		cursor = result.truncated ? result.cursor : undefined;
	} while (cursor);

	return json({ total, inserted, skipped });
};
