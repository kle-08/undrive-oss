const uiState = $state({
	showUpload: false,
	showNewFolder: false,
	showNewDoc: false,
	/** @type {{ id: string, name: string } | null} */
	renameTarget: null,
	/** @type {{ title: string, message: string, confirmLabel: string, danger: boolean, resolve: ((v: boolean) => void) | null } | null} */
	confirmDialog: null,
});

export const ui = {
	get showUpload() { return uiState.showUpload; },
	get showNewFolder() { return uiState.showNewFolder; },
	get showNewDoc() { return uiState.showNewDoc; },
	get renameTarget() { return uiState.renameTarget; },
	get confirmDialog() { return uiState.confirmDialog; },

	openUpload() { uiState.showUpload = true; },
	closeUpload() { uiState.showUpload = false; },
	openNewFolder() { uiState.showNewFolder = true; },
	closeNewFolder() { uiState.showNewFolder = false; },
	openNewDoc() { uiState.showNewDoc = true; },
	closeNewDoc() { uiState.showNewDoc = false; },

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	openRename(id, name) { uiState.renameTarget = { id, name }; },
	closeRename() { uiState.renameTarget = null; },

	/**
	 * Show a confirmation dialog and return a promise that resolves to true/false.
	 * @param {string} title
	 * @param {string} message
	 * @param {{ confirmLabel?: string, danger?: boolean }} [opts]
	 * @returns {Promise<boolean>}
	 */
	confirm(title, message, opts = {}) {
		return new Promise((resolve) => {
			uiState.confirmDialog = {
				title,
				message,
				confirmLabel: opts.confirmLabel ?? 'Delete',
				danger: opts.danger ?? true,
				resolve,
			};
		});
	},

	/** @param {boolean} result */
	resolveConfirm(result) {
		if (uiState.confirmDialog?.resolve) {
			uiState.confirmDialog.resolve(result);
		}
		uiState.confirmDialog = null;
	},
};
