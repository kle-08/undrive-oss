import { json, error } from '../lib/utils.js';

/**
 * GET /api/config/:key
 * Reads __config/{key}.json from R2.
 */
export const handleGetConfig = async (req, env, { key }) => {
	const obj = await env.BUCKET.get(`__config/${key}.json`);
	if (!obj) return json({});
	const data = await obj.json();
	return json(data);
};

/**
 * PUT /api/config/:key
 * Writes JSON to __config/{key}.json in R2.
 */
export const handlePutConfig = async (req, env, { key }) => {
	const body = await req.json();
	await env.BUCKET.put(`__config/${key}.json`, JSON.stringify(body), {
		httpMetadata: { contentType: 'application/json' },
	});
	return json({ ok: true });
};
