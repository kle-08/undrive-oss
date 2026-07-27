import * as api from '$lib/api/client.js';
import { getFilesAtPath, findFolderById, spliceByIds, mockFileSystem } from '$lib/mock/data.js';
import { toast } from '$lib/stores/toast.svelte.js';
import { isRawImage, extractRawPreview } from '$lib/utils/raw-thumb.js';
import { canGenerateThumb, canGenerateVideoThumb, generateThumbnail, generateVideoThumbnail } from '$lib/utils/thumbnail.js';

/**
 * @typedef {object} FileItem
 * @property {string} id - Unique identifier (R2 key or mock id)
 * @property {string} key - R2 object key (same as id in API mode)
 * @property {string} name - Display name
 * @property {'folder'|'image'|'video'|'audio'|'document'|'archive'|'other'} type
 * @property {string} path - Full path
 * @property {number} size
 * @property {string} sizeFormatted
 * @property {string|null} modified
 * @property {string} [thumbnail] - Preview URL for images/videos
 * @property {string} [url] - Presigned URL for media
 * @property {string} [color] - Folder color (mock only)
 * @property {string} [contentType]
 */

/** Whether to use the real API or mock data */
const USE_API = import.meta.env.VITE_MOCK !== 'true';

/**
 * Convert an R2 API item to the shape components expect.
 * @param {object} item - API response item
 * @returns {FileItem}
 */
const mapApiItem = (item) => ({
	id: item.key,
	key: item.key,
	name: item.name,
	type: item.type,
	path: item.key,
	size: item.size,
	sizeFormatted: item.sizeFormatted ?? '—',
	modified: item.modified ? item.modified.split('T')[0] : null,
	thumbnail: item.url ?? undefined,
	url: item.url ?? undefined,
	contentType: item.contentType ?? undefined,
});

/** @type {'name'|'size'|'date'|'type'} */
const storedSort = /** @type {any} */ (typeof localStorage !== 'undefined' && localStorage.getItem('cv-sort')) || 'name';
const storedSortDir = /** @type {'asc'|'desc'} */ (typeof localStorage !== 'undefined' && localStorage.getItem('cv-sort-dir')) || 'asc';
const storedGridSize = /** @type {'small'|'medium'|'large'} */ (typeof localStorage !== 'undefined' && localStorage.getItem('cv-grid-size')) || 'medium';

const fileState = $state({
	prefix: '',
	path: '/',
	files: USE_API ? [] : [...getFilesAtPath('/')],
	selected: new Set(),
	viewMode: 'grid',
	lastSelectedId: null,
	loading: false,
	error: null,
	isTrash: false,
	selectMode: false,
	/** @type {'name'|'size'|'date'|'type'} */
	sortBy: storedSort,
	/** @type {'asc'|'desc'} */
	sortDir: storedSortDir,
	/** @type {'small'|'medium'|'large'} */
	gridSize: storedGridSize,
	/** @type {string} */
	searchQuery: '',
	/** @type {FileItem[]} */
	searchResults: [],
	searchLoading: false,
	/** @type {{ id: string, name: string, size: number, progress: number, done: boolean, error: string | null, prefix: string, skipped?: boolean }[]} */
	uploadQueue: [],
	/** @type {Set<string>} */
	filterTypes: new Set(),
});

/** @type {Map<string, FileItem[]>} */
const folderCache = new Map();

/** @type {Map<string, File>} */
const uploadFileMap = new Map();

let consecutiveFailures = 0;

/** @type {ReturnType<typeof setInterval> | null} */
let uploadRefreshInterval = null;
let uploadTargetPrefix = '';

const startUploadRefresh = (prefix) => {
	uploadTargetPrefix = prefix;
	if (uploadRefreshInterval) return;
	folderCache.delete(prefix);
	if (fileState.prefix === prefix) fetchFiles();
	uploadRefreshInterval = setInterval(() => {
		if (fileState.prefix === uploadTargetPrefix) {
			folderCache.delete(uploadTargetPrefix);
			fetchFiles();
		}
	}, 3000);
};

const stopUploadRefresh = () => {
	if (uploadRefreshInterval) {
		clearInterval(uploadRefreshInterval);
		uploadRefreshInterval = null;
	}
	uploadTargetPrefix = '';
};

/**
 * Sort files array. Folders always come first.
 * @param {FileItem[]} arr
 * @param {'name'|'size'|'date'|'type'} by
 * @param {'asc'|'desc'} dir
 * @returns {FileItem[]}
 */
const sortFiles = (arr, by, dir) => {
	const mul = dir === 'asc' ? 1 : -1;
	return [...arr].sort((a, b) => {
		// Folders always first
		if (a.type === 'folder' && b.type !== 'folder') return -1;
		if (a.type !== 'folder' && b.type === 'folder') return 1;

		switch (by) {
			case 'name':
				return mul * a.name.localeCompare(b.name, undefined, { numeric: true });
			case 'size':
				return mul * (a.size - b.size);
			case 'date':
				return mul * ((a.modified ?? '').localeCompare(b.modified ?? ''));
			case 'type': {
				const extA = a.name.includes('.') ? a.name.split('.').pop() : '';
				const extB = b.name.includes('.') ? b.name.split('.').pop() : '';
				const cmp = extA.localeCompare(extB);
				return cmp !== 0 ? mul * cmp : mul * a.name.localeCompare(b.name, undefined, { numeric: true });
			}
			default:
				return 0;
		}
	});
};

/** @type {number|null} */
let searchDebounce = null;

/**
 * Convert a display path (e.g. "/photos/vacation") to an R2 prefix (e.g. "photos/vacation/")
 * @param {string} path
 * @returns {string}
 */
const pathToPrefix = (path) => {
	const p = path.replace(/^\/+/, '').replace(/\/+$/, '');
	return p ? p + '/' : '';
};

/**
 * Fetch files from API for the current prefix.
 */
const fetchFiles = async () => {
	fileState.loading = !folderCache.has(fileState.prefix);
	fileState.error = null;
	try {
		const result = await api.listFiles(fileState.prefix);
		const folders = result.folders.map(mapApiItem);
		const items = result.files.map(mapApiItem);
		const merged = [...folders, ...items];
		fileState.files = merged;
		folderCache.set(fileState.prefix, merged);
	} catch (e) {
		console.error('[fetchFiles] error:', e.message);
		fileState.error = e.message;
	} finally {
		fileState.loading = false;
	}
};

/**
 * Fetch trash items from API.
 */
const fetchTrash = async () => {
	fileState.loading = true;
	fileState.error = null;
	try {
		const result = await api.listTrash();
		fileState.files = result.items.map((item) => ({
			id: item.trashKey,
			key: item.trashKey,
			name: item.name,
			type: /** @type {const} */ ('other'),
			path: item.trashKey,
			size: item.size,
			sizeFormatted: '',
			modified: item.deletedAt ? item.deletedAt.split('T')[0] : null,
			originalKey: item.originalKey,
		}));
	} catch (e) {
		fileState.error = e.message;
	} finally {
		fileState.loading = false;
	}
};

export const files = {
	get path() {
		return fileState.path;
	},
	get prefix() {
		return fileState.prefix;
	},
	get items() {
		let source = fileState.searchQuery && fileState.searchResults.length > 0
			? fileState.searchResults
			: fileState.files;
		if (fileState.filterTypes.size > 0) {
			source = source.filter((f) => f.type === 'folder' || fileState.filterTypes.has(f.type));
		}
		return sortFiles(source, fileState.sortBy, fileState.sortDir);
	},
	get rawItems() {
		return fileState.files;
	},
	get selected() {
		return fileState.selected;
	},
	get selectedCount() {
		return fileState.selected.size;
	},
	get hasSelection() {
		return fileState.selected.size > 0;
	},
	get viewMode() {
		return fileState.viewMode;
	},
	get loading() {
		return fileState.loading;
	},
	get error() {
		return fileState.error;
	},
	get isTrash() {
		return fileState.isTrash;
	},
	get selectMode() {
		return fileState.selectMode;
	},
	get breadcrumbs() {
		if (fileState.isTrash) {
			return [{ name: 'Home', path: '/' }, { name: 'Trash', path: '/__trash' }];
		}
		const parts = fileState.path.split('/').filter(Boolean);
		return [
			{ name: 'Home', path: '/' },
			...parts.map((part, i) => ({
				name: part,
				path: '/' + parts.slice(0, i + 1).join('/'),
			})),
		];
	},

	/** @param {string} path */
	async navigate(path) {
		fileState.path = path;
		fileState.selected = new Set();
		fileState.lastSelectedId = null;
		fileState.selectMode = false;
		fileState.filterTypes = new Set();
		fileState.isTrash = path === '/__trash';

		if (USE_API) {
			if (fileState.isTrash) {
				fileState.prefix = '__trash/';
				await fetchTrash();
			} else {
				fileState.prefix = pathToPrefix(path);
				const cached = folderCache.get(fileState.prefix);
				if (cached) {
					fileState.files = cached;
					fetchFiles();
				} else {
					await fetchFiles();
				}
			}
		} else {
			fileState.files = [...getFilesAtPath(path)];
		}
	},

	/** Reload current directory from API */
	async refresh() {
		if (USE_API) {
			if (fileState.isTrash) {
				await fetchTrash();
			} else {
				await fetchFiles();
			}
		}
	},

	/** Restore selected trash items */
	async restoreSelected() {
		if (!USE_API || !fileState.isTrash) return;
		const keys = [...fileState.selected];
		if (keys.length === 0) return;
		try {
			await api.restoreFromTrash(keys);
			fileState.selected = new Set();
			await fetchTrash();
		} catch (e) {
			fileState.error = e.message;
		}
	},

	/** Permanently delete all trash items */
	async emptyTrash() {
		if (!USE_API) return;
		try {
			await api.purgeTrash(0);
			fileState.selected = new Set();
			if (fileState.isTrash) await fetchTrash();
		} catch (e) {
			fileState.error = e.message;
		}
	},

	/** Initialize — call on app mount */
	async init() {
		if (USE_API) {
			fileState.prefix = pathToPrefix(fileState.path);
			await fetchFiles();
		}
	},

	/** @param {string} id */
	toggleSelect(id) {
		const next = new Set(fileState.selected);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		fileState.selected = next;
		fileState.lastSelectedId = id;
	},

	/**
	 * @param {string} id
	 */
	rangeSelect(id) {
		if (!fileState.lastSelectedId) {
			files.toggleSelect(id);
			return;
		}
		const items = fileState.files;
		const startIdx = items.findIndex((f) => f.id === fileState.lastSelectedId);
		const endIdx = items.findIndex((f) => f.id === id);
		if (startIdx === -1 || endIdx === -1) return;

		const from = Math.min(startIdx, endIdx);
		const to = Math.max(startIdx, endIdx);
		const next = new Set(fileState.selected);
		for (let i = from; i <= to; i++) {
			next.add(items[i].id);
		}
		fileState.selected = next;
	},

	/** @param {string} id */
	selectOnly(id) {
		fileState.selected = new Set([id]);
		fileState.lastSelectedId = id;
	},

	selectAll() {
		fileState.selected = new Set(fileState.files.map((f) => f.id));
	},

	/** @param {Set<string>} ids */
	setSelection(ids) {
		fileState.selected = ids;
	},

	clearSelection() {
		fileState.selected = new Set();
		fileState.lastSelectedId = null;
		fileState.selectMode = false;
	},

	toggleSelectMode() {
		fileState.selectMode = !fileState.selectMode;
		if (!fileState.selectMode) {
			fileState.selected = new Set();
			fileState.lastSelectedId = null;
		}
	},

	toggleViewMode() {
		fileState.viewMode = fileState.viewMode === 'grid' ? 'list' : 'grid';
	},

	/**
	 * Reorder items locally (client-side only, R2 has no ordering)
	 * @param {string} dragId
	 * @param {string} targetId
	 */
	reorder(dragId, targetId) {
		if (dragId === targetId) return;

		if (!USE_API) {
			const sourceArr = getFilesAtPath(fileState.path);
			const dragIdx = sourceArr.findIndex((f) => f.id === dragId);
			const targetIdx = sourceArr.findIndex((f) => f.id === targetId);
			if (dragIdx === -1 || targetIdx === -1) return;
			const [dragged] = sourceArr.splice(dragIdx, 1);
			sourceArr.splice(targetIdx, 0, dragged);
			fileState.files = [...sourceArr];
			return;
		}

		// API mode: reorder in local state only
		const arr = [...fileState.files];
		const dragIdx = arr.findIndex((f) => f.id === dragId);
		const targetIdx = arr.findIndex((f) => f.id === targetId);
		if (dragIdx === -1 || targetIdx === -1) return;
		const [dragged] = arr.splice(dragIdx, 1);
		arr.splice(targetIdx, 0, dragged);
		fileState.files = arr;
	},

	/**
	 * @param {string} targetId
	 */
	reorderSelected(targetId) {
		if (fileState.selected.has(targetId)) return;

		if (!USE_API) {
			const sourceArr = getFilesAtPath(fileState.path);
			const selected = [];
			for (let i = sourceArr.length - 1; i >= 0; i--) {
				if (fileState.selected.has(sourceArr[i].id)) {
					selected.unshift(...sourceArr.splice(i, 1));
				}
			}
			const targetIdx = sourceArr.findIndex((f) => f.id === targetId);
			if (targetIdx === -1) return;
			sourceArr.splice(targetIdx, 0, ...selected);
			fileState.files = [...sourceArr];
			return;
		}

		// API mode: local reorder only
		const arr = [...fileState.files];
		const selected = [];
		for (let i = arr.length - 1; i >= 0; i--) {
			if (fileState.selected.has(arr[i].id)) {
				selected.unshift(...arr.splice(i, 1));
			}
		}
		const targetIdx = arr.findIndex((f) => f.id === targetId);
		if (targetIdx === -1) return;
		arr.splice(targetIdx, 0, ...selected);
		fileState.files = arr;
	},

	/**
	 * Move selected files into a folder.
	 * @param {string} folderId
	 */
	async moveToFolder(folderId) {
		if (USE_API) {
			const keys = [...fileState.selected];
			const folder = fileState.files.find((f) => f.id === folderId);
			if (!folder) return;
			try {
				await api.moveFiles(keys, folder.key);
				toast.success(`Moved ${keys.length} item${keys.length > 1 ? 's' : ''} to ${folder.name}`);
				fileState.selected = new Set();
				await fetchFiles();
			} catch (e) {
				fileState.error = e.message;
				toast.error(`Move failed: ${e.message}`);
			}
			return;
		}

		// Mock mode
		const folder = findFolderById(mockFileSystem, folderId);
		if (!folder) return;
		if (!folder.children) folder.children = [];
		const sourceArr = getFilesAtPath(fileState.path);
		const moved = spliceByIds(sourceArr, fileState.selected);
		for (const item of moved) {
			item.path = `${folder.path}/${item.name}`;
			folder.children.push(item);
		}
		fileState.files = [...getFilesAtPath(fileState.path)];
		fileState.selected = new Set();
	},

	/**
	 * Flatten a folder: move its contents up to its parent, remove the folder.
	 * @param {string} folderId
	 */
	async flattenFolder(folderId) {
		if (!USE_API) return;
		const folder = fileState.files.find((f) => f.id === folderId);
		if (!folder || folder.type !== 'folder') return;
		try {
			const res = await api.flattenFolder(folder.key);
			toast.success(`Flattened "${folder.name}" — moved ${res.moved} item${res.moved === 1 ? '' : 's'} up`);
			fileState.selected = new Set();
			folderCache.delete(fileState.prefix);
			await fetchFiles();
		} catch (e) {
			fileState.error = e.message;
			toast.error(`Flatten failed: ${e.message}`);
		}
	},

	/**
	 * Copy selected files into a folder.
	 * @param {string} folderId
	 */
	async copyToFolder(folderId) {
		if (!USE_API) return;
		const keys = [...fileState.selected];
		const folder = fileState.files.find((f) => f.id === folderId);
		if (!folder) return;
		try {
			await api.copyFiles(keys, folder.key);
			toast.success(`Copied ${keys.length} item${keys.length > 1 ? 's' : ''} to ${folder.name}`);
			fileState.selected = new Set();
		} catch (e) {
			fileState.error = e.message;
			toast.error(`Copy failed: ${e.message}`);
		}
	},

	/**
	 * Copy selected files to a destination prefix (for sidebar drop).
	 * @param {string} destPrefix - e.g. "photos/" or "" for root
	 */
	async copyToPrefix(destPrefix) {
		if (!USE_API) return;
		const keys = [...fileState.selected];
		if (keys.length === 0) return;
		try {
			await api.copyFiles(keys, destPrefix);
			const dest = destPrefix ? destPrefix.replace(/\/$/, '').split('/').pop() : 'Home';
			toast.success(`Copied ${keys.length} item${keys.length > 1 ? 's' : ''} to ${dest}`);
			fileState.selected = new Set();
		} catch (e) {
			fileState.error = e.message;
			toast.error(`Copy failed: ${e.message}`);
		}
	},

	/**
	 * Move selected files to a destination prefix (for sidebar drop).
	 * @param {string} destPrefix - e.g. "photos/" or "" for root
	 */
	async moveToPrefix(destPrefix) {
		if (!USE_API) return;
		const keys = [...fileState.selected];
		if (keys.length === 0) return;
		try {
			await api.moveFiles(keys, destPrefix);
			const dest = destPrefix ? destPrefix.replace(/\/$/, '').split('/').pop() : 'Home';
			toast.success(`Moved ${keys.length} item${keys.length > 1 ? 's' : ''} to ${dest}`);
			fileState.selected = new Set();
			await fetchFiles();
		} catch (e) {
			fileState.error = e.message;
			toast.error(`Move failed: ${e.message}`);
		}
	},

	/**
	 * Delete selected files (soft delete in API mode).
	 * @param {Set<string>} [ids]
	 */
	async deleteSelected(ids) {
		const toDelete = ids ?? fileState.selected;

		if (USE_API) {
			try {
				const count = toDelete.size;
				await api.deleteFiles([...toDelete]);
				toast.success(`Moved ${count} item${count > 1 ? 's' : ''} to trash`);
				fileState.selected = new Set();
				await fetchFiles();
			} catch (e) {
				fileState.error = e.message;
				toast.error(`Delete failed: ${e.message}`);
			}
			return;
		}

		// Mock mode
		const sourceArr = getFilesAtPath(fileState.path);
		spliceByIds(sourceArr, toDelete);
		fileState.files = [...getFilesAtPath(fileState.path)];
		fileState.selected = new Set();
	},

	/**
	 * Add a file to the current directory (mock mode) or refresh (API mode).
	 * @param {FileItem} [item]
	 */
	async addFile(item) {
		if (USE_API) {
			await fetchFiles();
			return;
		}
		if (!item) return;
		const sourceArr = getFilesAtPath(fileState.path);
		sourceArr.push(item);
		fileState.files = [...sourceArr];
	},

	/**
	 * Rename a file or folder.
	 * @param {string} id
	 * @param {string} newName
	 */
	async rename(id, newName) {
		const trimmed = newName.trim();
		if (!trimmed) return;

		if (USE_API) {
			const item = fileState.files.find((f) => f.id === id);
			if (!item) return;
			const isFolder = item.type === 'folder';
			// For folders: r2_key is the virtual path, so rebuild from parent + new name
			// For files: r2_key is permanent, but we need from=r2_key and to=parent+newName
			const parent = fileState.prefix;
			const from = item.key;
			const to = parent + trimmed + (isFolder ? '/' : '');
			try {
				await api.renameFile(from, to);
				toast.success(`Renamed to ${trimmed}`);
				fileState.selected = new Set();
				await fetchFiles();
			} catch (e) {
				fileState.error = e.message;
				toast.error(`Rename failed: ${e.message}`);
			}
			return;
		}

		// Mock mode
		const sourceArr = getFilesAtPath(fileState.path);
		const item = sourceArr.find((f) => f.id === id);
		if (!item) return;
		const pathParts = item.path.split('/');
		pathParts[pathParts.length - 1] = trimmed;
		item.path = pathParts.join('/');
		item.name = trimmed;
		item.modified = new Date().toISOString().split('T')[0];
		fileState.files = [...sourceArr];
		fileState.selected = new Set();
	},

	/**
	 * Create a new folder.
	 * @param {string} name
	 */
	async createFolder(name) {
		if (USE_API) {
			const path = fileState.prefix + name;
			try {
				await api.createFolder(path);
				await fetchFiles();
			} catch (e) {
				fileState.error = e.message;
			}
			return;
		}

		// Mock mode
		const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const path = `${fileState.path === '/' ? '' : fileState.path}/${name}`;
		const colors = ['#4f9cf7', '#2ecc71', '#e67e22', '#9b59b6', '#f7c94f', '#e74c3c'];
		const color = colors[Math.floor(Math.random() * colors.length)];

		const folder = {
			id,
			name,
			type: /** @type {const} */ ('folder'),
			path,
			size: 0,
			sizeFormatted: '—',
			modified: new Date().toISOString().split('T')[0],
			color,
			children: [],
		};

		const sourceArr = getFilesAtPath(fileState.path);
		const firstNonFolder = sourceArr.findIndex((f) => f.type !== 'folder');
		if (firstNonFolder === -1) {
			sourceArr.push(folder);
		} else {
			sourceArr.splice(firstNonFolder, 0, folder);
		}
		fileState.files = [...sourceArr];
	},

	// Sort
	get sortBy() { return fileState.sortBy; },
	get sortDir() { return fileState.sortDir; },

	/** @param {'name'|'size'|'date'|'type'} field */
	setSort(field) {
		if (fileState.sortBy === field) {
			fileState.sortDir = fileState.sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			fileState.sortBy = field;
			fileState.sortDir = 'asc';
		}
		localStorage.setItem('cv-sort', fileState.sortBy);
		localStorage.setItem('cv-sort-dir', fileState.sortDir);
	},

	// Grid size
	get gridSize() { return fileState.gridSize; },

	/** @param {'small'|'medium'|'large'} size */
	setGridSize(size) {
		fileState.gridSize = size;
		localStorage.setItem('cv-grid-size', size);
	},

	cycleGridSize() {
		const sizes = /** @type {const} */ (['small', 'medium', 'large']);
		const idx = sizes.indexOf(fileState.gridSize);
		const next = sizes[(idx + 1) % sizes.length];
		files.setGridSize(next);
	},

	// Search
	get searchQuery() { return fileState.searchQuery; },
	get searchLoading() { return fileState.searchLoading; },
	get isSearching() { return fileState.searchQuery.length > 0; },

	/** @param {string} query */
	search(query) {
		fileState.searchQuery = query;
		if (!query.trim()) {
			fileState.searchResults = [];
			fileState.searchLoading = false;
			return;
		}
		if (searchDebounce) clearTimeout(searchDebounce);
		fileState.searchLoading = true;
		searchDebounce = setTimeout(async () => {
			try {
				const result = await api.searchFiles(query.trim());
				fileState.searchResults = result.files.map(mapApiItem);
			} catch {
				fileState.searchResults = [];
			} finally {
				fileState.searchLoading = false;
			}
		}, 300);
	},

	clearSearch() {
		fileState.searchQuery = '';
		fileState.searchResults = [];
		fileState.searchLoading = false;
		if (searchDebounce) clearTimeout(searchDebounce);
	},

	// Filter by type
	get filterTypes() { return fileState.filterTypes; },
	get isFiltering() { return fileState.filterTypes.size > 0; },

	/** Types available in the current folder (excludes 'folder') */
	get availableTypes() {
		const types = new Set();
		for (const f of fileState.files) {
			if (f.type !== 'folder') types.add(f.type);
		}
		return [...types].sort();
	},

	/** @param {string} type */
	toggleFilterType(type) {
		const next = new Set(fileState.filterTypes);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		fileState.filterTypes = next;
	},

	clearFilters() {
		fileState.filterTypes = new Set();
	},

	get uploadQueue() {
		return fileState.uploadQueue;
	},

	get hasActiveUploads() {
		return fileState.uploadQueue.some((u) => !u.done && !u.error);
	},

	/**
	 * Upload a single entry with retries and exponential backoff.
	 * @param {string} prefix
	 * @param {{ id: string, name: string, size: number, progress: number, done: boolean, error: string | null, prefix: string }} entry
	 * @param {number} [maxRetries]
	 */
	async _uploadOne(prefix, entry) {
		const file = uploadFileMap.get(entry.id);
		if (!file) return;

		if (consecutiveFailures >= 15) {
			const qi = fileState.uploadQueue.find((u) => u.id === entry.id);
			if (qi) qi.error = 'Too many failures — stopped';
			return;
		}

		if (consecutiveFailures >= 6) {
			await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
		}

		try {
			const queueItem = fileState.uploadQueue.find((u) => u.id === entry.id);
			if (queueItem) {
				queueItem.progress = 0;
				queueItem.error = null;
			}

			await api.smartUpload(prefix, file, (p) => {
				const qi = fileState.uploadQueue.find((u) => u.id === entry.id);
				if (qi) qi.progress = p;
			});

			const qi = fileState.uploadQueue.find((u) => u.id === entry.id);
			if (qi) {
				qi.done = true;
				qi.progress = 100;
			}

			consecutiveFailures = 0;

			const key = prefix + file.name;
			if (isRawImage(file.name)) {
				extractRawPreview(file).then((blob) => {
					if (blob) api.saveVideoThumb(key, blob).catch(() => {});
				});
			} else if (canGenerateThumb(file.name)) {
				generateThumbnail(file).then((blob) => {
					if (blob) api.saveVideoThumb(key, blob).catch(() => {});
				});
			} else if (canGenerateVideoThumb(file.name)) {
				generateVideoThumbnail(file).then((blob) => {
					if (blob) api.saveVideoThumb(key, blob).catch(() => {});
				});
			}

			uploadFileMap.delete(entry.id);
			startUploadRefresh(prefix);
		} catch (e) {
			consecutiveFailures++;
			console.error(`[upload] ${entry.name} failed:`, e.message);
			const qi = fileState.uploadQueue.find((u) => u.id === entry.id);
			if (qi) qi.error = e.message || 'Upload failed';
		}
	},

	/**
	 * Queue files for upload with progress tracking.
	 * Small files first, higher concurrency for small files.
	 * @param {File[]} fileList
	 * @returns {{ ids: string[], done: Promise<void> }}
	 */
	uploadFiles(fileList) {
		if (!USE_API) return { ids: [], done: Promise.resolve() };

		const prefix = fileState.prefix;
		const newEntries = Array.from(fileList).map((file) => {
			const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			uploadFileMap.set(id, file);
			return { id, name: file.name, size: file.size, progress: 0, done: false, error: null, prefix };
		});

		newEntries.sort((a, b) => a.size - b.size);
		fileState.uploadQueue.push(...newEntries);

		const done = (async () => {
			// Check which files already exist — skip duplicates
			const keys = newEntries.map((e) => prefix + e.name);
			let existing = {};
			try {
				const result = await api.checkExistingFiles(keys);
				existing = result.existing || {};
			} catch { /* proceed without check */ }

			let skipped = 0;
			for (const entry of newEntries) {
				const key = prefix + entry.name;
				if (key in existing) {
					const qi = fileState.uploadQueue.find((u) => u.id === entry.id);
					if (qi) {
						qi.done = true;
						qi.progress = 100;
						qi.skipped = true;
					}
					entry.done = true;
					uploadFileMap.delete(entry.id);
					skipped++;
				}
			}

			if (skipped > 0) {
				toast.success(`Skipped ${skipped} already uploaded`);
			}

			const pending = newEntries.filter((e) => !e.done);

			for (const entry of pending) {
				await files._uploadOne(entry.prefix, entry);
			}

			stopUploadRefresh();
			folderCache.delete(prefix);
			const succeeded = newEntries.filter((e) => e.done).length;
			const failed = newEntries.filter((e) => e.error).length;
			if (failed > 0) {
				toast.error(`${failed} upload${failed > 1 ? 's' : ''} failed`);
			} else if (succeeded > 0 && failed === 0) {
				toast.success(`Uploaded ${succeeded - skipped} file${(succeeded - skipped) > 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
			}

			await fetchFiles();
		})();

		return { ids: newEntries.map((e) => e.id), done };
	},

	/**
	 * Retry all failed uploads in the queue.
	 * @returns {Promise<void>}
	 */
	async retryFailed() {
		const failed = fileState.uploadQueue.filter((u) => u.error && uploadFileMap.has(u.id));
		if (failed.length === 0) return;

		consecutiveFailures = 0;

		for (const entry of failed) {
			await files._uploadOne(entry.prefix, entry);
		}

		stopUploadRefresh();
		await fetchFiles();
	},

	clearUploadQueue() {
		fileState.uploadQueue = [];
	},

	dismissCompletedUploads() {
		fileState.uploadQueue = fileState.uploadQueue.filter((u) => !u.done && !u.error);
	},

	/**
	 * Upload files to a specific prefix (for sidebar/breadcrumb drops).
	 * @param {string} prefix - destination prefix e.g. "photos/"
	 * @param {File[]} fileList
	 */
	uploadFilesToPrefix(prefix, fileList) {
		if (!USE_API) return;

		const newEntries = fileList.map((file) => {
			const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			uploadFileMap.set(id, file);
			return { id, name: file.name, size: file.size, progress: 0, done: false, error: null, prefix };
		});

		newEntries.sort((a, b) => a.size - b.size);
		fileState.uploadQueue.push(...newEntries);

		(async () => {
			for (const entry of newEntries) {
				await files._uploadOne(entry.prefix, entry);
			}

			stopUploadRefresh();
			folderCache.delete(prefix);
			const succeeded = newEntries.filter((e) => e.done).length;
			const failed = newEntries.filter((e) => e.error).length;
			const dest = prefix ? prefix.replace(/\/$/, '').split('/').pop() : 'Home';
			if (failed > 0) {
				toast.error(`${failed} upload${failed > 1 ? 's' : ''} failed`);
			} else if (succeeded > 0) {
				toast.success(`Uploaded ${succeeded} file${succeeded > 1 ? 's' : ''} to ${dest}`);
			}

			if (fileState.prefix === prefix) {
				await fetchFiles();
			}
		})();
	},

	/**
	 * Get a download URL for a file.
	 * @param {string} key
	 * @returns {string}
	 */
	getDownloadUrl(key) {
		return api.getDownloadUrl(key);
	},
};
