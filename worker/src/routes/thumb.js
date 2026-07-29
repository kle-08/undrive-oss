import { error } from '../lib/utils.js';
import { presignGet } from '../lib/s3.js';
import { vaultAuthed } from './vault.js';

const THUMB_PREFIX = '__thumbs/';
const PRESIGN_EXPIRY = 604800; // 7 days

/**
 * GET /api/presign?key=photos/pic.jpg[&full=1]
 * Returns a 302 redirect to a presigned R2 URL.
 * By default serves the cached __thumbs/ version when one exists (fast, small —
 * good for grids). Pass full=1 to serve the original (e.g. the lightbox viewer).
 * RAW images always resolve to their __thumbs/ JPEG preview (the raw file can't
 * render in a browser).
 */
export const handlePresign = async (req, env) => {
	const url = new URL(req.url);
	const key = url.searchParams.get('key');
	if (!key) return error('Missing "key" parameter');
	if (!env._s3) return error('S3 not configured', 500);
	if (key.startsWith('__vault/') && !(await vaultAuthed(req, env))) return error('Vault locked', 403);

	const full = url.searchParams.get('full') === '1';
	const thumbKey = `${THUMB_PREFIX}${key}.jpg`;

	const ext = key.split('.').pop()?.toLowerCase() ?? '';
	const RAW_EXTS = ['dng', 'cr2', 'cr3', 'nef', 'arw', 'orf', 'rw2', 'raf'];
	if (RAW_EXTS.includes(ext)) {
		const thumbHead = await env.BUCKET.head(thumbKey);
		if (thumbHead) {
			const presigned = await presignGet(env._s3, env._bucketName, thumbKey, PRESIGN_EXPIRY);
			return Response.redirect(presigned, 302);
		}
		return error('No thumbnail', 404);
	}

	if (!full) {
		const thumbHead = await env.BUCKET.head(thumbKey);
		if (thumbHead) {
			const presigned = await presignGet(env._s3, env._bucketName, thumbKey, PRESIGN_EXPIRY);
			return Response.redirect(presigned, 302);
		}
	}

	const presigned = await presignGet(env._s3, env._bucketName, key);
	return Response.redirect(presigned, 302);
};

/**
 * GET /api/thumb?key=photos/video.mp4
 * Returns presigned URL for cached thumbnail, or 404 if not cached yet.
 * @param {Request} req
 * @param {object} env
 */
export const handleGetThumb = async (req, env) => {
	const url = new URL(req.url);
	const key = url.searchParams.get('key');
	if (!key) return error('Missing "key" parameter');
	if (key.startsWith('__vault/') && !(await vaultAuthed(req, env))) return error('Vault locked', 403);

	const thumbKey = `${THUMB_PREFIX}${key}.jpg`;
	const head = await env.BUCKET.head(thumbKey);

	if (!head) {
		return new Response(JSON.stringify({ cached: false }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const thumbUrl = await presignGet(env._s3, env._bucketName, thumbKey, PRESIGN_EXPIRY);
	return new Response(JSON.stringify({ cached: true, url: thumbUrl }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};

/**
 * POST /api/thumb?key=photos/video.mp4
 * Save a generated thumbnail (JPEG body).
 * @param {Request} req
 * @param {object} env
 */
export const handleSaveThumb = async (req, env) => {
	const url = new URL(req.url);
	const key = url.searchParams.get('key');
	if (!key) return error('Missing "key" parameter');

	const thumbKey = `${THUMB_PREFIX}${key}.jpg`;

	await env.BUCKET.put(thumbKey, req.body, {
		httpMetadata: { contentType: 'image/jpeg' },
	});

	const thumbUrl = await presignGet(env._s3, env._bucketName, thumbKey, PRESIGN_EXPIRY);
	return new Response(JSON.stringify({ cached: true, url: thumbUrl }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};
