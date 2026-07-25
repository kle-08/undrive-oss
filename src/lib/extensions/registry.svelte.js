/**
 * Extension registry.
 *
 * Optional plugins register UI and actions here so that core never imports
 * them. When no plugin is wired in, these stay empty and the app runs as a
 * plain drive. Plugins are enabled via ENABLE_PLUGINS — see
 * scripts/wire-plugins.mjs.
 */

/**
 * @typedef {object} FileAction
 * @property {string} label
 * @property {string} icon - inline SVG markup
 * @property {(item: any) => boolean} [show] - predicate; shown for all single items if omitted
 * @property {(item: any) => void} action
 */

/**
 * @typedef {object} MediaFrameContext
 * @property {() => Promise<string|null>} captureFrame - returns a JPEG data URL of the current frame
 * @property {number} videoWidth
 * @property {number} videoHeight
 * @property {string} name
 */

/**
 * @typedef {object} MediaAction
 * @property {string} label
 * @property {string} [busyLabel] - shown while the action runs
 * @property {string} icon - inline SVG markup
 * @property {boolean} [accent] - render as the primary/accent button
 * @property {(ctx: MediaFrameContext) => void | Promise<void>} action
 */

const registry = $state({
	/** @type {FileAction[]} */
	fileActions: [],
	/** @type {MediaAction[]} */
	mediaActions: [],
	/** @type {any[]} */
	panels: [],
});

/** @param {FileAction} action */
export const registerFileAction = (action) => registry.fileActions.push(action);

/** @param {MediaAction} action */
export const registerMediaAction = (action) => registry.mediaActions.push(action);

/** @param {any} component - a Svelte component rendered as a global overlay */
export const registerPanel = (component) => registry.panels.push(component);

export const extensions = {
	get fileActions() { return registry.fileActions; },
	get mediaActions() { return registry.mediaActions; },
	get panels() { return registry.panels; },
};
