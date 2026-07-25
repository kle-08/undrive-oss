import * as vault from '$lib/api/client.js';

const state = $state({
	/** @type {boolean} */
	open: false,
	/** @type {string} */
	key: '',
	/** @type {string} */
	name: '',
	/** @type {string} */
	content: '',
	/** @type {boolean} */
	loading: false,
	/** @type {boolean} */
	saving: false,
	/** @type {boolean} */
	dirty: false,
	/** @type {boolean} */
	markdown: false,
	/** @type {boolean} */
	preview: false,
});

export const editor = {
	get open() { return state.open; },
	get key() { return state.key; },
	get name() { return state.name; },
	get content() { return state.content; },
	get loading() { return state.loading; },
	get saving() { return state.saving; },
	get dirty() { return state.dirty; },
	get markdown() { return state.markdown; },
	get preview() { return state.preview; },

	/**
	 * Open a document for editing.
	 * @param {string} key - R2 key
	 * @param {string} name - File name
	 */
	async openDoc(key, name, previewOnly = false) {
		const isMd = name.toLowerCase().endsWith('.md');
		state.open = true;
		state.key = key;
		state.name = name;
		state.content = '';
		state.loading = true;
		state.dirty = false;
		state.markdown = isMd;
		state.preview = previewOnly;

		try {
			const url = vault.getDownloadUrl(key);
			const res = await fetch(url, { credentials: 'include' });
			state.content = await res.text();
		} catch {
			state.content = '';
		} finally {
			state.loading = false;
		}
	},

	/**
	 * Create and open a new document.
	 * @param {string} prefix - Folder prefix
	 * @param {string} name - File name (without extension)
	 */
	async createDoc(prefix, name, format = 'html') {
		const isMd = format === 'md';
		const ext = isMd ? '.md' : '.html';
		const cleanName = name.replace(/\.(html|md)$/, '');
		const filename = `${cleanName}${ext}`;
		const key = `${prefix}${filename}`;
		const content = isMd ? '' : '<p></p>';
		const mime = isMd ? 'text/markdown' : 'text/html';
		const blob = new Blob([content], { type: mime });
		const file = new File([blob], filename, { type: mime });

		try {
			await vault.uploadFile(key, file);
			state.open = true;
			state.key = key;
			state.name = filename;
			state.content = content;
			state.loading = false;
			state.dirty = false;
			state.markdown = isMd;
			state.preview = false;
		} catch {
			// Failed to create
		}
	},

	/** @param {string} html */
	setContent(html) {
		state.content = html;
		state.dirty = true;
	},

	async save() {
		if (!state.key || state.saving) return;
		state.saving = true;
		try {
			const type = state.markdown ? 'text/markdown' : 'text/html';
			const blob = new Blob([state.content], { type });
			const file = new File([blob], state.name, { type });
			await vault.uploadFile(state.key, file);
			state.dirty = false;
		} catch {
			// Save failed silently
		} finally {
			state.saving = false;
		}
	},

	togglePreview() {
		state.preview = !state.preview;
	},

	close() {
		state.open = false;
		state.key = '';
		state.name = '';
		state.content = '';
		state.dirty = false;
		state.markdown = false;
		state.preview = false;
	},
};
