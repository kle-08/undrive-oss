import * as api from '$lib/api/client.js';
import { files } from '$lib/stores/files.svelte.js';

/**
 * Vault auth + gate visibility. The vault itself is browsed as a normal folder
 * (the files store injects a "Vault" folder at Home once unlocked); this store
 * only handles the passphrase gate. Session-unlock state lives in the files
 * store (files.vaultUnlocked) so it can reveal the folder without a circular
 * import.
 */
const state = $state({
	configured: false,
	loading: false,
	/** @type {string|null} */
	error: null,
	showGate: false,
	showChange: false,
});

export const vault = {
	get configured() { return state.configured; },
	get unlocked() { return files.vaultUnlocked; },
	get loading() { return state.loading; },
	get error() { return state.error; },
	get showGate() { return state.showGate; },
	get showChange() { return state.showChange; },

	clearError() { state.error = null; },
	closeGate() { state.showGate = false; state.error = null; },
	openChange() { state.showChange = true; state.error = null; },
	closeChange() { state.showChange = false; state.error = null; },

	async refreshStatus() {
		try {
			const s = await api.vaultStatus();
			state.configured = s.configured;
			files.setVaultUnlocked(s.unlocked);
		} catch (e) {
			state.error = e.message;
		}
	},

	/**
	 * Secret trigger (7-click):
	 *  - folder currently visible → lock (hide it)
	 *  - hidden but a valid session cookie exists → reveal without asking again
	 *  - otherwise → show the passphrase gate
	 */
	async trigger() {
		if (files.vaultUnlocked) { await this.lock(); return; }
		await this.refreshStatus();
		if (files.vaultUnlocked) return; // cookie still valid → folder appears
		state.error = null;
		state.showGate = true;
	},

	/** @param {string} passphrase */
	async setup(passphrase) {
		state.loading = true;
		state.error = null;
		try {
			await api.vaultSetup(passphrase);
			state.configured = true;
			files.setVaultUnlocked(true);
			state.showGate = false;
		} catch (e) {
			state.error = e.message;
		} finally {
			state.loading = false;
		}
	},

	/** @param {string} passphrase */
	async unlock(passphrase) {
		state.loading = true;
		state.error = null;
		try {
			await api.vaultUnlock(passphrase);
			files.setVaultUnlocked(true);
			state.showGate = false;
		} catch (e) {
			state.error = e.message;
		} finally {
			state.loading = false;
		}
	},

	async lock() {
		try { await api.vaultLock(); } catch { /* ignore */ }
		files.setVaultUnlocked(false);
		if (files.isVault) files.exitVault();
	},

	/** @param {string} current @param {string} next */
	async change(current, next) {
		state.loading = true;
		state.error = null;
		try {
			await api.vaultChange(current, next);
			return true;
		} catch (e) {
			state.error = e.message;
			return false;
		} finally {
			state.loading = false;
		}
	},
};
