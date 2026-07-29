import { json, error, formatSize } from '../lib/utils.js';

/**
 * Hidden, passphrase-gated vault.
 *
 * Files live under the __vault/ prefix (already hidden from normal listings by
 * the __-prefix filter). Access is gated SERVER-SIDE: listing and downloading
 * __vault/ content requires a valid session cookie, issued only after the
 * passphrase verifies. Files are NOT encrypted — the passphrase gates access,
 * it doesn't transform data, so you can never be locked out of your files
 * (reset by deleting __vault/.auth from R2).
 */

const VAULT_PREFIX = '__vault/';
const AUTH_KEY = '__vault/.auth';
const ITERATIONS = 100000; // Cloudflare Workers caps PBKDF2 at 100k
const SESSION_TTL = 3600; // seconds
const COOKIE = 'uv_session';

const enc = new TextEncoder();

/** @param {ArrayBuffer|Uint8Array} bytes */
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
/** @param {string} s */
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/'));

/**
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @returns {Promise<Uint8Array>}
 */
const deriveHash = async (passphrase, salt, iterations) => {
	const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km, 256);
	return new Uint8Array(bits);
};

/** Constant-time comparison. */
const timingSafeEq = (a, b) => {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
	return r === 0;
};

const readVerifier = async (env) => {
	const obj = await env.BUCKET.get(AUTH_KEY);
	if (!obj) return null;
	try { return JSON.parse(await obj.text()); } catch { return null; }
};

const writeVerifier = async (env, verifier) => {
	await env.BUCKET.put(AUTH_KEY, JSON.stringify(verifier), {
		httpMetadata: { contentType: 'application/json' },
	});
};

/** Session token is HMAC-signed with the verifier hash — so resetting the passphrase invalidates old sessions. */
const hmacKey = (hashB64) =>
	crypto.subtle.importKey('raw', unb64(hashB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

const makeToken = async (verifier) => {
	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
	const payload = b64url(enc.encode(JSON.stringify({ exp })));
	const sig = await crypto.subtle.sign('HMAC', await hmacKey(verifier.hash), enc.encode(payload));
	return `${payload}.${b64url(sig)}`;
};

const verifyToken = async (token, verifier) => {
	if (!token || !verifier) return false;
	const [payload, sig] = token.split('.');
	if (!payload || !sig) return false;
	const ok = await crypto.subtle.verify('HMAC', await hmacKey(verifier.hash), unb64url(sig), enc.encode(payload));
	if (!ok) return false;
	try {
		const { exp } = JSON.parse(new TextDecoder().decode(unb64url(payload)));
		return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
	} catch { return false; }
};

const getCookie = (req, name) => {
	const m = (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
	return m ? m[1] : null;
};

const sessionCookie = (req, token) => {
	const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
	return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}${secure}`;
};
const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

/**
 * Whether the request carries a valid vault session. Used by the core
 * download/presign guards to protect __vault/ keys.
 * @param {Request} req
 * @param {object} env
 * @returns {Promise<boolean>}
 */
export const vaultAuthed = async (req, env) => {
	const token = getCookie(req, COOKIE);
	if (!token) return false;
	return verifyToken(token, await readVerifier(env));
};

/** GET /api/vault/status → { configured, unlocked } */
export const handleVaultStatus = async (req, env) => {
	const verifier = await readVerifier(env);
	return json({ configured: !!verifier, unlocked: verifier ? await verifyToken(getCookie(req, COOKIE), verifier) : false });
};

/** POST /api/vault/setup { passphrase } — only when not yet configured */
export const handleVaultSetup = async (req, env) => {
	if (await readVerifier(env)) return error('Vault already configured', 409);
	const { passphrase } = await req.json();
	if (!passphrase || passphrase.length < 6) return error('Passphrase must be at least 6 characters', 400);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const verifier = { salt: b64(salt), iterations: ITERATIONS, hash: b64(await deriveHash(passphrase, salt, ITERATIONS)) };
	await writeVerifier(env, verifier);
	return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, await makeToken(verifier)) });
};

/** POST /api/vault/unlock { passphrase } */
export const handleVaultUnlock = async (req, env) => {
	const verifier = await readVerifier(env);
	if (!verifier) return error('Vault not configured', 404);
	const { passphrase } = await req.json();
	if (!passphrase) return error('Missing passphrase', 400);
	const hash = await deriveHash(passphrase, unb64(verifier.salt), verifier.iterations);
	if (!timingSafeEq(hash, unb64(verifier.hash))) return error('Incorrect passphrase', 401);
	return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, await makeToken(verifier)) });
};

/** POST /api/vault/lock */
export const handleVaultLock = async () => json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });

/** POST /api/vault/change { current, next } */
export const handleVaultChange = async (req, env) => {
	const verifier = await readVerifier(env);
	if (!verifier) return error('Vault not configured', 404);
	const { current, next } = await req.json();
	if (!next || next.length < 6) return error('New passphrase must be at least 6 characters', 400);
	const hash = await deriveHash(current || '', unb64(verifier.salt), verifier.iterations);
	if (!timingSafeEq(hash, unb64(verifier.hash))) return error('Incorrect current passphrase', 401);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const newVerifier = { salt: b64(salt), iterations: ITERATIONS, hash: b64(await deriveHash(next, salt, ITERATIONS)) };
	await writeVerifier(env, newVerifier);
	return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, await makeToken(newVerifier)) });
};

/** GET /api/vault/list?prefix=__vault/... — requires an unlocked session */
export const handleVaultList = async (req, env) => {
	if (!(await vaultAuthed(req, env))) return error('Vault locked', 403);
	const url = new URL(req.url);
	const prefix = url.searchParams.get('prefix') || VAULT_PREFIX;
	if (!prefix.startsWith(VAULT_PREFIX)) return error('Invalid prefix', 400);

	const rows = await env.DB.prepare(
		`SELECT r2_key, name, parent, type, size, updated_at FROM files
		 WHERE parent = ? AND deleted_at IS NULL
		 ORDER BY type = 'folder' DESC, name ASC`
	).bind(prefix).all();

	const folders = [];
	const files = [];
	for (const row of rows.results) {
		if (row.name.startsWith('.')) continue; // hide .auth and friends
		if (row.type === 'folder') {
			folders.push({ key: row.r2_key, name: row.name, type: 'folder', size: 0, sizeFormatted: '—', modified: row.updated_at });
		} else {
			files.push({ key: row.r2_key, name: row.name, type: row.type, size: row.size, sizeFormatted: formatSize(row.size), modified: row.updated_at, url: null });
		}
	}
	return json({ folders, files, prefix });
};
