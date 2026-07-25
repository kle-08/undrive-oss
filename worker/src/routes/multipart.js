import { json, error, keyName, inferType, ensureParentFolders } from '../lib/utils.js';

/**
 * POST /api/upload/multipart/create
 * Initiate a multipart upload.
 * @param {Request} req
 * @param {object} env
 */
export const handleMultipartCreate = async (req, env) => {
	const { key, contentType } = await req.json();
	if (!key) return error('Missing "key"');

	const upload = await env.BUCKET.createMultipartUpload(key, {
		httpMetadata: { contentType: contentType || 'application/octet-stream' },
	});

	return json({ key: upload.key, uploadId: upload.uploadId });
};

/**
 * POST /api/upload/multipart/upload-part?key=...&uploadId=...&partNumber=N
 * Receive a chunk and upload it to R2 via the binding.
 * @param {Request} req
 * @param {object} env
 */
export const handleMultipartUploadPart = async (req, env) => {
	const url = new URL(req.url);
	const key = url.searchParams.get('key');
	const uploadId = url.searchParams.get('uploadId');
	const partNumber = parseInt(url.searchParams.get('partNumber') || '0', 10);
	if (!key || !uploadId || !partNumber) return error('Missing key, uploadId, or partNumber');

	const body = await req.arrayBuffer();
	const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
	const part = await upload.uploadPart(partNumber, body);

	return json({ partNumber: part.partNumber, etag: part.etag });
};

/**
 * POST /api/upload/multipart/complete
 * Complete the multipart upload with assembled parts.
 * @param {Request} req
 * @param {object} env
 */
export const handleMultipartComplete = async (req, env) => {
	const { key, uploadId, parts, size } = await req.json();
	if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
		return error('Missing key, uploadId, or parts');
	}

	const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
	await upload.complete(parts);

	await ensureParentFolders(env, key);

	const name = keyName(key);
	const parent = key.slice(0, key.lastIndexOf('/') + 1);
	const type = inferType(key);
	const fileSize = size || 0;
	const now = new Date().toISOString();

	await env.DB.prepare(
		`INSERT INTO files (id, r2_key, name, parent, type, size, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(r2_key) DO UPDATE SET size = ?, updated_at = ?, deleted_at = NULL`
	).bind(crypto.randomUUID(), key, name, parent, type, fileSize, now, now, fileSize, now).run();

	return json({ key });
};

/**
 * POST /api/upload/multipart/abort
 * Abort an in-progress multipart upload.
 * @param {Request} req
 * @param {object} env
 */
export const handleMultipartAbort = async (req, env) => {
	const { key, uploadId } = await req.json();
	if (!key || !uploadId) return error('Missing key or uploadId');

	const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
	await upload.abort();

	return json({ aborted: true });
};
