import { files } from '$lib/stores/files.svelte.js';
import * as api from '$lib/api/client.js';
import { toast } from '$lib/stores/toast.svelte.js';

/**
 * @typedef {object} PlanStep
 * @property {'rename'|'move'|'createFolder'|'delete'} action
 * @property {string} [from] - current key (rename)
 * @property {string} [to] - new key (rename)
 * @property {string} [key] - file key (move/delete)
 * @property {string} [destination] - move destination prefix
 * @property {string} [path] - folder path (createFolder)
 * @property {string} label - human-readable description
 */

/**
 * @typedef {object} QuickAction
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} icon - SVG path
 * @property {boolean} [needsConfig] - whether it needs user input before preview
 * @property {object} [configFields] - config field definitions
 */

const state = $state({
	/** @type {boolean} */
	menuOpen: false,
	/** @type {QuickAction|null} */
	activeAction: null,
	/** @type {PlanStep[]} */
	plan: [],
	/** @type {boolean} */
	executing: false,
	/** @type {number} */
	executedCount: 0,
	/** @type {Record<string, string>} */
	config: {},
});

/** @type {QuickAction[]} */
const ACTIONS = [
	{
		id: 'rename-pattern',
		name: 'Rename to pattern',
		description: 'Rename files using a pattern like Prefix_{n}',
		icon: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7',
		needsConfig: true,
	},
	{
		id: 'group-by-type',
		name: 'Group by type',
		description: 'Move files into folders by type (Images, Videos, etc.)',
		icon: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
	},
	{
		id: 'group-by-extension',
		name: 'Group by extension',
		description: 'Move files into folders by extension (DNG, JPG, MP4, etc.)',
		icon: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
	},
	{
		id: 'group-by-date',
		name: 'Group by date',
		description: 'Move files into folders by date (YYYY-MM-DD)',
		icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
	},
	{
		id: 'flatten',
		name: 'Flatten subfolders',
		description: 'Move all files from subfolders into this folder',
		icon: 'M4 6h16M4 12h16M4 18h16',
	},
	{
		id: 'lowercase',
		name: 'Lowercase filenames',
		description: 'Convert all filenames to lowercase',
		icon: 'M21 14l-3-3h-7a1 1 0 01-1-1V4a1 1 0 011-1h9a1 1 0 011 1v10zM14 15v2a1 1 0 01-1 1H6l-3 3V11a1 1 0 011-1h2',
	},
	{
		id: 'replace-spaces',
		name: 'Replace spaces',
		description: 'Replace spaces in filenames with underscores or dashes',
		icon: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14',
		needsConfig: true,
	},
	{
		id: 'find-large',
		name: 'Find large files',
		description: 'Show files larger than a threshold',
		icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
		needsConfig: true,
	},
];

/** @type {Record<string, string>} */
const typeLabels = {
	image: 'Images',
	video: 'Videos',
	audio: 'Audio',
	document: 'Documents',
	archive: 'Archives',
	other: 'Other',
};

/**
 * Generate a preview plan for the given action.
 * @param {string} actionId
 * @param {Record<string, string>} config
 * @returns {PlanStep[]}
 */
const generatePlan = (actionId, config) => {
	const items = files.items.filter((f) => f.type !== 'folder');
	const prefix = files.prefix;

	switch (actionId) {
		case 'rename-pattern': {
			const pattern = config.pattern || 'file';
			const startNum = parseInt(config.startNum || '1', 10);
			const padLength = String(items.length + startNum - 1).length;
			return items.map((f, i) => {
				const num = String(i + startNum).padStart(padLength, '0');
				const ext = f.name.includes('.') ? '.' + f.name.split('.').pop() : '';
				const newName = `${pattern}_${num}${ext}`;
				return {
					action: /** @type {const} */ ('rename'),
					from: f.key,
					to: prefix + newName,
					label: `${f.name} → ${newName}`,
				};
			});
		}

		case 'group-by-type': {
			/** @type {PlanStep[]} */
			const plan = [];
			const folders = new Set();
			for (const f of items) {
				const label = typeLabels[f.type] || 'Other';
				const dest = prefix + label + '/';
				if (!folders.has(dest)) {
					folders.add(dest);
					plan.push({ action: /** @type {const} */ ('createFolder'), path: dest, label: `Create folder ${label}/` });
				}
				plan.push({ action: /** @type {const} */ ('move'), key: f.key, destination: dest, label: `${f.name} → ${label}/` });
			}
			return plan;
		}

		case 'group-by-extension': {
			/** @type {PlanStep[]} */
			const plan = [];
			const folders = new Set();
			for (const f of items) {
				const ext = f.name.includes('.') ? /** @type {string} */ (f.name.split('.').pop()).toUpperCase() : 'NO_EXT';
				const dest = prefix + ext + '/';
				if (!folders.has(dest)) {
					folders.add(dest);
					plan.push({ action: /** @type {const} */ ('createFolder'), path: dest, label: `Create folder ${ext}/` });
				}
				plan.push({ action: /** @type {const} */ ('move'), key: f.key, destination: dest, label: `${f.name} → ${ext}/` });
			}
			return plan;
		}

		case 'group-by-date': {
			/** @type {PlanStep[]} */
			const plan = [];
			const folders = new Set();
			for (const f of items) {
				const date = f.modified || 'unknown';
				const dest = prefix + date + '/';
				if (!folders.has(dest)) {
					folders.add(dest);
					plan.push({ action: /** @type {const} */ ('createFolder'), path: dest, label: `Create folder ${date}/` });
				}
				plan.push({ action: /** @type {const} */ ('move'), key: f.key, destination: dest, label: `${f.name} → ${date}/` });
			}
			return plan;
		}

		case 'flatten': {
			const folders = files.items.filter((f) => f.type === 'folder');
			if (folders.length === 0) return [];
			// We can't flatten without listing subfolders first — return a placeholder
			return folders.map((f) => ({
				action: /** @type {const} */ ('move'),
				key: f.key,
				destination: prefix,
				label: `Move contents of ${f.name}/ up to current folder`,
			}));
		}

		case 'lowercase': {
			return items
				.filter((f) => f.name !== f.name.toLowerCase())
				.map((f) => {
					const newName = f.name.toLowerCase();
					return {
						action: /** @type {const} */ ('rename'),
						from: f.key,
						to: prefix + newName,
						label: `${f.name} → ${newName}`,
					};
				});
		}

		case 'replace-spaces': {
			const replacement = config.replacement || '_';
			return items
				.filter((f) => f.name.includes(' '))
				.map((f) => {
					const newName = f.name.replace(/ /g, replacement);
					return {
						action: /** @type {const} */ ('rename'),
						from: f.key,
						to: prefix + newName,
						label: `${f.name} → ${newName}`,
					};
				});
		}

		case 'find-large': {
			const thresholdMB = parseInt(config.thresholdMB || '50', 10);
			const threshold = thresholdMB * 1024 * 1024;
			return items
				.filter((f) => f.size >= threshold)
				.sort((a, b) => b.size - a.size)
				.map((f) => ({
					action: /** @type {const} */ ('delete'),
					key: f.key,
					label: `${f.name} (${f.sizeFormatted})`,
				}));
		}

		default:
			return [];
	}
};

/**
 * Execute a plan step by step.
 * @param {PlanStep[]} plan
 */
const executePlan = async (plan) => {
	state.executing = true;
	state.executedCount = 0;
	let errors = 0;

	for (const step of plan) {
		try {
			switch (step.action) {
				case 'createFolder':
					await api.createFolder(/** @type {string} */ (step.path));
					break;
				case 'rename':
					await api.renameFile(/** @type {string} */ (step.from), /** @type {string} */ (step.to));
					break;
				case 'move':
					await api.moveFiles([/** @type {string} */ (step.key)], /** @type {string} */ (step.destination));
					break;
				case 'delete':
					await api.deleteFiles([/** @type {string} */ (step.key)]);
					break;
			}
			state.executedCount++;
		} catch (e) {
			errors++;
			console.error(`Quick action step failed:`, step, e);
		}
	}

	state.executing = false;

	if (errors > 0) {
		toast.error(`${errors} operation${errors > 1 ? 's' : ''} failed`);
	} else {
		toast.success(`Completed ${plan.length} operation${plan.length > 1 ? 's' : ''}`);
	}

	await files.refresh();
};

export const quickactions = {
	get menuOpen() { return state.menuOpen; },
	get activeAction() { return state.activeAction; },
	get plan() { return state.plan; },
	get executing() { return state.executing; },
	get executedCount() { return state.executedCount; },
	get config() { return state.config; },
	get actions() { return ACTIONS; },

	openMenu() { state.menuOpen = true; },
	closeMenu() { state.menuOpen = false; },

	/** @param {QuickAction} action */
	selectAction(action) {
		state.activeAction = action;
		state.menuOpen = false;
		state.config = {};
		if (!action.needsConfig) {
			state.plan = generatePlan(action.id, {});
		} else {
			state.plan = [];
		}
	},

	/**
	 * @param {string} key
	 * @param {string} value
	 */
	setConfig(key, value) {
		state.config = { ...state.config, [key]: value };
	},

	/** Regenerate the plan with current config. */
	updatePreview() {
		if (!state.activeAction) return;
		state.plan = generatePlan(state.activeAction.id, state.config);
	},

	/** Execute the current plan. */
	async execute() {
		if (state.plan.length === 0) return;
		// Filter out find-large steps since that's display-only (unless user picks delete)
		const actionable = state.plan.filter((s) => s.action !== 'delete' || state.activeAction?.id !== 'find-large');
		if (state.activeAction?.id === 'find-large') {
			// find-large is informational — no execution
			toast.show(`Found ${state.plan.length} large file${state.plan.length > 1 ? 's' : ''}`);
			return;
		}
		await executePlan(state.plan);
	},

	/**
	 * Execute plan with optional delete for find-large.
	 * @param {PlanStep[]} steps - steps to execute
	 */
	async executeSteps(steps) {
		await executePlan(steps);
	},

	close() {
		state.activeAction = null;
		state.plan = [];
		state.config = {};
		state.executing = false;
		state.executedCount = 0;
	},
};
