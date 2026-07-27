import { createS3Client, createAwsClient } from './lib/s3.js';
import { error } from './lib/utils.js';
import { handleList } from './routes/list.js';
import { handleUpload, handleUploadCheck } from './routes/upload.js';
import { handleDownload } from './routes/download.js';
import { handleDelete, handleRestore, handleListTrash, handlePurgeTrash } from './routes/delete.js';
import { handleRename } from './routes/rename.js';
import { handleMove } from './routes/move.js';
import { handleFlatten } from './routes/flatten.js';
import { handleCopy } from './routes/copy.js';
import { handleCreateFolder } from './routes/folder.js';
import { handleGetThumb, handleSaveThumb, handlePresign } from './routes/thumb.js';
import { handleMultipartCreate, handleMultipartUploadPart, handleMultipartComplete, handleMultipartAbort } from './routes/multipart.js';
import { handleGetConfig, handlePutConfig } from './routes/config.js';
import { handleStats } from './routes/stats.js';
import { handleSearch } from './routes/search.js';
import { handleMigrate } from './routes/migrate.js';
import { handleVerify, handleVerifyCleanup } from './routes/verify.js';
import { handleDuplicates } from './routes/duplicates.js';
import { handleCreateShare, handleListShares, handleDeleteShare, handlePublicShare } from './routes/share.js';
import { pluginRoutes } from './active-plugins.js';
import { handleScheduled } from './cron.js';

/**
 * Add CORS headers to a response.
 * @param {Response} res
 * @param {string} origin
 * @returns {Response}
 */
const withCors = (res, origin) => {
	const headers = new Headers(res.headers);
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Access-Control-Allow-Credentials', 'true');
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

/**
 * Validate Cloudflare Access JWT.
 * In production, checks the CF-Access-JWT-Assertion header.
 * In dev (no CF_ACCESS_TEAM set), skips auth.
 * @param {Request} req
 * @param {object} env
 * @returns {Response | null} - Returns error response if invalid, null if valid
 */
const verifyAuth = async (req, env) => {
	// Auth is handled by Cloudflare Access in front of the Pages site.
	// Worker-side JWT check disabled — re-enable when using a custom domain
	// that shares cookies between frontend and API.
	return null;
};

/** @type {Array<{ method: string, pattern: URLPattern, handler: Function }>} */
const routes = [
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/files' }), handler: handleList },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/upload' }), handler: handleUpload },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/upload/check' }), handler: handleUploadCheck },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/download' }), handler: handleDownload },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/delete' }), handler: handleDelete },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/rename' }), handler: handleRename },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/move' }), handler: handleMove },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/flatten' }), handler: handleFlatten },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/copy' }), handler: handleCopy },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/folder' }), handler: handleCreateFolder },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/presign' }), handler: handlePresign },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/thumb' }), handler: handleGetThumb },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/thumb' }), handler: handleSaveThumb },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/trash' }), handler: handleListTrash },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/trash/restore' }), handler: handleRestore },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/trash/purge' }), handler: handlePurgeTrash },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/upload/multipart/create' }), handler: handleMultipartCreate },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/upload/multipart/upload-part' }), handler: handleMultipartUploadPart },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/upload/multipart/complete' }), handler: handleMultipartComplete },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/upload/multipart/abort' }), handler: handleMultipartAbort },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/config/:key' }), handler: handleGetConfig },
	{ method: 'PUT', pattern: new URLPattern({ pathname: '/api/config/:key' }), handler: handlePutConfig },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/search' }), handler: handleSearch },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/stats' }), handler: handleStats },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/migrate' }), handler: handleMigrate },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/verify' }), handler: handleVerify },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/verify' }), handler: handleVerifyCleanup },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/duplicates' }), handler: handleDuplicates },
	{ method: 'POST', pattern: new URLPattern({ pathname: '/api/share' }), handler: handleCreateShare },
	{ method: 'GET', pattern: new URLPattern({ pathname: '/api/shares' }), handler: handleListShares },
	{ method: 'DELETE', pattern: new URLPattern({ pathname: '/api/share/:token' }), handler: handleDeleteShare },
	// Optional plugin routes (empty in the pure-drive build)
	...pluginRoutes.map((r) => ({
		method: r.method,
		pattern: new URLPattern({ pathname: r.path }),
		handler: r.handler,
	})),
];

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(handleScheduled(env));
	},

	/**
	 * @param {Request} req
	 * @param {object} env
	 * @param {R2Bucket} env.BUCKET
	 * @param {string} env.ALLOWED_ORIGIN
	 * @param {string} env.R2_ACCESS_KEY_ID
	 * @param {string} env.R2_SECRET_ACCESS_KEY
	 * @param {string} env.R2_ENDPOINT
	 */
	async fetch(req, env) {
		const origin = req.headers.get('Origin') || env.ALLOWED_ORIGIN || '*';

		try {
			// Handle CORS preflight
			if (req.method === 'OPTIONS') {
				return new Response(null, {
					status: 204,
					headers: {
						'Access-Control-Allow-Origin': origin,
						'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type, CF-Access-JWT-Assertion',
						'Access-Control-Allow-Credentials': 'true',
						'Access-Control-Max-Age': '86400',
					},
				});
			}

			// Public share endpoint (no auth)
			const sharePattern = new URLPattern({ pathname: '/s/:token' });
			const shareMatch = sharePattern.exec(req.url);
			if (shareMatch && req.method === 'GET') {
				const params = shareMatch.pathname?.groups || {};
				const res = await handlePublicShare(req, env, params);
				return res;
			}

			// Auth check
			const authError = await verifyAuth(req, env);
			if (authError) return withCors(authError, origin);

			// Lazily attach S3 client and aws4fetch client to env for route handlers
			env._bucketName = env.BUCKET_NAME || 'cloudvault-dev';
			if (env.R2_ACCESS_KEY_ID) {
				env._s3 = createS3Client(env);
				env._aws = createAwsClient(env);
			}

			// Route matching
			for (const route of routes) {
				if (req.method !== route.method) continue;
				const match = route.pattern.exec(req.url);
				if (match) {
					try {
						const params = match.pathname?.groups || {};
						const res = await route.handler(req, env, params);
						return withCors(res, origin);
					} catch (e) {
						console.error(`Error in ${route.pattern.pathname}:`, e);
						return withCors(error(e.message || 'Internal error', 500), origin);
					}
				}
			}

			return withCors(error('Not found', 404), origin);
		} catch (e) {
			console.error('Top-level Worker error:', e);
			return withCors(error(e.message || 'Internal server error', 500), origin);
		}
	},

};
