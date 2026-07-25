import { error } from '../lib/utils.js';

/**
 * Generate a 24-char URL-safe random token.
 * @returns {string}
 */
const generateToken = () => {
	const bytes = new Uint8Array(18);
	crypto.getRandomValues(bytes);
	// Base64url encoding (no padding)
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
};

/**
 * Hash a password using SHA-256 for share link protection.
 * @param {string} password
 * @returns {Promise<string>}
 */
const hashPassword = async (password) => {
	const data = new TextEncoder().encode(password);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * POST /api/share — Create a share link.
 * Body: { key, expiresIn?, maxDownloads?, password? }
 * expiresIn: "1h" | "24h" | "7d" | "30d" | null (never)
 * @param {Request} req
 * @param {object} env
 */
export const handleCreateShare = async (req, env) => {
	const body = await req.json();
	const { key, expiresIn, maxDownloads, password } = body;

	if (!key) return error('Missing "key"');

	// Verify file exists in R2
	const head = await env.BUCKET.head(key);
	if (!head) return error('File not found', 404);

	const filename = key.split('/').pop() || 'download';
	const token = generateToken();

	// Calculate expiry
	let expiresAt = null;
	if (expiresIn) {
		const now = Date.now();
		const durations = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
		const ms = durations[expiresIn];
		if (ms) expiresAt = new Date(now + ms).toISOString();
	}

	// Hash password if provided
	const passwordHash = password ? await hashPassword(password) : null;

	await env.DB.prepare(
		`INSERT INTO shares (token, r2_key, filename, expires_at, max_downloads, password_hash)
		 VALUES (?, ?, ?, ?, ?, ?)`
	).bind(token, key, filename, expiresAt, maxDownloads ?? null, passwordHash).run();

	return Response.json({ token, expiresAt, maxDownloads });
};

/**
 * GET /api/shares — List active share links.
 * @param {Request} req
 * @param {object} env
 */
export const handleListShares = async (req, env) => {
	const { results } = await env.DB.prepare(
		`SELECT token, r2_key, filename, created_at, expires_at, max_downloads, download_count,
		        CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password
		 FROM shares ORDER BY created_at DESC`
	).all();

	return Response.json({ shares: results });
};

/**
 * DELETE /api/share/:token — Revoke a share link.
 * @param {Request} req
 * @param {object} env
 * @param {{ token: string }} params
 */
export const handleDeleteShare = async (req, env, params) => {
	const { token } = params;
	if (!token) return error('Missing token');

	const result = await env.DB.prepare('DELETE FROM shares WHERE token = ?').bind(token).run();

	if (result.meta.changes === 0) return error('Share not found', 404);
	return Response.json({ deleted: true });
};

/**
 * GET /s/:token — Public file access (no auth required).
 * Optional query: ?p=password
 * @param {Request} req
 * @param {object} env
 * @param {{ token: string }} params
 */
export const handlePublicShare = async (req, env, params) => {
	const { token } = params;
	if (!token) return error('Invalid share link', 400);

	const share = await env.DB.prepare(
		'SELECT * FROM shares WHERE token = ?'
	).bind(token).first();

	if (!share) {
		return new Response(errorPage('Link not found', 'This share link does not exist or has been revoked.'), {
			status: 404, headers: { ...securityHeaders(), 'Content-Type': 'text/html;charset=UTF-8' },
		});
	}

	// Check expiry
	if (share.expires_at && new Date(share.expires_at) < new Date()) {
		await env.DB.prepare('DELETE FROM shares WHERE token = ?').bind(token).run();
		return new Response(errorPage('Link expired', 'This share link has expired and is no longer available.'), {
			status: 410, headers: { ...securityHeaders(), 'Content-Type': 'text/html;charset=UTF-8' },
		});
	}

	// Check download limit
	if (share.max_downloads && share.download_count >= share.max_downloads) {
		return new Response(errorPage('Download limit reached', 'This file has reached its maximum number of downloads.'), {
			status: 410, headers: { ...securityHeaders(), 'Content-Type': 'text/html;charset=UTF-8' },
		});
	}

	// Check password
	if (share.password_hash) {
		const url = new URL(req.url);
		const password = url.searchParams.get('p');
		if (!password) {
			return new Response(passwordPage(share.filename, token, ''), {
				status: 401,
				headers: { ...securityHeaders(), 'Content-Type': 'text/html;charset=UTF-8' },
			});
		}
		const hash = await hashPassword(password);
		if (hash !== share.password_hash) {
			return new Response(passwordPage(share.filename, token, 'Wrong password'), {
				status: 403,
				headers: { ...securityHeaders(), 'Content-Type': 'text/html;charset=UTF-8' },
			});
		}
	}

	// Fetch from R2
	const head = await env.BUCKET.head(share.r2_key);
	if (!head) return error('File no longer exists', 404);

	const contentType = head.httpMetadata?.contentType || 'application/octet-stream';
	const isInline = isInlineType(contentType);
	const disposition = isInline
		? `inline; filename="${share.filename}"`
		: `attachment; filename="${share.filename}"`;

	// Handle Range requests
	const rangeHeader = req.headers.get('Range');
	if (rangeHeader) {
		const { start, end } = parseRange(rangeHeader, head.size);
		const length = end - start + 1;
		const obj = await env.BUCKET.get(share.r2_key, { range: { offset: start, length } });
		if (!obj) return error('File not found', 404);

		// Increment download count
		await env.DB.prepare(
			'UPDATE shares SET download_count = download_count + 1 WHERE token = ?'
		).bind(token).run();

		return new Response(obj.body, {
			status: 206,
			headers: {
				...securityHeaders(),
				'Content-Type': contentType,
				'Content-Disposition': disposition,
				'Content-Length': String(length),
				'Content-Range': `bytes ${start}-${end}/${head.size}`,
				'Accept-Ranges': 'bytes',
			},
		});
	}

	// Full file
	const obj = await env.BUCKET.get(share.r2_key);
	if (!obj) return error('File not found', 404);

	// Increment download count
	await env.DB.prepare(
		'UPDATE shares SET download_count = download_count + 1 WHERE token = ?'
	).bind(token).run();

	return new Response(obj.body, {
		headers: {
			...securityHeaders(),
			'Content-Type': contentType,
			'Content-Disposition': disposition,
			'Content-Length': String(head.size),
			'Accept-Ranges': 'bytes',
		},
	});
};

/** Security headers for public share responses */
const securityHeaders = () => ({
	'Referrer-Policy': 'no-referrer',
	'X-Robots-Tag': 'noindex, nofollow',
	'X-Content-Type-Options': 'nosniff',
	'Cache-Control': 'private, no-store',
});

/** Check if content type should be displayed inline */
const isInlineType = (/** @type {string} */ ct) =>
	ct.startsWith('image/') || ct.startsWith('video/') || ct.startsWith('audio/') || ct === 'application/pdf';

/**
 * Render an HTML password prompt page.
 * @param {string} filename
 * @param {string} token
 * @param {string} errorMsg
 * @returns {string}
 */
const passwordPage = (filename, token, errorMsg) => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Password required</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:32px;max-width:380px;width:100%}
h2{font-size:16px;margin-bottom:4px}
.file{font-size:13px;color:#888;margin-bottom:20px;word-break:break-all}
.error{font-size:13px;color:#e74c3c;margin-bottom:12px}
label{font-size:12px;color:#888;display:block;margin-bottom:6px}
input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #333;background:#0a0a0a;color:#e5e5e5;font-size:14px;outline:none;margin-bottom:16px}
input:focus{border-color:#4f9cf7}
button{width:100%;padding:10px;border-radius:8px;background:#4f9cf7;color:#fff;font-size:14px;font-weight:500;border:none;cursor:pointer}
button:hover{opacity:.85}
</style>
</head><body>
<div class="card">
<h2>Password required</h2>
<div class="file">${escapeHtml(filename)}</div>
${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ''}
<form method="get" action="/s/${token}">
<label for="p">Enter password to access this file</label>
<input type="password" name="p" id="p" autofocus required>
<button type="submit">Access file</button>
</form>
</div>
</body></html>`;

/**
 * Render an HTML error page for share links.
 * @param {string} title
 * @param {string} message
 * @returns {string}
 */
const errorPage = (title, message) => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:32px;max-width:380px;width:100%;text-align:center}
h2{font-size:16px;margin-bottom:8px}
p{font-size:13px;color:#888;line-height:1.5}
</style>
</head><body>
<div class="card">
<h2>${escapeHtml(title)}</h2>
<p>${escapeHtml(message)}</p>
</div>
</body></html>`;

/** @param {string} str */
const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Parse a Range header.
 * @param {string} range
 * @param {number} total
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
