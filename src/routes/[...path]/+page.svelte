<script>
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import FileGrid from '$lib/components/FileGrid.svelte';
	import UploadZone from '$lib/components/UploadZone.svelte';
	import UploadProgress from '$lib/components/UploadProgress.svelte';
	import NewFolderDialog from '$lib/components/NewFolderDialog.svelte';
	import NewDocDialog from '$lib/components/NewDocDialog.svelte';
	import RenameDialog from '$lib/components/RenameDialog.svelte';
	import { files } from '$lib/stores/files.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import { quickactions } from '$lib/stores/quickactions.svelte.js';

	const handleDeleteSelected = async () => {
		const count = files.selectedCount;
		const ok = await ui.confirm('Delete files', `Move ${count} item${count > 1 ? 's' : ''} to trash?`);
		if (ok) files.deleteSelected();
	};

	const handleEmptyTrash = async () => {
		const ok = await ui.confirm('Empty trash', 'Permanently delete all items in trash? This cannot be undone.', { confirmLabel: 'Empty Trash' });
		if (ok) files.emptyTrash();
	};

	// Sort dropdown
	let showSortMenu = $state(false);

	// Filter dropdown
	let showFilterMenu = $state(false);

	/** @type {Record<string, string>} */
	const typeLabels = {
		image: 'Images',
		video: 'Videos',
		audio: 'Audio',
		document: 'Documents',
		archive: 'Archives',
		other: 'Other',
	};

	const sortOptions = [
		{ key: 'name', label: 'Name' },
		{ key: 'size', label: 'Size' },
		{ key: 'date', label: 'Date' },
		{ key: 'type', label: 'Type' },
	];

	const handleSort = (/** @type {string} */ key) => {
		files.setSort(/** @type {'name'|'size'|'date'|'type'} */ (key));
		showSortMenu = false;
	};

	// Close other menus when one opens
	$effect(() => {
		if (showSortMenu) showFilterMenu = false;
	});
	$effect(() => {
		if (showFilterMenu) showSortMenu = false;
	});

	// Search
	let searchOpen = $state(false);
	let hadSearchQuery = false;

	// Close search bar when search is cleared externally (e.g. clicking a folder in results)
	$effect(() => {
		const searching = files.isSearching;
		if (hadSearchQuery && !searching) {
			searchOpen = false;
		}
		hadSearchQuery = searching;
	});

	const handleSearchInput = (/** @type {Event} */ e) => {
		files.search(/** @type {HTMLInputElement} */ (e.target).value);
	};

	let searchBarEl = $state(null);

	const closeSearch = () => {
		searchOpen = false;
		files.clearSearch();
	};

	const handlePageClick = (/** @type {MouseEvent} */ e) => {
		if (searchOpen && searchBarEl && !searchBarEl.contains(/** @type {Node} */ (e.target))) {
			// Don't close if the click was on the search toggle button
			if (/** @type {HTMLElement} */ (e.target).closest('[aria-label="Search"]')) return;
			closeSearch();
		}
	};

	// Grid size labels
	const gridSizeIcon = { small: 'S', medium: 'M', large: 'L' };

	const handleDownloadSelected = () => {
		const selected = files.items.filter((f) => files.selected.has(f.id) && f.type !== 'folder');
		for (const item of selected) {
			const a = document.createElement('a');
			a.href = files.getDownloadUrl(item.key);
			a.download = item.name;
			a.click();
		}
	};

	// Global drag-to-upload detection
	let dragOverPage = $state(false);
	let dragCounter = 0;

	const handlePageDragEnter = (/** @type {DragEvent} */ e) => {
		// Only react to external file drags, not internal item drags
		if (!e.dataTransfer?.types?.includes('Files')) return;
		dragCounter++;
		dragOverPage = true;
	};

	const handlePageDragLeave = () => {
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			dragOverPage = false;
		}
	};

	const handlePageDrop = async (/** @type {DragEvent} */ e) => {
		e.preventDefault();
		dragCounter = 0;
		dragOverPage = false;
		if (!e.dataTransfer?.items?.length) return;

		/** @type {File[]} */
		const collected = [];
		const items = [...e.dataTransfer.items];

		const readDirRecursive = (/** @type {FileSystemDirectoryEntry} */ dirEntry, /** @type {string} */ basePath = '') => {
			const path = basePath ? `${basePath}/${dirEntry.name}` : dirEntry.name;
			return new Promise((resolve, reject) => {
				const reader = dirEntry.createReader();
				/** @type {File[]} */
				const allFiles = [];
				const readBatch = () => {
					reader.readEntries(async (entries) => {
						if (entries.length === 0) { resolve(allFiles); return; }
						for (const entry of entries) {
							try {
								if (entry.isFile) {
									const file = await new Promise((res, rej) => {
										/** @type {FileSystemFileEntry} */ (entry).file(res, rej);
									});
									allFiles.push(new File([file], `${path}/${entry.name}`, { type: file.type, lastModified: file.lastModified }));
								} else if (entry.isDirectory) {
									const sub = await readDirRecursive(/** @type {FileSystemDirectoryEntry} */ (entry), path);
									allFiles.push(...sub);
								}
							} catch (err) {
								console.warn('Skipping unreadable entry:', entry.name, err);
							}
						}
						readBatch();
					}, reject);
				};
				readBatch();
			});
		};

		// Capture entries synchronously before any await
		const hasEntryApi = typeof items[0]?.webkitGetAsEntry === 'function';
		const entries = hasEntryApi
			? items.map((item) => item.webkitGetAsEntry()).filter(Boolean)
			: [];

		if (entries.length > 0) {
			for (const entry of entries) {
				try {
					if (entry.isDirectory) {
						const dirFiles = await readDirRecursive(/** @type {FileSystemDirectoryEntry} */ (entry));
						collected.push(...dirFiles);
					} else if (entry.isFile) {
						const file = await new Promise((resolve, reject) => {
							/** @type {FileSystemFileEntry} */ (entry).file(resolve, reject);
						});
						collected.push(file);
					}
				} catch (err) {
					console.error('Error reading dropped entry:', entry.name, err);
				}
			}
		} else {
			// Fallback: no entry API, use flat file list but validate readability
			for (const f of (e.dataTransfer.files || [])) {
				try {
					await f.slice(0, 1).arrayBuffer();
					collected.push(f);
				} catch {
					console.warn('Skipping unreadable file:', f.name);
				}
			}
		}

		if (collected.length > 0) {
			files.uploadFiles(collected);
		}
	};

	const handlePageDragOver = (/** @type {DragEvent} */ e) => {
		if (e.dataTransfer?.types?.includes('Files')) {
			e.preventDefault();
		}
	};

	/** Generic clipboard filenames that need a timestamp to avoid overwrites */
	const CLIPBOARD_NAMES = new Set(['image.png', 'image.jpeg', 'image.jpg', 'image.gif', 'image.webp', 'image.bmp']);

	const handlePaste = (/** @type {ClipboardEvent} */ e) => {
		if (files.isTrash) return;
		// Don't intercept paste in input fields
		const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || /** @type {HTMLElement} */ (e.target)?.isContentEditable) return;

		const items = e.clipboardData?.items;
		if (!items) return;

		/** @type {File[]} */
		const pastedFiles = [];
		for (const item of items) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (!file) continue;
				// Rename generic clipboard files to avoid silent overwrites
				if (CLIPBOARD_NAMES.has(file.name.toLowerCase())) {
					const now = new Date();
					const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
					const ext = file.name.split('.').pop();
					const renamed = new File([file], `paste_${ts}.${ext}`, { type: file.type, lastModified: file.lastModified });
					pastedFiles.push(renamed);
				} else {
					pastedFiles.push(file);
				}
			}
		}
		if (pastedFiles.length > 0) {
			e.preventDefault();
			files.uploadFiles(pastedFiles);
		}
	};
</script>

<svelte:window
	onclick={handlePageClick}
	onpaste={handlePaste}
	ondragenter={handlePageDragEnter}
	ondragleave={handlePageDragLeave}
	ondrop={handlePageDrop}
	ondragover={handlePageDragOver}
/>

<div class="page-header">
	{#if files.hasSelection}
		<div class="selection-bar">
			<button class="selection-close" onclick={() => files.clearSelection()} aria-label="Clear selection">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
			<span class="selection-count">{files.selectedCount} selected</span>
			<div class="selection-actions">
				{#if files.isTrash}
					<button class="sel-action" onclick={() => files.restoreSelected()} aria-label="Restore" title="Restore">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="1,4 1,10 7,10" />
							<path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
						</svg>
					</button>
				{:else}
					<button class="sel-action" onclick={handleDownloadSelected} aria-label="Download">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
							<polyline points="7,10 12,15 17,10" />
							<line x1="12" y1="15" x2="12" y2="3" />
						</svg>
					</button>
					<button class="sel-action danger" onclick={handleDeleteSelected} aria-label="Delete">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3,6 5,6 21,6" />
							<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
						</svg>
					</button>
				{/if}
			</div>
		</div>
	{:else}
		{#if searchOpen}
			<div class="search-bar" bind:this={searchBarEl}>
				<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="search-input"
					type="text"
					placeholder="Search files..."
					value={files.searchQuery}
					oninput={handleSearchInput}
					onkeydown={(e) => { if (e.key === 'Escape') closeSearch(); }}
					autofocus
				/>
				{#if files.searchLoading}
					<span class="search-spinner"></span>
				{/if}
				<button class="search-close" onclick={closeSearch} aria-label="Close search">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
		{:else}
			<Breadcrumbs />
		{/if}
		<div class="header-actions">
			{#if !searchOpen}
				<button class="action-btn" onclick={() => (searchOpen = true)} aria-label="Search" title="Search">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
				</button>
			{/if}
			<button
				class="action-btn with-label"
				class:active={files.selectMode}
				onclick={() => files.toggleSelectMode()}
				aria-label="Toggle select mode"
				title="Select"
			>
				<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M9 12l2 2 4-4" />
				</svg>
				<span>Select</span>
			</button>
			<button class="action-btn with-label" onclick={() => files.selectAll()} aria-label="Select all" title="Select all">
				<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M8 12h8" />
				</svg>
				<span>All</span>
			</button>
			{#if files.isTrash}
				<button
					class="action-btn danger-btn"
					onclick={handleEmptyTrash}
					aria-label="Empty trash"
				>
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="3 6 5 6 21 6" />
						<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
						<path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
					</svg>
					<span>Empty Trash</span>
				</button>
			{:else if !files.isTrash}
				<div class="action-divider desktop-only"></div>
				<button class="action-btn desktop-only" onclick={() => (ui.openNewFolder())} aria-label="New folder" title="New folder">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
						<line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
					</svg>
				</button>
				<button class="action-btn desktop-only" onclick={() => (ui.openNewDoc())} aria-label="New document" title="New document">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
						<polyline points="14 2 14 8 20 8" />
						<line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
					</svg>
				</button>
				<button class="action-btn desktop-only" onclick={() => (ui.openUpload())} aria-label="Upload" title="Upload">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
						<polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
					</svg>
				</button>
				<!-- Quick actions — hidden for now, not useful enough yet -->
				<!-- <button class="action-btn desktop-only" onclick={() => quickactions.openMenu()} aria-label="Quick actions" title="Quick actions">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
					</svg>
				</button> -->
			{/if}
			<div class="action-divider desktop-only"></div>
			<!-- Filter by type -->
			{#if files.availableTypes.length > 0}
				<div class="sort-wrapper desktop-only">
					<button
						class="action-btn"
						class:active={files.isFiltering}
						onclick={() => (showFilterMenu = !showFilterMenu)}
						aria-label="Filter by type"
						title="Filter by type"
					>
						<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
						</svg>
					</button>
					{#if showFilterMenu}
						<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
						<div class="sort-backdrop" onclick={() => (showFilterMenu = false)}></div>
						<div class="sort-menu filter-menu">
							{#each files.availableTypes as type}
								<label class="filter-option">
									<input
										type="checkbox"
										checked={files.filterTypes.has(type)}
										onchange={() => files.toggleFilterType(type)}
									/>
									<span>{typeLabels[type] ?? type}</span>
								</label>
							{/each}
							{#if files.isFiltering}
								<div class="filter-divider"></div>
								<button class="sort-option" onclick={() => { files.clearFilters(); showFilterMenu = false; }}>
									Clear filters
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
			<!-- Sort -->
			<div class="sort-wrapper desktop-only">
				<button class="action-btn" onclick={() => (showSortMenu = !showSortMenu)} aria-label="Sort" title="Sort by {files.sortBy}">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						{#if files.sortDir === 'asc'}
							<path d="M12 5v14M5 12l7-7 7 7" />
						{:else}
							<path d="M12 5v14M19 12l-7 7-7-7" />
						{/if}
					</svg>
				</button>
				{#if showSortMenu}
					<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
					<div class="sort-backdrop" onclick={() => (showSortMenu = false)}></div>
					<div class="sort-menu">
						{#each sortOptions as opt}
							<button
								class="sort-option"
								class:active={files.sortBy === opt.key}
								onclick={() => handleSort(opt.key)}
							>
								{opt.label}
								{#if files.sortBy === opt.key}
									<span class="sort-dir">{files.sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<!-- Grid size (grid view only) -->
			{#if files.viewMode === 'grid'}
				<button class="action-btn desktop-only" onclick={() => files.cycleGridSize()} aria-label="Grid size" title="Grid size: {files.gridSize}">
					{#if files.gridSize === 'small'}
						<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
							<rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
						</svg>
					{:else if files.gridSize === 'medium'}
						<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" />
							<rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" />
						</svg>
					{:else}
						<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="2" y="2" width="20" height="9" rx="1" /><rect x="2" y="13" width="20" height="9" rx="1" />
						</svg>
					{/if}
				</button>
			{/if}
			<button class="action-btn desktop-only" onclick={files.toggleViewMode} aria-label="Toggle view" title={files.viewMode === 'grid' ? 'List view' : 'Grid view'}>
				{#if files.viewMode === 'grid'}
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
						<line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
					</svg>
				{:else}
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
					</svg>
				{/if}
			</button>
		</div>
	{/if}
</div>

<FileGrid />

{#if dragOverPage && !files.isTrash}
	<div class="drag-overlay">
		<div class="drag-content">
			<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.8">
				<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
				<polyline points="17,8 12,3 7,8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			<p>Drop files to upload</p>
		</div>
	</div>
{/if}

{#if ui.showUpload}
	<UploadZone onClose={() => ui.closeUpload()} />
{/if}

{#if ui.showNewFolder}
	<NewFolderDialog onClose={() => ui.closeNewFolder()} />
{/if}

{#if ui.showNewDoc}
	<NewDocDialog onClose={() => ui.closeNewDoc()} />
{/if}

{#if ui.renameTarget}
	<RenameDialog />
{/if}

{#if !ui.showUpload}
	<UploadProgress />
{/if}

<style>
	.page-header {
		position: sticky;
		top: -16px;
		z-index: 10;
		background: var(--bg-primary);
		margin: -16px -16px 0;
		padding: 16px 16px 8px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 36px;
	}

	@media (min-width: 768px) {
		.page-header {
			top: -24px;
			margin: -24px -32px 0;
			padding: 24px 32px 8px;
		}
	}

	.header-actions {
		display: flex;
		gap: 4px;
	}

	.icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: block;
	}

	.action-btn {
		padding: 8px;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		transition: all var(--transition);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.action-btn.with-label {
		gap: 5px;
		font-size: 13px;
	}

	.action-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.action-btn.active {
		background: var(--accent-dim);
		color: var(--accent);
	}

	.action-divider {
		width: 1px;
		height: 18px;
		background: var(--border);
		align-self: center;
		margin: 0 2px;
	}

	.desktop-only {
		display: none;
	}

	@media (min-width: 768px) {
		.desktop-only {
			display: flex;
		}
	}

	.selection-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 36px;
		animation: slide-in 0.15s ease-out;
	}

	@keyframes slide-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.selection-close {
		padding: 6px;
		border-radius: 50%;
		color: var(--text-secondary);
		transition: all var(--transition);
	}

	.selection-close:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.selection-count {
		font-size: 14px;
		font-weight: 500;
		color: var(--accent);
	}

	.selection-actions {
		margin-left: auto;
		display: flex;
		gap: 4px;
	}

	.sel-action {
		padding: 8px;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		transition: all var(--transition);
	}

	.sel-action:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.sel-action.danger:hover {
		background: rgba(231, 76, 60, 0.1);
		color: var(--danger);
	}

	.danger-btn {
		color: var(--danger) !important;
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
	}

	.danger-btn:hover {
		background: rgba(231, 76, 60, 0.1) !important;
	}

	/* Search bar */
	.search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 6px 12px;
		margin-right: 8px;
		animation: slide-in 0.15s ease-out;
	}

	.search-bar .icon {
		color: var(--text-muted);
		width: 16px;
		height: 16px;
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		color: var(--text-primary);
		font-size: 14px;
		font-family: inherit;
		outline: none;
		min-width: 0;
	}

	.search-input::placeholder {
		color: var(--text-muted);
	}

	.search-close {
		padding: 4px;
		border-radius: 50%;
		color: var(--text-muted);
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.search-close:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.search-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Sort */
	.sort-wrapper {
		position: relative;
	}

	.sort-backdrop {
		position: fixed;
		inset: 0;
		z-index: 19;
	}

	.sort-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 4px;
		min-width: 120px;
		z-index: 20;
		animation: dialog-in 0.15s ease-out;
	}

	@keyframes dialog-in {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	.sort-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 8px 12px;
		font-size: 13px;
		border-radius: 4px;
		color: var(--text-secondary);
		transition: all var(--transition);
	}

	.sort-option:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.sort-option.active {
		color: var(--accent);
	}

	.sort-dir {
		font-weight: 600;
		font-size: 12px;
	}

	.filter-menu {
		min-width: 150px;
	}

	.filter-option {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--text-secondary);
		border-radius: 4px;
		cursor: pointer;
		transition: all var(--transition);
	}

	.filter-option:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.filter-option input[type="checkbox"] {
		accent-color: var(--accent);
	}

	.filter-divider {
		height: 1px;
		background: var(--border);
		margin: 4px 8px;
	}

	/* Drag overlay */
	.drag-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.drag-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		border: 2px dashed var(--accent);
		border-radius: 20px;
		padding: 48px 64px;
		background: var(--accent-dim);
	}

	.drag-content p {
		font-size: 16px;
		font-weight: 500;
		color: var(--accent);
	}
</style>
