<script>
	import { files } from '$lib/stores/files.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import { goto } from '$app/navigation';

	let { onMenuToggle } = $props();

	let showFab = $state(false);
</script>

<nav class="bottom-bar">
	<button class="bar-item" onclick={onMenuToggle}>
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M3 12h18M3 6h18M3 18h18" />
		</svg>
		<span>Browse</span>
	</button>

	<button class="bar-item" onclick={() => goto('/')}>
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
		</svg>
		<span>Home</span>
	</button>

	<button class="bar-item add-btn" onclick={() => (showFab = !showFab)}>
		<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
		<span>New</span>
	</button>

	<button class="bar-item" onclick={files.toggleViewMode}>
		{#if files.viewMode === 'grid'}
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
			</svg>
			<span>List</span>
		{:else}
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="3" width="7" height="7" rx="1" />
				<rect x="14" y="3" width="7" height="7" rx="1" />
				<rect x="3" y="14" width="7" height="7" rx="1" />
				<rect x="14" y="14" width="7" height="7" rx="1" />
			</svg>
			<span>Grid</span>
		{/if}
	</button>
</nav>

{#if showFab}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="fab-overlay" onclick={() => (showFab = false)}>
		<div class="fab-menu">
			<button class="fab-item" onclick={() => { showFab = false; ui.openUpload(); }}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
					<polyline points="17,8 12,3 7,8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<span>Upload files</span>
			</button>
			<button class="fab-item" onclick={() => { showFab = false; ui.openNewFolder(); }}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
					<line x1="12" y1="11" x2="12" y2="17" />
					<line x1="9" y1="14" x2="15" y2="14" />
				</svg>
				<span>New folder</span>
			</button>
		</div>
	</div>
{/if}

<style>
	.bottom-bar {
		display: flex;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: var(--bottom-bar-height);
		background: var(--bg-secondary);
		border-top: 1px solid var(--border);
		z-index: 90;
		padding-bottom: env(safe-area-inset-bottom);
	}

	@media (min-width: 768px) {
		.bottom-bar {
			display: none;
		}
	}

	.bar-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		color: var(--text-muted);
		font-size: 10px;
		transition: color var(--transition);
	}

	.bar-item:active {
		color: var(--accent);
	}

	.add-btn {
		color: var(--accent);
	}

	/* FAB menu */
	.fab-overlay {
		position: fixed;
		inset: 0;
		z-index: 89;
		background: rgba(0, 0, 0, 0.4);
	}

	@media (min-width: 768px) {
		.fab-overlay {
			display: none;
		}
	}

	.fab-menu {
		position: fixed;
		bottom: calc(var(--bottom-bar-height) + 12px + env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 6px;
		min-width: 200px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		animation: fab-in 0.15s ease-out;
	}

	@keyframes fab-in {
		from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.95); }
		to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
	}

	.fab-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 16px;
		border-radius: 10px;
		font-size: 14px;
		color: var(--text-primary);
		transition: background var(--transition);
	}

	.fab-item:active {
		background: var(--bg-hover);
	}
</style>
