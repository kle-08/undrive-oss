/**
 * @typedef {'folder' | 'image' | 'video' | 'document' | 'audio' | 'archive' | 'other'} FileType
 *
 * @typedef {Object} FileItem
 * @property {string} id
 * @property {string} name
 * @property {FileType} type
 * @property {string} path
 * @property {number} size
 * @property {string} modified
 * @property {string} [thumbnail]
 * @property {string} [color]
 * @property {FileItem[]} [children]
 */

const PLACEHOLDER_IMAGES = [
	'https://picsum.photos/seed/img1/800/600',
	'https://picsum.photos/seed/img2/600/800',
	'https://picsum.photos/seed/img3/800/800',
	'https://picsum.photos/seed/img4/1200/800',
	'https://picsum.photos/seed/img5/800/1200',
	'https://picsum.photos/seed/img6/900/600',
	'https://picsum.photos/seed/img7/700/700',
	'https://picsum.photos/seed/img8/1000/750',
	'https://picsum.photos/seed/img9/800/600',
	'https://picsum.photos/seed/img10/600/900',
];

const PLACEHOLDER_VIDEOS = [
	'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
	'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
];

/** @type {FileItem[]} */
export const mockFileSystem = [
	{
		id: 'f1',
		name: 'Photos',
		type: 'folder',
		path: '/Photos',
		size: 0,
		modified: '2026-07-01',
		color: '#4f9cf7',
		children: [
			{
				id: 'f1-1',
				name: 'Vacation 2026',
				type: 'folder',
				path: '/Photos/Vacation 2026',
				size: 0,
				modified: '2026-06-15',
				color: '#f7c94f',
				children: [
					...Array.from({ length: 6 }, (_, i) => ({
						id: `p-vac-${i}`,
						name: `beach_${i + 1}.jpg`,
						type: /** @type {FileType} */ ('image'),
						path: `/Photos/Vacation 2026/beach_${i + 1}.jpg`,
						size: 2400000 + Math.floor(Math.random() * 3000000),
						modified: '2026-06-15',
						thumbnail: PLACEHOLDER_IMAGES[i],
					})),
				],
			},
			{
				id: 'f1-2',
				name: 'Screenshots',
				type: 'folder',
				path: '/Photos/Screenshots',
				size: 0,
				modified: '2026-07-08',
				color: '#9b59b6',
				children: Array.from({ length: 4 }, (_, i) => ({
					id: `p-ss-${i}`,
					name: `screenshot_${i + 1}.png`,
					type: /** @type {FileType} */ ('image'),
					path: `/Photos/Screenshots/screenshot_${i + 1}.png`,
					size: 500000 + Math.floor(Math.random() * 1000000),
					modified: '2026-07-08',
					thumbnail: PLACEHOLDER_IMAGES[6 + i],
				})),
			},
			...Array.from({ length: 4 }, (_, i) => ({
				id: `p-root-${i}`,
				name: `photo_${i + 1}.jpg`,
				type: /** @type {FileType} */ ('image'),
				path: `/Photos/photo_${i + 1}.jpg`,
				size: 3200000 + Math.floor(Math.random() * 2000000),
				modified: '2026-07-05',
				thumbnail: PLACEHOLDER_IMAGES[i + 2],
			})),
		],
	},
	{
		id: 'f2',
		name: 'Videos',
		type: 'folder',
		path: '/Videos',
		size: 0,
		modified: '2026-06-28',
		color: '#e74c3c',
		children: [
			{
				id: 'v1',
				name: 'Big Buck Bunny.mp4',
				type: 'video',
				path: '/Videos/Big Buck Bunny.mp4',
				size: 158008374,
				modified: '2026-06-28',
				thumbnail: 'https://picsum.photos/seed/vid1/400/225',
				/** @type {string} */
				src: PLACEHOLDER_VIDEOS[0],
			},
			{
				id: 'v2',
				name: 'Elephants Dream.mp4',
				type: 'video',
				path: '/Videos/Elephants Dream.mp4',
				size: 228000000,
				modified: '2026-06-20',
				thumbnail: 'https://picsum.photos/seed/vid2/400/225',
				/** @type {string} */
				src: PLACEHOLDER_VIDEOS[1],
			},
		],
	},
	{
		id: 'f3',
		name: 'Documents',
		type: 'folder',
		path: '/Documents',
		size: 0,
		modified: '2026-07-08',
		color: '#2ecc71',
		children: [
			{
				id: 'd1',
				name: 'resume.pdf',
				type: 'document',
				path: '/Documents/resume.pdf',
				size: 245000,
				modified: '2026-07-08',
			},
			{
				id: 'd2',
				name: 'notes.md',
				type: 'document',
				path: '/Documents/notes.md',
				size: 12000,
				modified: '2026-07-07',
			},
			{
				id: 'd3',
				name: 'budget.csv',
				type: 'document',
				path: '/Documents/budget.csv',
				size: 8500,
				modified: '2026-07-01',
			},
		],
	},
	{
		id: 'f4',
		name: 'Music',
		type: 'folder',
		path: '/Music',
		size: 0,
		modified: '2026-05-15',
		color: '#e67e22',
		children: [
			{
				id: 'a1',
				name: 'playlist_summer.mp3',
				type: 'audio',
				path: '/Music/playlist_summer.mp3',
				size: 8500000,
				modified: '2026-05-15',
			},
			{
				id: 'a2',
				name: 'podcast_ep42.mp3',
				type: 'audio',
				path: '/Music/podcast_ep42.mp3',
				size: 45000000,
				modified: '2026-05-10',
			},
		],
	},
	{
		id: 'f5',
		name: 'backups.zip',
		type: 'archive',
		path: '/backups.zip',
		size: 524288000,
		modified: '2026-06-01',
	},
	{
		id: 'f6',
		name: 'readme.txt',
		type: 'other',
		path: '/readme.txt',
		size: 2048,
		modified: '2026-07-09',
	},
];

/**
 * Get the live array reference for a path in the tree.
 * Mutations to this array persist in mockFileSystem.
 * @param {string} path
 * @returns {FileItem[]}
 */
export const getFilesAtPath = (path) => {
	if (path === '/') return mockFileSystem;

	const parts = path.split('/').filter(Boolean);
	let current = mockFileSystem;

	for (const part of parts) {
		const folder = current.find((f) => f.name === part && f.type === 'folder');
		if (!folder || !folder.children) return [];
		current = folder.children;
	}

	return current;
};

/**
 * Find a folder node anywhere in the tree by id
 * @param {FileItem[]} items
 * @param {string} id
 * @returns {FileItem | null}
 */
export const findFolderById = (items, id) => {
	for (const item of items) {
		if (item.id === id && item.type === 'folder') return item;
		if (item.children) {
			const found = findFolderById(item.children, id);
			if (found) return found;
		}
	}
	return null;
};

/**
 * Remove items by id from an array (mutates in place)
 * @param {FileItem[]} arr
 * @param {Set<string>} ids
 * @returns {FileItem[]} the removed items
 */
export const spliceByIds = (arr, ids) => {
	const removed = [];
	for (let i = arr.length - 1; i >= 0; i--) {
		if (ids.has(arr[i].id)) {
			removed.push(...arr.splice(i, 1));
		}
	}
	return removed;
};

/**
 * @param {string} path
 * @returns {FileItem[]}
 */
export const getImagesAtPath = (path) => {
	return getFilesAtPath(path).filter((f) => f.type === 'image');
};

/**
 * @param {number} bytes
 * @returns {string}
 */
export const formatSize = (bytes) => {
	if (bytes === 0) return '--';
	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};
