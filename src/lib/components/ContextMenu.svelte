<script>
	import { onMount } from 'svelte';

	let { x = 0, y = 0, items = [], onClose } = $props();
	let menuEl = $state(null);

	// Adjust position to stay in viewport
	let adjustedX = $state(0);
	let adjustedY = $state(0);

	$effect(() => {
		const cx = x;
		const cy = y;
		if (!menuEl) {
			adjustedX = cx;
			adjustedY = cy;
			return;
		}
		const rect = menuEl.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		adjustedX = cx + rect.width > vw ? vw - rect.width - 8 : cx;
		adjustedY = cy + rect.height > vh ? vh - rect.height - 8 : cy;
	});

	const handleClickOutside = (/** @type {MouseEvent} */ e) => {
		if (menuEl && !menuEl.contains(/** @type {Node} */ (e.target))) {
			onClose();
		}
	};

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Escape') onClose();
	};

	onMount(() => {
		// Delay to avoid the same right-click closing it
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeydown);
		}, 10);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="context-menu"
	bind:this={menuEl}
	style="left: {adjustedX}px; top: {adjustedY}px"
>
	{#each items as item}
		{#if item.separator}
			<div class="separator"></div>
		{:else}
			<button
				class="menu-item"
				class:danger={item.danger}
				onclick={() => { item.action(); onClose(); }}
			>
				{#if item.icon}
					{@html item.icon}
				{/if}
				<span>{item.label}</span>
				{#if item.shortcut}
					<span class="shortcut">{item.shortcut}</span>
				{/if}
			</button>
		{/if}
	{/each}
</div>

<style>
	.context-menu {
		position: fixed;
		z-index: 300;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 4px;
		min-width: 200px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		animation: menu-in 0.12s ease-out;
	}

	@keyframes menu-in {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		color: var(--text-primary);
		transition: background var(--transition);
		text-align: left;
	}

	.menu-item:hover {
		background: var(--bg-hover);
	}

	.menu-item.danger {
		color: var(--danger);
	}

	.menu-item.danger:hover {
		background: rgba(231, 76, 60, 0.1);
	}

	.menu-item :global(svg) {
		flex-shrink: 0;
		opacity: 0.7;
	}

	.shortcut {
		margin-left: auto;
		font-size: 11px;
		color: var(--text-muted);
	}

	.separator {
		height: 1px;
		background: var(--border);
		margin: 4px 8px;
	}
</style>
