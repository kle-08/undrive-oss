<script>
	import * as api from '$lib/api/client.js';
	import FileIcon from './FileIcon.svelte';

	let { open = $bindable(false), mode = 'file', filter = 'image', initialPrefix = '', onSelect } = $props();

	let prefix = $state('');
	let items = $state([]);
	let loading = $state(false);
	let wasOpen = $state(false);
	let viewMode = $state(localStorage.getItem('picker_view') || 'grid');
	let breadcrumbs = $derived(buildBreadcrumbs(prefix));

	const toggleView = () => {
		viewMode = viewMode === 'grid' ? 'list' : 'grid';
		localStorage.setItem('picker_view', viewMode);
	};

	function buildBreadcrumbs(p) {
		const parts = p.replace(/\/$/, '').split('/').filter(Boolean);
		return [
			{ name: 'Home', prefix: '' },
			...parts.map((part, i) => ({
				name: part,
				prefix: parts.slice(0, i + 1).join('/') + '/',
			})),
		];
	}

	async function loadFolder(newPrefix) {
		prefix = newPrefix;
		loading = true;
		try {
			const result = await api.listFiles(prefix);
			const folders = result.folders.map((f) => ({ ...f, type: 'folder' }));
			if (mode === 'folder') {
				// Show folders as navigable + images as preview
				const previews = result.files
					.filter((f) => f.type === 'image')
					.map((f) => ({ ...f, preview: true }));
				items = [...folders, ...previews];
			} else {
				const files = result.files.filter((f) => {
					if (filter === 'image') return f.type === 'image';
					if (filter === 'video') return f.type === 'video';
					return true;
				});
				items = [...folders, ...files];
			}
		} catch {
			items = [];
		} finally {
			loading = false;
		}
	}

	function handleItemClick(item) {
		if (item.type === 'folder') {
			loadFolder(item.key);
			return;
		}
		// File selected (or preview image clicked in folder mode)
		onSelect?.(item.key, item);
		open = false;
	}

	function handleSelectFolder() {
		onSelect?.(prefix, null);
		open = false;
	}

	$effect(() => {
		if (open && !wasOpen) {
			wasOpen = true;
			loadFolder(initialPrefix || '');
		}
		if (!open && wasOpen) {
			wasOpen = false;
		}
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="picker-overlay" onclick={() => (open = false)}>
		<div class="picker-modal" onclick={(e) => e.stopPropagation()}>
			<div class="picker-header">
				<span class="picker-title">{mode === 'folder' ? 'Select Folder' : 'Select File'}</span>
				<div class="picker-header-actions">
					<button class="picker-view-btn" onclick={toggleView} aria-label="Toggle view">
						{#if viewMode === 'grid'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
								<line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
							</svg>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
								<rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
							</svg>
						{/if}
					</button>
					<button class="picker-close" onclick={() => (open = false)} aria-label="Close">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<div class="picker-breadcrumbs">
				{#each breadcrumbs as crumb, i}
					{#if i > 0}<span class="sep">/</span>{/if}
					<button class="crumb" onclick={() => loadFolder(crumb.prefix)}>{crumb.name}</button>
				{/each}
			</div>

			<div class="picker-list" class:grid-view={viewMode === 'grid'}>
				{#if loading}
					<div class="picker-loading">Loading...</div>
				{:else if items.length === 0}
					<div class="picker-empty">{mode === 'folder' ? 'Empty folder' : 'No items'}</div>
				{:else}
					{#each items as item (item.key)}
						{#if item.preview}
							<button class="picker-item preview" class:grid-item={viewMode === 'grid'} onclick={() => handleItemClick(item)}>
								{#if viewMode === 'grid' && item.url}
									<img src={item.url} alt={item.name} class="grid-thumb" />
									<span class="grid-name">{item.name}</span>
								{:else}
									{#if item.url}
										<img src={item.url} alt={item.name} class="picker-thumb" />
									{:else}
										<FileIcon type={item.type} size={20} />
									{/if}
									<span class="picker-item-name">{item.name}</span>
								{/if}
							</button>
						{:else}
							<button class="picker-item" class:grid-item={viewMode === 'grid'} onclick={() => handleItemClick(item)}>
								{#if viewMode === 'grid' && item.type !== 'folder' && item.url}
									<img src={item.url} alt={item.name} class="grid-thumb" />
									<span class="grid-name">{item.name}</span>
								{:else}
									{#if item.type === 'folder'}
										<FileIcon type="folder" size={20} />
									{:else if item.url}
										<img src={item.url} alt={item.name} class="picker-thumb" />
									{:else}
										<FileIcon type={item.type} size={20} />
									{/if}
									<span class="picker-item-name">{item.name}</span>
								{/if}
							</button>
						{/if}
					{/each}
				{/if}
			</div>

			{#if mode === 'folder'}
				<div class="picker-footer">
					<button class="picker-select-btn" onclick={handleSelectFolder}>
						Select this folder
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.picker-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.picker-modal {
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		width: 90vw;
		max-width: 600px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	.picker-title {
		font-size: 14px;
		font-weight: 600;
	}

	.picker-header-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.picker-view-btn,
	.picker-close {
		padding: 4px;
		border-radius: 4px;
		color: var(--text-secondary);
	}

	.picker-view-btn:hover,
	.picker-close:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.picker-breadcrumbs {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 16px;
		font-size: 12px;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border-subtle);
		flex-wrap: wrap;
	}

	.sep {
		opacity: 0.5;
	}

	.crumb {
		color: var(--text-secondary);
		font-size: 12px;
		padding: 2px 4px;
		border-radius: 3px;
	}

	.crumb:hover {
		background: var(--bg-hover);
		color: var(--accent);
	}

	.picker-list {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 8px;
	}

	.picker-loading,
	.picker-empty {
		padding: 32px;
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
	}

	.picker-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		text-align: left;
		font-size: 13px;
		color: var(--text-primary);
		transition: background var(--transition);
	}

	.picker-item:not(.preview):hover {
		background: var(--bg-hover);
	}

	.picker-item.preview:hover {
		background: var(--bg-hover);
	}

	.picker-thumb {
		width: 20px;
		height: 20px;
		object-fit: cover;
		border-radius: 3px;
	}

	.picker-item-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Grid view */
	.picker-list.grid-view {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}

	.grid-item {
		flex-direction: column;
		padding: 4px;
		gap: 4px;
		border-radius: 6px;
		min-width: 0;
	}

	.grid-thumb {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 4px;
	}

	.grid-name {
		font-size: 10px;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		width: 100%;
		text-align: center;
	}

	/* Folders in grid view stay as list items spanning full width */
	.picker-list.grid-view .picker-item:not(.grid-item) {
		grid-column: 1 / -1;
	}

	.picker-footer {
		padding: 12px 16px;
		border-top: 1px solid var(--border);
	}

	.picker-select-btn {
		width: 100%;
		padding: 8px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: white;
		font-size: 13px;
		font-weight: 500;
		transition: opacity var(--transition);
	}

	.picker-select-btn:hover {
		opacity: 0.85;
	}
</style>
