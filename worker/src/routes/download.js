import { error } from '../lib/utils.js';
import { presignGet } from '../lib/s3.js';
import { vaultAuthed } from './vault.js';

const STREAM_THRESHOLD = 50 * 1024 * 1024; // 50 MB

/**
 * GET /api/download?key=photos/pic.jpg
 * Small files stream through Worker; large files redirect to presigned URL.
 * Inline mode (?inline=1) always streams through Worker with Range support.
 * @param {Request} req
 * @param {object} env
 * @param {R2Bucket} env.BUCKET
 * @param {import('@aws-sdk/client-s3').S3Client} env._s3
 * @param {string} env._bucketName
 */
export const handleDownload = async (req, env) => {
	const url = new URL(req.url);
	const key = url.searchParams.get('key');
	if (!key) return error('Missing "key" parameter');
	if (key.startsWith('__vault/') && !(await vaultAuthed(req, env))) return error('Vault locked', 403);

	const head = await env.BUCKET.head(key);
	if (!head) return error('Not found', 404);

	const filename = key.split('/').pop() || 'download';
	const inline = url.searchParams.get('inline') === '1';
	const disposition = inline ? 'inline' : `attachment; filename="${filename}"`;
	const contentType = head.httpMetadata?.contentType || 'application/octet-stream';

	// Large files: redirect to presigned URL (skip for inline to preserve CORS)
	if (!inline && head.size > STREAM_THRESHOLD) {
		const presignedUrl = await presignGet(env._s3, env._bucketName, key, 600);
		return Response.redirect(presignedUrl, 302);
	}

	// Handle Range requests for seeking support
	const rangeHeader = req.headers.get('Range');
	if (rangeHeader) {
		const { start, end } = parseRange(rangeHeader, head.size);
		const length = end - start + 1;

		const obj = await env.BUCKET.get(key, { range: { offset: start, length } });
		if (!obj) return error('Not found', 404);

		return new Response(obj.body, {
			status: 206,
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': disposition,
				'Content-Length': String(length),
				'Content-Range': `bytes ${start}-${end}/${head.size}`,
				'Accept-Ranges': 'bytes',
			},
		});
	}

	// Full file stream
	const obj = await env.BUCKET.get(key);
	if (!obj) return error('Not found', 404);

	return new Response(obj.body, {
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': disposition,
			'Content-Length': String(head.size),
			'Accept-Ranges': 'bytes',
		},
	});
};

/**
 * Parse a Range header into start/end byte offsets.
 * @param {string} range - e.g. "bytes=0-1023"
 * @param {number} total - total file size
 * @returns {{ start: number, end: number }}
 */
const parseRange = (range, total) => {
	const match = range.match(/bytes=(\d*)-(\d*)/);
	if (!match) return { start: 0, end: total - 1 };

	let start = match[1] ? parseInt(match[1], 10) : 0;
	let end = match[2] ? parseInt(match[2], 10) : total - 1;

	if (start >= total) start = total - 1;
	if (end >= total) end = total - 1;

	return { start, end };
};
