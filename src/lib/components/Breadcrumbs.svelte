<script>
	import { files } from '$lib/stores/files.svelte.js';
	import { goto } from '$app/navigation';

	let dropOverIdx = $state(-1);

	const prefixFromPath = (/** @type {string} */ path) => {
		const p = path.replace(/^\/+/, '').replace(/\/+$/, '');
		return p ? p + '/' : '';
	};

	const handleDragOver = (/** @type {DragEvent} */ e, /** @type {number} */ idx) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropOverIdx = idx;
	};

	const handleDragLeave = () => {
		dropOverIdx = -1;
	};

	const handleDrop = (/** @type {DragEvent} */ e, /** @type {string} */ path) => {
		e.preventDefault();
		dropOverIdx = -1;

		// External file drop — upload to this breadcrumb's folder
		if (e.dataTransfer?.types?.includes('Files') && e.dataTransfer.files.length > 0) {
			const fileList = [...e.dataTransfer.files];
			files.uploadFilesToPrefix(prefixFromPath(path), fileList);
			return;
		}

		// Internal item drop — move selected items
		if (files.hasSelection) {
			files.moveToPrefix(prefixFromPath(path));
		}
	};
</script>

<div class="breadcrumbs">
	{#each files.breadcrumbs as crumb, i}
		{#if i > 0}
			<span class="separator">/</span>
		{/if}
		{#if i === files.breadcrumbs.length - 1}
			<span class="current">{crumb.name}</span>
		{:else}
			<button
				class="crumb"
				class:drop-over={dropOverIdx === i}
				onclick={() => goto(crumb.path)}
				ondragover={(e) => handleDragOver(e, i)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, crumb.path)}
			>
				{crumb.name}
			</button>
		{/if}
	{/each}
</div>

<style>
	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}

	.separator {
		color: var(--text-muted);
	}

	.crumb {
		color: var(--text-secondary);
		padding: 4px 6px;
		border-radius: 4px;
		transition: all var(--transition);
	}

	.crumb:hover {
		color: var(--accent);
		background: var(--accent-dim);
	}

	.crumb.drop-over {
		color: var(--accent);
		background: var(--accent-dim);
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.current {
		color: var(--text-primary);
		font-weight: 500;
	}
</style>
