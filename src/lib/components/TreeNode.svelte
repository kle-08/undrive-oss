<script>
	import { files } from '$lib/stores/files.svelte.js';
	import * as api from '$lib/api/client.js';

	let { prefix, name, depth = 0, onNavigate, onDropAction } = $props();

	let expanded = $state(false);
	let children = $state(null);
	let loading = $state(false);
	let dropOver = $state(false);

	const path = '/' + prefix.replace(/\/$/, '');
	const isActive = $derived(files.path === path);

	const hasChildren = $derived(children === null || children.length > 0);

	const toggle = async (e) => {
		e.stopPropagation();
		if (expanded) {
			expanded = false;
			return;
		}
		if (children !== null) {
			if (children.length > 0) expanded = true;
			return;
		}
		loading = true;
		try {
			const result = await api.listFiles(prefix);
			children = result.folders.map((f) => ({
				name: f.name,
				prefix: f.key,
			}));
			if (children.length > 0) expanded = true;
		} catch {
			children = [];
		} finally {
			loading = false;
		}
	};

	const navigate = () => {
		onNavigate(path);
	};

	const handleDragOver = (/** @type {DragEvent} */ e) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
		dropOver = true;
	};

	const handleDragLeave = () => {
		dropOver = false;
	};

	const handleDrop = (/** @type {DragEvent} */ e) => {
		e.preventDefault();
		dropOver = false;

		// External file drop — upload to this folder
		if (e.dataTransfer?.types?.includes('Files') && e.dataTransfer.files.length > 0) {
			const fileList = [...e.dataTransfer.files];
			files.uploadFilesToPrefix(prefix, fileList);
			return;
		}

		// Internal item drop — show move/copy menu
		if (files.hasSelection) {
			if (onDropAction) {
				onDropAction({ x: e.clientX, y: e.clientY, prefix });
			} else {
				files.moveToPrefix(prefix);
			}
		}
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="tree-node">
	<div
		class="node-row"
		class:active={isActive}
		class:drop-over={dropOver}
		style="padding-left: {12 + depth * 16}px"
		onclick={navigate}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		role="treeitem"
		tabindex="0"
	>
		{#if loading}
			<span class="chevron-placeholder">
				<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
				</svg>
			</span>
		{:else if hasChildren}
			<span
				class="chevron"
				class:expanded
				onclick={toggle}
				role="button"
				tabindex="-1"
				aria-label="Toggle folder"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9,18 15,12 9,6" />
				</svg>
			</span>
		{:else}
			<span class="chevron-placeholder"></span>
		{/if}
		<svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="#666" stroke="none">
			{#if expanded}
				<path d="M5 4a2 2 0 00-2 2v1h10.5l2-3H5zm15 3H12l-2-3H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2z" />
			{:else}
				<path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
			{/if}
		</svg>
		<span class="node-name">{name}</span>
	</div>

	{#if expanded && children && children.length > 0}
		<div class="children">
			{#each children as child (child.prefix)}
				<svelte:self
					prefix={child.prefix}
					name={child.name}
					depth={depth + 1}
					{onNavigate}
					{onDropAction}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tree-node {
		display: flex;
		flex-direction: column;
	}

	.node-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		color: var(--text-secondary);
		transition: all var(--transition);
		text-align: left;
		width: 100%;
		cursor: pointer;
	}

	.node-row:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.node-row.active {
		background: var(--accent-dim);
		color: var(--accent);
	}

	.node-row.drop-over {
		background: var(--accent-dim);
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		padding: 0;
		border-radius: 3px;
		color: var(--text-muted);
		transition: transform 0.15s ease;
		transform: rotate(0deg);
		cursor: pointer;
	}

	.chevron:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.chevron.expanded {
		transform: rotate(90deg);
	}

	.chevron-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.spinner {
		color: var(--text-muted);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.folder-icon {
		flex-shrink: 0;
	}

	.node-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.children {
		display: flex;
		flex-direction: column;
	}

</style>
