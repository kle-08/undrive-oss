<script>
	import { files } from '$lib/stores/files.svelte.js';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as api from '$lib/api/client.js';
	import TreeNode from './TreeNode.svelte';
	import { sharing } from '$lib/stores/sharing.svelte.js';
	import { vault } from '$lib/stores/vault.svelte.js';

	let { open = $bindable(false) } = $props();

	// Secret trigger: tap the Storage footer 7x within 2s to reveal the vault.
	let vaultTaps = 0;
	/** @type {ReturnType<typeof setTimeout>|null} */
	let vaultTapTimer = null;
	const tapStorage = () => {
		vaultTaps++;
		if (vaultTapTimer) clearTimeout(vaultTapTimer);
		vaultTapTimer = setTimeout(() => { vaultTaps = 0; }, 2000);
		if (vaultTaps >= 7) {
			vaultTaps = 0;
			vault.trigger();
		}
	};

	let homeDropOver = $state(false);
	let dropMenu = $state(null);

	const navigate = (/** @type {string} */ path) => {
		open = false;
		// In vault mode the URL is unchanged, so goto('/') is a no-op — exit directly.
		if (files.isVault && path === '/') { files.exitVault(); return; }
		goto(path);
	};

	const handleHomeDragOver = (/** @type {DragEvent} */ e) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		homeDropOver = true;
	};

	const handleHomeDragLeave = () => {
		homeDropOver = false;
	};

	const handleHomeDrop = (/** @type {DragEvent} */ e) => {
		e.preventDefault();
		homeDropOver = false;

		// External file drop — upload to root
		if (e.dataTransfer?.types?.includes('Files') && e.dataTransfer.files.length > 0) {
			const fileList = [...e.dataTransfer.files];
			files.uploadFilesToPrefix('', fileList);
			return;
		}

		// Internal item drop — show move/copy menu
		if (files.hasSelection) {
			dropMenu = { x: e.clientX, y: e.clientY, prefix: '' };
		}
	};

	/** @type {{ name: string, key: string }[]} */
	let rootFolders = $state([]);

	/** @type {{ totalSizeGB: string, totalSizeMB: number } | null} */
	let stats = $state(null);

	const R2_FREE_GB = 10;
	const R2_PRICE_PER_GB = 0.015;

	let costEstimate = $derived(() => {
		if (!stats) return null;
		const gb = parseFloat(stats.totalSizeGB);
		const billable = Math.max(0, gb - R2_FREE_GB);
		return { gb, billable, monthly: (billable * R2_PRICE_PER_GB).toFixed(2) };
	});

	// Fetch root folders and stats once on mount
	onMount(async () => {
		try {
			const result = await api.listFiles('');
			rootFolders = result.folders.map((f) => ({ name: f.name, key: f.key }));
		} catch {
			rootFolders = [];
		}

		try {
			stats = await api.getStats();
		} catch {
			stats = null;
		}
	});

	const handleTreeDrop = (detail) => {
		dropMenu = detail;
	};

	const handleDropAction = (action) => {
		if (!dropMenu) return;
		if (action === 'move') files.moveToPrefix(dropMenu.prefix);
		else if (action === 'copy') files.copyToPrefix(dropMenu.prefix);
		dropMenu = null;
	};

	// Update root folders when navigating back to home
	$effect(() => {
		if (files.path === '/') {
			const folders = files.items.filter((f) => f.type === 'folder');
			if (folders.length > 0) {
				rootFolders = folders.map((f) => ({ name: f.name, key: f.key }));
			}
		}
	});
</script>

<aside class="sidebar" class:open>
	<div class="sidebar-header">
		<div class="logo">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
			</svg>
			<span>Undrive</span>
		</div>
	</div>

	<nav class="nav">
		<button
			class="nav-item"
			class:active={files.path === '/'}
			class:drop-over={homeDropOver}
			onclick={() => navigate('/')}
			ondragover={handleHomeDragOver}
			ondragleave={handleHomeDragLeave}
			ondrop={handleHomeDrop}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
			</svg>
			<span>Home</span>
		</button>

		<div class="tree-section">
			{#each rootFolders as folder (folder.key)}
				<TreeNode
					prefix={folder.key}
					name={folder.name}
					depth={0}
					onNavigate={navigate}
					onDropAction={handleTreeDrop}
				/>
			{/each}
		</div>

		<div class="nav-divider"></div>

		<button class="nav-item" onclick={() => { sharing.openManager(); open = false; }}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
				<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
			</svg>
			<span>Shared links</span>
		</button>

		<button class="nav-item" class:active={files.path === '/__trash'} onclick={() => navigate('/__trash')}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z" />
				<line x1="10" y1="11" x2="10" y2="17" />
				<line x1="14" y1="11" x2="14" y2="17" />
			</svg>
			<span>Trash</span>
		</button>
	</nav>

	{#if stats}
		{@const cost = costEstimate()}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="storage-footer" onclick={tapStorage}>
			<div class="storage-label">
				<span>Storage</span>
				<span class="storage-size">{stats.totalSizeGB} GB</span>
			</div>
			{#if cost}
				<div class="storage-cost">
					{#if cost.billable > 0}
						~${cost.monthly}/mo
					{:else}
						Free tier ({R2_FREE_GB}GB)
					{/if}
				</div>
			{/if}
			<div class="version-tag">v{__APP_VERSION__}</div>
		</div>
	{/if}
</aside>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="overlay" onclick={() => (open = false)}></div>
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
	.sidebar {
		width: var(--sidebar-width);
		background: var(--bg-secondary);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		z-index: 100;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.overlay {
		display: none;
	}

	@media (max-width: 767px) {
		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			transform: translateX(-100%);
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.overlay {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
			z-index: 99;
		}
	}

	.sidebar-header {
		padding: 20px;
		border-bottom: 1px solid var(--border);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
		font-size: 16px;
		color: var(--accent);
	}

	.nav {
		flex: 1;
		padding: 12px 8px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		font-size: 14px;
		color: var(--text-secondary);
		transition: all var(--transition);
		text-align: left;
	}

	.nav-item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.nav-item.active {
		background: var(--accent-dim);
		color: var(--accent);
	}

	.nav-item.drop-over {
		background: var(--accent-dim);
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.tree-section {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-top: 2px;
	}

	.nav-divider {
		height: 1px;
		background: var(--border);
		margin: 8px 12px;
	}

	.storage-footer {
		padding: 16px 20px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--text-secondary);
	}

	.storage-label {
		display: flex;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.storage-size {
		font-weight: 600;
		color: var(--text-primary);
	}

	.storage-cost {
		margin-top: 4px;
		font-size: 11px;
		color: var(--text-secondary);
		opacity: 0.8;
	}

	.version-tag {
		margin-top: 8px;
		font-size: 10px;
		color: var(--text-muted);
		opacity: 0.5;
	}

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

</style>
