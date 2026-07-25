import * as api from '$lib/api/client.js';
import { toast } from '$lib/stores/toast.svelte.js';

const state = $state({
	/** @type {boolean} */
	open: false,
	/** @type {string} */
	key: '',
	/** @type {string} */
	filename: '',
	/** @type {string} */
	shareUrl: '',
	/** @type {boolean} */
	creating: false,
	/** @type {string} */
	expiresIn: '7d',
	/** @type {string} */
	password: '',
	/** @type {boolean} */
	managerOpen: false,
	/** @type {any[]} */
	shares: [],
	/** @type {boolean} */
	loadingShares: false,
});

export const sharing = {
	get open() { return state.open; },
	get key() { return state.key; },
	get filename() { return state.filename; },
	get shareUrl() { return state.shareUrl; },
	get creating() { return state.creating; },
	get expiresIn() { return state.expiresIn; },
	get password() { return state.password; },
	get managerOpen() { return state.managerOpen; },
	get shares() { return state.shares; },
	get loadingShares() { return state.loadingShares; },

	/**
	 * @param {string} key
	 * @param {string} filename
	 */
	openDialog(key, filename) {
		state.key = key;
		state.filename = filename;
		state.shareUrl = '';
		state.creating = false;
		state.expiresIn = '7d';
		state.password = '';
		state.open = true;
	},

	close() {
		state.open = false;
		state.key = '';
		state.filename = '';
		state.shareUrl = '';
	},

	/** @param {string} val */
	setExpiresIn(val) { state.expiresIn = val; },

	/** @param {string} val */
	setPassword(val) { state.password = val; },

	async createLink() {
		if (state.creating) return;
		state.creating = true;
		try {
			const options = {
				expiresIn: state.expiresIn || undefined,
				password: state.password || undefined,
			};
			const { token } = await api.createShare(state.key, options);
			state.shareUrl = api.getShareUrl(token);
		} catch (e) {
			toast.error(e.message || 'Failed to create share link');
		} finally {
			state.creating = false;
		}
	},

	async copyUrl() {
		if (!state.shareUrl) return;
		try {
			await navigator.clipboard.writeText(state.shareUrl);
			toast.success('Link copied to clipboard');
		} catch {
			toast.error('Failed to copy link');
		}
	},

	async openManager() {
		state.managerOpen = true;
		state.loadingShares = true;
		try {
			const { shares } = await api.listShares();
			state.shares = shares;
		} catch {
			state.shares = [];
		} finally {
			state.loadingShares = false;
		}
	},

	closeManager() {
		state.managerOpen = false;
		state.shares = [];
	},

	/** @param {string} token */
	async revokeShare(token) {
		try {
			await api.deleteShare(token);
			state.shares = state.shares.filter((s) => s.token !== token);
			toast.success('Share link revoked');
		} catch (e) {
			toast.error(e.message || 'Failed to revoke');
		}
	},

	/** @param {string} token */
	async copyShareUrl(token) {
		const url = api.getShareUrl(token);
		try {
			await navigator.clipboard.writeText(url);
			toast.success('Link copied');
		} catch {
			toast.error('Failed to copy');
		}
	},
};
