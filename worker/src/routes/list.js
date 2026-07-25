import { json, error, normalizePrefix, inferType, formatSize, isRawExt } from '../lib/utils.js';
import { presignGet } from '../lib/s3.js';

const THUMB_PREFIX = '__thumbs/';
const PRESIGN_EXPIRY = 604800; // 7 days

/**
 * GET /api/files?prefix=photos/&cursor=
 * @param {Request} req
 * @param {object} env
 */
export const handleList = async (req, env) => {
	const url = new URL(req.url);
	const prefix = normalizePrefix(url.searchParams.get('prefix') ?? '');

	const parent = prefix || '';
	const rows = await env.DB.prepare(
		`SELECT id, r2_key, name, parent, type, size, created_at, updated_at
		 FROM files
		 WHERE parent = ? AND deleted_at IS NULL
		 ORDER BY type = 'folder' DESC, name ASC`
	).bind(parent).all();

	const folders = [];
	const fileRows = [];

	for (const row of rows.results) {
		if (row.name.startsWith('__')) continue;

		if (row.type === 'folder') {
			folders.push({
				key: row.r2_key,
				name: row.name,
				type: 'folder',
				size: 0,
				sizeFormatted: '—',
				modified: row.updated_at,
			});
		} else {
			fileRows.push(row);
		}
	}

	const files = await Promise.all(fileRows.map(async (row) => {
		const needsUrl = row.type === 'image' || row.type === 'video';
		const ext = row.name.split('.').pop()?.toLowerCase() ?? '';
		const raw = isRawExt(ext);
		let fileUrl = null;

		if (needsUrl && env._s3) {
			const thumbKey = `${THUMB_PREFIX}${row.r2_key}.jpg`;
			const thumbHead = await env.BUCKET.head(thumbKey);
			if (thumbHead) {
				fileUrl = await presignGet(env._s3, env._bucketName, thumbKey, PRESIGN_EXPIRY);
			} else if (!raw) {
				fileUrl = await presignGet(env._s3, env._bucketName, row.r2_key, PRESIGN_EXPIRY);
			}
		}

		return {
			key: row.r2_key,
			name: row.name,
			type: row.type,
			size: row.size,
			sizeFormatted: formatSize(row.size),
			modified: row.updated_at,
			url: fileUrl,
		};
	}));

	return json({
		folders,
		files,
		cursor: null,
		prefix,
	});
};
