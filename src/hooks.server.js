import { createS3Client, createAwsClient } from '../worker/src/lib/s3.js';
import { handleList } from '../worker/src/routes/list.js';
import { handleUpload, handleUploadCheck } from '../worker/src/routes/upload.js';
import { handleDownload } from '../worker/src/routes/download.js';
import { handleDelete, handleRestore, handleListTrash, handlePurgeTrash } from '../worker/src/routes/delete.js';
import { handleRename } from '../worker/src/routes/rename.js';
import { handleMove } from '../worker/src/routes/move.js';
import { handleFlatten } from '../worker/src/routes/flatten.js';
import { handleVaultStatus, handleVaultSetup, handleVaultUnlock, handleVaultLock, handleVaultChange, handleVaultList } from '../worker/src/routes/vault.js';
import { handleCopy } from '../worker/src/routes/copy.js';
import { handleCreateFolder } from '../worker/src/routes/folder.js';
import { handleGetThumb, handleSaveThumb, handlePresign } from '../worker/src/routes/thumb.js';
import { handleMultipartCreate, handleMultipartUploadPart, handleMultipartComplete, handleMultipartAbort } from '../worker/src/routes/multipart.js';
import { handleGetConfig, handlePutConfig } from '../worker/src/routes/config.js';
import { handleStats } from '../worker/src/routes/stats.js';
import { handleSearch } from '../worker/src/routes/search.js';
import { handleMigrate } from '../worker/src/routes/migrate.js';
import { handleVerify, handleVerifyCleanup } from '../worker/src/routes/verify.js';
import { handleDuplicates } from '../worker/src/routes/duplicates.js';
import { handleCreateShare, handleListShares, handleDeleteShare, handlePublicShare } from '../worker/src/routes/share.js';
import { pluginRoutes } from '../worker/src/active-plugins.js';
import { error } from '../worker/src/lib/utils.js';

const routes = [
	{ method: 'GET', path: '/api/files', handler: handleList },
	{ method: 'POST', path: '/api/upload', handler: handleUpload },
	{ method: 'POST', path: '/api/upload/check', handler: handleUploadCheck },
	{ method: 'GET', path: '/api/download', handler: handleDownload },
	{ method: 'POST', path: '/api/delete', handler: handleDelete },
	{ method: 'POST', path: '/api/rename', handler: handleRename },
	{ method: 'POST', path: '/api/move', handler: handleMove },
	{ method: 'POST', path: '/api/flatten', handler: handleFlatten },
	{ method: 'GET', path: '/api/vault/status', handler: handleVaultStatus },
	{ method: 'POST', path: '/api/vault/setup', handler: handleVaultSetup },
	{ method: 'POST', path: '/api/vault/unlock', handler: handleVaultUnlock },
	{ method: 'POST', path: '/api/vault/lock', handler: handleVaultLock },
	{ method: 'POST', path: '/api/vault/change', handler: handleVaultChange },
	{ method: 'GET', path: '/api/vault/list', handler: handleVaultList },
	{ method: 'POST', path: '/api/copy', handler: handleCopy },
	{ method: 'POST', path: '/api/folder', handler: handleCreateFolder },
	{ method: 'GET', path: '/api/presign', handler: handlePresign },
	{ method: 'GET', path: '/api/thumb', handler: handleGetThumb },
	{ method: 'POST', path: '/api/thumb', handler: handleSaveThumb },
	{ method: 'GET', path: '/api/trash', handler: handleListTrash },
	{ method: 'POST', path: '/api/trash/restore', handler: handleRestore },
	{ method: 'POST', path: '/api/trash/purge', handler: handlePurgeTrash },
	{ method: 'POST', path: '/api/upload/multipart/create', handler: handleMultipartCreate },
	{ method: 'POST', path: '/api/upload/multipart/upload-part', handler: handleMultipartUploadPart },
	{ method: 'POST', path: '/api/upload/multipart/complete', handler: handleMultipartComplete },
	{ method: 'POST', path: '/api/upload/multipart/abort', handler: handleMultipartAbort },
	{ method: 'GET', path: '/api/config/:key', handler: handleGetConfig },
	{ method: 'PUT', path: '/api/config/:key', handler: handlePutConfig },
	{ method: 'GET', path: '/api/search', handler: handleSearch },
	{ method: 'GET', path: '/api/stats', handler: handleStats },
	{ method: 'POST', path: '/api/migrate', handler: handleMigrate },
	{ method: 'GET', path: '/api/verify', handler: handleVerify },
	{ method: 'POST', path: '/api/verify', handler: handleVerifyCleanup },
	{ method: 'GET', path: '/api/duplicates', handler: handleDuplicates },
	{ method: 'POST', path: '/api/share', handler: handleCreateShare },
	{ method: 'GET', path: '/api/shares', handler: handleListShares },
	{ method: 'DELETE', path: '/api/share/:token', handler: handleDeleteShare },
	// Optional plugin routes (empty in the pure-drive build)
	...pluginRoutes,
];

let compiledRoutes;
const getRoutes = () => {
	if (!compiledRoutes) {
		compiledRoutes = routes.map((r) => ({
			...r,
			pattern: new URLPattern({ pathname: r.path }),
		}));
	}
	return compiledRoutes;
};

const setupEnv = (env) => {
	env._bucketName = env.BUCKET_NAME || 'cloudvault-dev';
	if (env.R2_ACCESS_KEY_ID) {
		env._s3 = createS3Client(env);
		env._aws = createAwsClient(env);
	}
};

/** @type {import('@sveltejs/kit').Handle} */
export const handle = async ({ event, resolve }) => {
	const url = new URL(event.request.url);
	const method = event.request.method;

	// Only intercept /api/* and /s/* in production (platform available)
	if (!event.platform?.env) return resolve(event);

	const isApi = url.pathname.startsWith('/api/');
	const isShare = url.pathname.startsWith('/s/');
	if (!isApi && !isShare) return resolve(event);

	const env = event.platform.env;
	setupEnv(env);

	// Public share route
	if (isShare && method === 'GET') {
		const sharePattern = new URLPattern({ pathname: '/s/:token' });
		const match = sharePattern.exec(event.request.url);
		if (match) {
			const params = match.pathname?.groups || {};
			return handlePublicShare(event.request, env, params);
		}
	}

	// API routes
	for (const route of getRoutes()) {
		if (method !== route.method) continue;
		const match = route.pattern.exec(event.request.url);
		if (match) {
			try {
				const params = match.pathname?.groups || {};
				return await route.handler(event.request, env, params);
			} catch (e) {
				console.error(`Error in ${route.path}:`, e);
				return error(e.message || 'Internal error', 500);
			}
		}
	}

	return error('Not found', 404);
};
