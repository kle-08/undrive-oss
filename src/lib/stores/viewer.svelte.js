import { getPresignUrl, getInlineUrl } from '$lib/api/client.js';

/** @type {{ open: boolean, items: import('$lib/mock/data.js').FileItem[], index: number, type: 'image' | 'video' | null, pip: boolean, pipItem: import('$lib/mock/data.js').FileItem | null, pipTime: number }} */
const viewerState = $state({
	open: false,
	items: [],
	index: 0,
	type: null,
	pip: false,
	pipItem: null,
	pipTime: 0,
});

/**
 * Set full-resolution URLs for the viewer.
 * Images use /api/presign (302-redirect straight to R2 — fast, and an <img>
 * has no crossorigin so the redirect is fine).
 * Video/audio use /api/download?inline=1 (same-origin stream, no redirect):
 * a crossorigin media element following /api/presign's cross-origin redirect
 * gets Origin reset to "null", which R2's CORS rejects → load fails. Streaming
 * inline avoids the redirect entirely and keeps the canvas CORS-clean.
 * Keeps existing thumbnail for quick initial display.
 * @param {import('$lib/mock/data.js').FileItem[]} items
 * @returns {import('$lib/mock/data.js').FileItem[]}
 */
const refreshUrls = (items) =>
	items.map((item) => {
		if (!item.key) return item;
		const isMedia = item.type === 'video' || item.type === 'audio';
		// Images: full=true so the viewer gets the original, not the thumbnail.
		const fullUrl = isMedia ? getInlineUrl(item.key) : getPresignUrl(item.key, true);
		return { ...item, url: fullUrl, thumbnail: item.thumbnail || item.url };
	});

export const viewer = {
	get open() {
		return viewerState.open;
	},
	get items() {
		return viewerState.items;
	},
	get index() {
		return viewerState.index;
	},
	get current() {
		return viewerState.items[viewerState.index] ?? null;
	},
	get type() {
		return viewerState.type;
	},
	get hasNext() {
		return viewerState.index < viewerState.items.length - 1;
	},
	get hasPrev() {
		return viewerState.index > 0;
	},

	/**
	 * @param {import('$lib/mock/data.js').FileItem[]} items
	 * @param {number} index
	 * @param {'image' | 'video'} type
	 */
	openViewer(items, index, type) {
		viewerState.items = refreshUrls(items);
		viewerState.index = index;
		viewerState.type = type;
		viewerState.open = true;
	},

	close() {
		viewerState.open = false;
		viewerState.items = [];
		viewerState.index = 0;
		viewerState.type = null;
		viewerState.pipTime = 0;
	},

	// PiP
	get pip() { return viewerState.pip; },
	get pipItem() { return viewerState.pipItem; },
	get pipTime() { return viewerState.pipTime; },

	/**
	 * Enter picture-in-picture mode.
	 * @param {import('$lib/mock/data.js').FileItem} item
	 * @param {number} currentTime
	 */
	enterPip(item, currentTime) {
		viewerState.pipItem = item;
		viewerState.pipTime = currentTime;
		viewerState.pip = true;
		// Close full viewer
		viewerState.open = false;
		viewerState.items = [];
		viewerState.index = 0;
		viewerState.type = null;
	},

	/** Expand PiP back to full viewer */
	expandPip() {
		if (!viewerState.pipItem) return;
		const item = viewerState.pipItem;
		const time = viewerState.pipTime;
		viewerState.pip = false;
		viewerState.pipItem = null;
		// Re-open in full viewer — keep same URL so shared video isn't reloaded
		viewerState.items = [item];
		viewerState.index = 0;
		viewerState.type = 'video';
		viewerState.pipTime = time;
		viewerState.open = true;
	},

	/** @param {number} time */
	updatePipTime(time) {
		viewerState.pipTime = time;
	},

	closePip() {
		viewerState.pip = false;
		viewerState.pipItem = null;
		viewerState.pipTime = 0;
	},

	next() {
		if (viewerState.index < viewerState.items.length - 1) {
			viewerState.index++;
		}
	},

	prev() {
		if (viewerState.index > 0) {
			viewerState.index--;
		}
	},

	/** @param {number} index */
	goTo(index) {
		if (index >= 0 && index < viewerState.items.length) {
			viewerState.index = index;
		}
	},
};
