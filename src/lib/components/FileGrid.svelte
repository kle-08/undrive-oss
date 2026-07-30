<script>
	import { files } from '$lib/stores/files.svelte.js';
	import { viewer } from '$lib/stores/viewer.svelte.js';
	import { editor } from '$lib/stores/editor.svelte.js';
	import { vault } from '$lib/stores/vault.svelte.js';
	import { extensions } from '$lib/extensions/registry.svelte.js';
	import { formatSize } from '$lib/mock/data.js';
	import FileIcon from './FileIcon.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import VideoThumb from './VideoThumb.svelte';
	import { onMount } from 'svelte';


	/** @type {IntersectionObserver|null} */
	let gridObserver = null;
	let visibleIds = $state(new Set());

	onMount(() => {
		gridObserver = new IntersectionObserver(
			(entries) => {
				let changed = false;
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const id = /** @type {HTMLElement} */ (entry.target).dataset.id;
					if (id && !visibleIds.has(id)) {
						visibleIds.add(id);
						changed = true;
					}
				}
				if (changed) visibleIds = new Set(visibleIds);
			},
			{ rootMargin: '400px' }
		);
		return () => gridObserver?.disconnect();
	});

	const observeItem = (/** @type {HTMLElement} */ node) => {
		gridObserver?.observe(node);
		return { destroy: () => gridObserver?.unobserve(node) };
	};
	import { goto } from '$app/navigation';

	import { ui } from '$lib/stores/ui.svelte.js';
	import { sharing } from '$lib/stores/sharing.svelte.js';

	const confirmDelete = async () => {
		const count = files.selectedCount;
		const ok = await ui.confirm('Delete files', `Move ${count} item${count > 1 ? 's' : ''} to trash?`);
		if (ok) files.deleteSelected();
	};

	const confirmFlatten = async (/** @type {import('$lib/mock/data.js').FileItem} */ item) => {
		const ok = await ui.confirm(
			'Flatten folder',
			`Move everything inside "${item.name}" up to the parent folder and remove "${item.name}"?`
		);
		if (ok) files.flattenFolder(item.id);
	};


	// Context menu state
	let contextMenu = $state(null);

	// Drag and drop state
	let dragId = $state(null);
	let dropTargetId = $state(null);

	// Drop action menu (move vs copy)
	let dropMenu = $state(null);

	// Marquee selection state
	let marquee = $state(null);
	let marqueeActive = $state(false);
	let containerEl = $state(null);

	// Long press for mobile select
	let longPressTimer = $state(null);

	// Detect touch device
	const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

	const BROWSER_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
	const RAW_IMAGE_EXTS = ['dng', 'cr2', 'arw', 'nef', 'orf', 'rw2', 'raf'];
	const PLAYABLE_EXTS = ['mp4', 'mov', 'm4v', 'webm', 'mp3', 'aac', 'm4a', 'ogg', 'wav', 'flac'];
	const TEXT_DOC_EXTS = ['md', 'markdown', 'html', 'htm', 'txt', 'json', 'csv'];
	const isTextDoc = (/** @type {string} */ name) => TEXT_DOC_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '');

	const canPlayInBrowser = (/** @type {string} */ name) => {
		const ext = name.split('.').pop()?.toLowerCase() ?? '';
		return PLAYABLE_EXTS.includes(ext);
	};

	const canRenderImage = (/** @type {string} */ name) => {
		const ext = name.split('.').pop()?.toLowerCase() ?? '';
		return BROWSER_IMAGE_EXTS.includes(ext);
	};

	const isRawImage = (/** @type {string} */ name) => {
		const ext = name.split('.').pop()?.toLowerCase() ?? '';
		return RAW_IMAGE_EXTS.includes(ext);
	};

	const openItem = (/** @type {import('$lib/mock/data.js').FileItem} */ item) => {
		if (item.isVaultRoot) {
			files.enterVault();
			return;
		}
		if (item.type === 'folder') {
			if (files.isVault) {
				files.navigateVault(item.key);
				return;
			}
			files.clearSearch();
			const urlPath = '/' + item.path.replace(/\/+$/, '');
			goto(urlPath);
			return;
		}
		if (isTextDoc(item.name)) {
			editor.openDoc(item.key, item.name);
			return;
		}
		if (item.type === 'image') {
			const images = files.items.filter((f) => f.type === 'image');
			const index = images.findIndex((f) => f.id === item.id);
			viewer.openViewer(images, index, 'image');
			return;
		}
		if (item.type === 'video' || item.type === 'audio') {
			if (!canPlayInBrowser(item.name)) {
				const a = document.createElement('a');
				a.href = files.getDownloadUrl(item.key);
				a.download = item.name;
				a.click();
				return;
			}
			// Audio plays through the same media player (<video> handles audio).
			viewer.openViewer([item], 0, 'video');
		}
	};

	/**
	 * Single click: open item. Ctrl/Cmd+click: toggle select. Shift+click: range select.
	 * In select mode, single click toggles selection.
	 * @param {MouseEvent} e
	 * @param {import('$lib/mock/data.js').FileItem} item
	 */
	const handleClick = (e, item) => {
		if (item.isVaultRoot) { openItem(item); return; }
		if (e.shiftKey) {
			e.preventDefault();
			files.rangeSelect(item.id);
			return;
		}
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			files.toggleSelect(item.id);
			return;
		}

		// In select mode (button toggled or already has selection), toggle
		if (files.selectMode || files.hasSelection) {
			files.toggleSelect(item.id);
			return;
		}

		// Normal click opens
		openItem(item);
	};

	/**
	 * @param {MouseEvent} e
	 * @param {import('$lib/mock/data.js').FileItem} item
	 */
	const handleContextMenu = (e, item) => {
		e.preventDefault();
		e.stopPropagation();

		if (!files.selected.has(item.id)) {
			files.selectOnly(item.id);
		}

		// The synthetic Vault folder gets its own minimal menu.
		if (item.isVaultRoot) {
			contextMenu = {
				x: e.clientX, y: e.clientY,
				items: [
					{
						label: 'Open',
						icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
						action: () => files.enterVault(),
					},
					{
						label: 'Change passphrase',
						icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
						action: () => vault.openChange(),
					},
					{ separator: true },
					{
						label: 'Lock vault',
						icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>',
						action: () => vault.lock(),
					},
				],
			};
			return;
		}

		const targetItems = files.items.filter((f) => files.selected.has(f.id));
		const isMulti = targetItems.length > 1;
		const label = isMulti ? `${targetItems.length} items` : item.name;

		// Trash view has a different context menu
		if (files.isTrash) {
			contextMenu = {
				x: e.clientX, y: e.clientY,
				items: [
					{
						label: 'Restore',
						icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 105.64-11.36L1 10"/></svg>',
						action: () => files.restoreSelected(),
					},
					{ separator: true },
					{
						label: 'Select all',
						icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
						shortcut: 'Ctrl+A',
						action: () => files.selectAll(),
					},
				],
			};
			return;
		}

		const folders = files.items.filter((f) => f.type === 'folder' && !files.selected.has(f.id));

		const isMd = !isMulti && item.name.toLowerCase().endsWith('.md');

		/** @type {any[]} */
		const menuItems = [
			{
				label: 'Open',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
				action: () => { if (!isMulti) openItem(item); },
			},
			...(isMd ? [{
				label: 'Open preview',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
				action: () => editor.openDoc(item.key, item.name, true),
			}] : []),
			{ separator: true },
			{
				label: 'Download',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
				action: () => {
					if (item.type !== 'folder') {
						const a = document.createElement('a');
						a.href = files.getDownloadUrl(item.key);
						a.download = item.name;
						a.click();
					}
				},
			},
		];

		if (!isMulti && item.type !== 'folder') {
			menuItems.push({
				label: 'Share',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
				action: () => sharing.openDialog(item.key, item.name),
			});
		}

		if (!isMulti) {
			for (const ext of extensions.fileActions) {
				if (!ext.show || ext.show(item)) {
					menuItems.push({ label: ext.label, icon: ext.icon, action: () => ext.action(item) });
				}
			}
		}

		if (folders.length > 0) {
			menuItems.push({
				label: 'Move to...',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>',
				action: () => { if (folders[0]) files.moveToFolder(folders[0].id); },
			});
		}

		if (!isMulti) {
			menuItems.push({
				label: 'Rename',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
				shortcut: 'F2',
				action: () => ui.openRename(item.id, item.name),
			});
		}

		if (!isMulti && item.type === 'folder') {
			menuItems.push({
				label: 'Flatten folder',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
				action: () => confirmFlatten(item),
			});
		}

		if (files.isVault) {
			menuItems.push({
				label: 'Move out of Vault',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
				action: () => files.moveToPrefix(''),
			});
		} else if (vault.unlocked) {
			menuItems.push({
				label: 'Move to Vault',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
				action: () => files.moveToPrefix('__vault/'),
			});
		}

		menuItems.push(
			{ separator: true },
			{
				label: 'Select all',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
				shortcut: 'Ctrl+A',
				action: () => files.selectAll(),
			},
			{ separator: true },
			{
				label: isMulti ? `Delete ${label}` : 'Delete',
				icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
				danger: true,
				action: () => confirmDelete(),
			}
		);

		contextMenu = { x: e.clientX, y: e.clientY, items: menuItems };
	};

	const handleBgContextMenu = (/** @type {MouseEvent} */ e) => {
		if (/** @type {HTMLElement} */ (e.target).closest('.grid-item, .list-item')) return;
		e.preventDefault();
		files.clearSelection();
		contextMenu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{
					label: 'New folder',
					icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
					action: () => ui.openNewFolder(),
				},
				{
					label: 'New document',
					icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>',
					action: () => ui.openNewDoc(),
				},
				{
					label: 'Upload files',
					icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
					action: () => ui.openUpload(),
				},
				{ separator: true },
				{
					label: 'Select all',
					icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
					shortcut: 'Ctrl+A',
					action: () => files.selectAll(),
				},
			],
		};
	};

	// Click background to deselect (skip if marquee just finished)
	const handleBgClick = (/** @type {MouseEvent} */ e) => {
		if (/** @type {HTMLElement} */ (e.target).closest('.grid-item, .list-item')) return;
		if (didMarquee) {
			didMarquee = false;
			return;
		}
		files.clearSelection();
	};

	// ===== MARQUEE (rubber-band) SELECTION =====
	let marqueeStartX = 0;
	let marqueeStartY = 0;
	let didMarquee = false;

	const handleMarqueeStart = (/** @type {MouseEvent} */ e) => {
		// Only start on left-click on background (not on items)
		if (e.button !== 0) return;
		if (/** @type {HTMLElement} */ (e.target).closest('.grid-item, .list-item')) return;
		if (isTouchDevice()) return;

		const containerRect = containerEl.getBoundingClientRect();
		marqueeStartX = e.clientX - containerRect.left;
		marqueeStartY = e.clientY - containerRect.top;

		marqueeActive = true;
		didMarquee = false;
		marquee = null;

		if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
			files.clearSelection();
		}

		window.addEventListener('mousemove', handleMarqueeMove);
		window.addEventListener('mouseup', handleMarqueeEnd);
	};

	const handleMarqueeMove = (/** @type {MouseEvent} */ e) => {
		if (!marqueeActive || !containerEl) return;

		const containerRect = containerEl.getBoundingClientRect();
		const currentX = e.clientX - containerRect.left;
		const currentY = e.clientY - containerRect.top;

		const x = Math.min(marqueeStartX, currentX);
		const y = Math.min(marqueeStartY, currentY);
		const w = Math.abs(currentX - marqueeStartX);
		const h = Math.abs(currentY - marqueeStartY);

		// Only show marquee if dragged more than 5px
		if (w < 5 && h < 5) return;

		didMarquee = true;
		marquee = { x, y, w, h };

		// Find items intersecting the marquee
		const selected = new Set();
		const items = containerEl.querySelectorAll('.grid-item, .list-item');
		items.forEach((/** @type {HTMLElement} */ el) => {
			const elRect = el.getBoundingClientRect();
			const elX = elRect.left - containerRect.left;
			const elY = elRect.top - containerRect.top;
			const elW = elRect.width;
			const elH = elRect.height;

			if (
				elX < x + w &&
				elX + elW > x &&
				elY < y + h &&
				elY + elH > y
			) {
				const id = el.dataset.id;
				if (id) selected.add(id);
			}
		});

		selected.delete('__vault/'); // never bulk-select the synthetic Vault folder
		files.setSelection(selected);
	};

	const handleMarqueeEnd = () => {
		marqueeActive = false;
		marquee = null;
		window.removeEventListener('mousemove', handleMarqueeMove);
		window.removeEventListener('mouseup', handleMarqueeEnd);
	};

	// ===== DRAG AND DROP =====
	const handleDragStart = (/** @type {DragEvent} */ e, /** @type {import('$lib/mock/data.js').FileItem} */ item) => {
		if (item.isVaultRoot) { e.preventDefault(); return; }
		dragId = item.id;
		// If dragged item isn't selected, select only it
		if (!files.selected.has(item.id)) {
			files.selectOnly(item.id);
		}
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', item.id);
		}
	};

	const handleDragOver = (/** @type {DragEvent} */ e, /** @type {import('$lib/mock/data.js').FileItem} */ item) => {
		e.preventDefault();
		if (!dragId) return;
		// Don't drop on yourself or on selected items
		if (files.selected.has(item.id)) return;

		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = item.type === 'folder' && e.altKey ? 'copy' : 'move';
		}
		dropTargetId = item.id;
	};

	const handleDragLeave = () => {
		dropTargetId = null;
	};

	const handleDrop = (/** @type {DragEvent} */ e, /** @type {import('$lib/mock/data.js').FileItem} */ item) => {
		e.preventDefault();
		if (!dragId) return;

		if (item.type === 'folder' && !files.selected.has(item.id)) {
			dropMenu = { x: e.clientX, y: e.clientY, folderId: item.id };
		} else if (!files.selected.has(item.id)) {
			files.reorderSelected(item.id);
		}

		dragId = null;
		dropTargetId = null;
	};

	const handleDropAction = (action) => {
		if (!dropMenu) return;
		if (action === 'move') files.moveToFolder(dropMenu.folderId);
		else if (action === 'copy') files.copyToFolder(dropMenu.folderId);
		dropMenu = null;
	};

	const handleDragEnd = () => {
		dragId = null;
		dropTargetId = null;
	};

	// Mobile long press
	const handleTouchStart = (/** @type {TouchEvent} */ e, /** @type {import('$lib/mock/data.js').FileItem} */ item) => {
		longPressTimer = setTimeout(() => {
			files.toggleSelect(item.id);
			if (navigator.vibrate) navigator.vibrate(30);
		}, 500);
	};

	const handleTouchEnd = () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	};

	// Keyboard shortcuts
	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		const tag = e.target?.tagName;
		const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;

		if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !inInput) {
			e.preventDefault();
			files.selectAll();
		}
		if (e.key === 'Escape') {
			if (dropMenu) { dropMenu = null; return; }
			files.clearSelection();
			contextMenu = null;
		}
		if (e.key === 'Delete' && files.hasSelection && !inInput) {
			confirmDelete();
		}
		if (e.key === 'F2' && files.selectedCount === 1) {
			e.preventDefault();
			const selectedId = [...files.selected][0];
			const item = files.items.find((f) => f.id === selectedId);
			if (item) ui.openRename(item.id, item.name);
		}
	};
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
{#if files.items.length === 0 && !files.loading}
	<div class="empty-state">
		{#if files.isSearching}
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5">
				<circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
			</svg>
			<p class="empty-title">No results found</p>
			<p class="empty-sub">Try a different search term</p>
		{:else if files.isTrash}
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5">
				<path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z" />
			</svg>
			<p class="empty-title">Trash is empty</p>
		{:else}
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5">
				<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
			</svg>
			<p class="empty-title">This folder is empty</p>
			<p class="empty-sub">Drop files here or use the upload button</p>
		{/if}
	</div>
{:else if files.viewMode === 'grid'}
	<div
		class="grid grid-{files.gridSize}"
		bind:this={containerEl}
		onclick={handleBgClick}
		oncontextmenu={handleBgContextMenu}
		onmousedown={handleMarqueeStart}
	>
		{#each files.items as item (item.id)}
			<button
				class="grid-item"
				class:selected={files.selected.has(item.id)}
				class:dragging={dragId !== null && files.selected.has(item.id)}
				class:drop-target={dropTargetId === item.id && item.type === 'folder' && !files.selected.has(item.id)}
				class:drop-reorder={dropTargetId === item.id && item.type !== 'folder' && !files.selected.has(item.id)}
				data-id={item.id}
				draggable="true"
				use:observeItem
				onclick={(e) => handleClick(e, item)}
				oncontextmenu={(e) => handleContextMenu(e, item)}
				ondragstart={(e) => handleDragStart(e, item)}
				ondragover={(e) => handleDragOver(e, item)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, item)}
				ondragend={handleDragEnd}
				ontouchstart={(e) => handleTouchStart(e, item)}
				ontouchend={handleTouchEnd}
				ontouchmove={handleTouchEnd}
			>
				{#if files.selectMode || files.hasSelection}
					<div class="checkbox" class:checked={files.selected.has(item.id)}>
						{#if files.selected.has(item.id)}
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
								<polyline points="20,6 9,17 4,12" />
							</svg>
						{/if}
					</div>
				{/if}
				<div class="thumbnail">
					{#if !visibleIds.has(item.id)}
						<div class="icon-wrap">
							<FileIcon type={item.type} color={item.color} size={48} />
						</div>
					{:else if item.type === 'video' && item.url}
						<VideoThumb videoUrl={item.url} videoKey={item.key || item.id} alt={item.name}>
							<div class="icon-wrap">
								<FileIcon type={item.type} color={item.color} size={48} />
							</div>
						</VideoThumb>
					{:else if item.thumbnail && (item.type === 'image' || item.type === 'video') && (canRenderImage(item.name) || isRawImage(item.name))}
						<img src={item.thumbnail} alt={item.name} />
						{#if item.type === 'video'}
							<div class="play-badge">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
									<polygon points="5,3 19,12 5,21" />
								</svg>
							</div>
						{/if}
					{:else if item.type === 'image' && item.url && (canRenderImage(item.name) || isRawImage(item.name))}
						<img src={item.url} alt={item.name} />
					{:else}
						<div class="icon-wrap">
							<FileIcon type={item.type} color={item.color} size={48} />
						</div>
					{/if}
				</div>
				<div class="item-info">
					<span class="item-name">{item.name}</span>
					{#if item.type !== 'folder'}<span class="item-meta">{formatSize(item.size)}</span>{/if}
				</div>
			</button>
		{/each}

		{#if marquee}
			<div
				class="marquee"
				style="left:{marquee.x}px; top:{marquee.y}px; width:{marquee.w}px; height:{marquee.h}px"
			></div>
		{/if}
	</div>
{:else}
	<div
		class="list"
		bind:this={containerEl}
		onclick={handleBgClick}
		oncontextmenu={handleBgContextMenu}
		onmousedown={handleMarqueeStart}
	>
		{#each files.items as item (item.id)}
			<button
				class="list-item"
				class:selected={files.selected.has(item.id)}
				class:dragging={dragId !== null && files.selected.has(item.id)}
				class:drop-target={dropTargetId === item.id && item.type === 'folder' && !files.selected.has(item.id)}
				class:drop-reorder={dropTargetId === item.id && item.type !== 'folder' && !files.selected.has(item.id)}
				data-id={item.id}
				draggable="true"
				onclick={(e) => handleClick(e, item)}
				oncontextmenu={(e) => handleContextMenu(e, item)}
				ondragstart={(e) => handleDragStart(e, item)}
				ondragover={(e) => handleDragOver(e, item)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, item)}
				ondragend={handleDragEnd}
				ontouchstart={(e) => handleTouchStart(e, item)}
				ontouchend={handleTouchEnd}
				ontouchmove={handleTouchEnd}
			>
				{#if files.selectMode || files.hasSelection}
					<div class="checkbox checkbox-sm" class:checked={files.selected.has(item.id)}>
						{#if files.selected.has(item.id)}
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
								<polyline points="20,6 9,17 4,12" />
							</svg>
						{/if}
					</div>
				{/if}
				<FileIcon type={item.type} color={item.color} size={24} />
				<span class="list-name">{item.name}</span>
				<span class="list-size">{item.type !== 'folder' ? formatSize(item.size) : ''}</span>
				<span class="list-date">{item.modified}</span>
			</button>
		{/each}

		{#if marquee}
			<div
				class="marquee"
				style="left:{marquee.x}px; top:{marquee.y}px; width:{marquee.w}px; height:{marquee.h}px"
			></div>
		{/if}
	</div>
{/if}

{#if contextMenu}
	<ContextMenu
		x={contextMenu.x}
		y={contextMenu.y}
		items={contextMenu.items}
		onClose={() => (contextMenu = null)}
	/>
{/if}

{#if dropMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="drop-menu-overlay" onclick={() => (dropMenu = null)}>
		<div class="drop-menu" style="left: {dropMenu.x}px; top: {dropMenu.y}px;">
			<button class="drop-menu-item" onmousedown={() => handleDropAction('move')}>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
				Move here
			</button>
			<button class="drop-menu-item" onmousedown={() => handleDropAction('copy')}>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
				Copy here
			</button>
		</div>
	</div>
{/if}

<style>
	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 64px 16px;
		min-height: calc(100dvh - 120px);
	}

	.empty-title {
		font-size: 15px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.empty-sub {
		font-size: 13px;
		color: var(--text-muted);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 12px;
		min-height: calc(100dvh - 120px);
		align-content: start;
		position: relative;
		user-select: none;
		-webkit-user-select: none;
	}

	@media (min-width: 768px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
			gap: 16px;
		}
	}

	/* Grid sizes */
	.grid.grid-small { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
	.grid.grid-large { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
	@media (min-width: 768px) {
		.grid.grid-small { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
		.grid.grid-large { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
	}

	.grid-small .item-info { padding: 6px 8px; }
	.grid-small .item-name { font-size: 11px; }
	.grid-small .item-meta { font-size: 10px; }
	.grid-large .item-info { padding: 12px; }
	.grid-large .item-name { font-size: 14px; }
	.grid-large .item-meta { font-size: 12px; }

	.grid-item {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary);
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border-subtle);
		transition: border-color var(--transition), background var(--transition), opacity var(--transition), box-shadow var(--transition);
		text-align: left;
		position: relative;
	}

	.grid-item:hover {
		border-color: var(--border);
		background: var(--bg-tertiary);
	}

	.grid-item:active {
		transform: scale(0.97);
	}

	.grid-item.selected {
		border-color: var(--accent);
		background: var(--accent-dim);
	}

	.grid-item.dragging {
		opacity: 0.4;
	}

	.grid-item.drop-target {
		border-color: var(--accent);
		background: var(--accent-dim);
		box-shadow: 0 0 0 2px var(--accent);
	}

	.grid-item.drop-reorder {
		border-left: 3px solid var(--accent);
	}

	/* Checkbox */
	.checkbox {
		position: absolute;
		top: 8px;
		left: 8px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.5);
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(4px);
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition);
	}

	.checkbox.checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.checkbox-sm {
		position: static;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}

	.thumbnail {
		aspect-ratio: 1;
		overflow: hidden;
		position: relative;
		background: var(--bg-tertiary);
	}

	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}

	.icon-wrap {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.play-badge {
		position: absolute;
		bottom: 8px;
		right: 8px;
		width: 32px;
		height: 32px;
		background: rgba(0, 0, 0, 0.7);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(4px);
	}

	.item-info {
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item-name {
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-meta {
		font-size: 11px;
		color: var(--text-muted);
	}

	/* List view */
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: calc(100dvh - 120px);
		position: relative;
		user-select: none;
		-webkit-user-select: none;
	}

	.list-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		transition: background var(--transition);
		text-align: left;
		border: 1px solid transparent;
	}

	.list-item:hover {
		background: var(--bg-hover);
	}

	.list-item:active {
		background: var(--bg-active);
	}

	.list-item.selected {
		background: var(--accent-dim);
		border-color: transparent;
	}

	.list-item.dragging {
		opacity: 0.4;
	}

	.list-item.drop-target {
		background: var(--accent-dim);
		border-color: var(--accent);
	}

	.list-item.drop-reorder {
		border-top: 2px solid var(--accent);
	}

	.list-name {
		flex: 1;
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.list-size {
		font-size: 12px;
		color: var(--text-muted);
		min-width: 60px;
		text-align: right;
	}

	.list-date {
		font-size: 12px;
		color: var(--text-muted);
		min-width: 80px;
		text-align: right;
		display: none;
	}

	@media (min-width: 768px) {
		.list-date {
			display: block;
		}
	}

	/* Drop action menu */
	.drop-menu-overlay {
		position: fixed;
		inset: 0;
		z-index: 300;
	}

	.drop-menu {
		position: fixed;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px;
		min-width: 140px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		animation: slash-in 0.1s ease-out;
		z-index: 301;
	}

	.drop-menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 13px;
		color: var(--text-primary);
		text-align: left;
		transition: background var(--transition);
	}

	.drop-menu-item:hover {
		background: var(--bg-hover);
	}

	/* Marquee selection */
	.marquee {
		position: absolute;
		border: 1px solid var(--accent);
		background: rgba(79, 156, 247, 0.1);
		border-radius: 2px;
		pointer-events: none;
		z-index: 50;
	}
</style>
