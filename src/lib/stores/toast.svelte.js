let nextId = 0;

const toastState = $state({
	/** @type {{ id: number, message: string, type: 'info'|'success'|'error' }[]} */
	items: [],
});

export const toast = {
	get items() { return toastState.items; },

	/**
	 * @param {string} message
	 * @param {'info'|'success'|'error'} [type]
	 * @param {number} [duration]
	 */
	show(message, type = 'info', duration = 3000) {
		const id = nextId++;
		toastState.items = [...toastState.items, { id, message, type }];
		setTimeout(() => {
			toastState.items = toastState.items.filter((t) => t.id !== id);
		}, duration);
	},

	/** @param {string} message */
	success(message) { toast.show(message, 'success'); },

	/** @param {string} message */
	error(message) { toast.show(message, 'error', 5000); },

	/** @param {number} id */
	dismiss(id) {
		toastState.items = toastState.items.filter((t) => t.id !== id);
	},
};
