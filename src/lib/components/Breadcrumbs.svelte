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

	const handleDrop = (/** @type {DragEvent} */ e, /** @type {any} */ crumb) => {
		e.preventDefault();
		dropOverIdx = -1;

		const dest = crumb.vaultPrefix ?? prefixFromPath(crumb.path);

		// External file drop — upload to this breadcrumb's folder
		if (e.dataTransfer?.types?.includes('Files') && e.dataTransfer.files.length > 0) {
			const fileList = [...e.dataTransfer.files];
			files.uploadFilesToPrefix(dest, fileList);
			return;
		}

		// Internal item drop — move selected items
		if (files.hasSelection) {
			files.moveToPrefix(dest);
		}
	};

	/** @param {any} crumb */
	const goCrumb = (crumb) => {
		if (crumb.vaultPrefix) files.navigateVault(crumb.vaultPrefix);
		else if (files.isVault) files.exitVault(); // URL is unchanged in vault mode, so exit directly
		else goto(crumb.path);
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
				onclick={() => goCrumb(crumb)}
				ondragover={(e) => handleDragOver(e, i)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, crumb)}
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
