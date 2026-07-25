<script>
	import { quickactions } from '$lib/stores/quickactions.svelte.js';

	const handleSelect = (/** @type {any} */ action) => {
		quickactions.selectAction(action);
	};
</script>

{#if quickactions.menuOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="menu-overlay" onclick={() => quickactions.closeMenu()}>
		<div class="menu" onclick={(e) => e.stopPropagation()}>
			<div class="menu-header">
				<h3>Quick Actions</h3>
				<button class="close-btn" onclick={() => quickactions.closeMenu()} aria-label="Close">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="menu-list">
				{#each quickactions.actions as action}
					<button class="menu-item" onclick={() => handleSelect(action)}>
						<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d={action.icon} />
						</svg>
						<div class="menu-text">
							<span class="menu-name">{action.name}</span>
							<span class="menu-desc">{action.description}</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.menu-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.menu {
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 16px;
		width: 100%;
		max-width: 420px;
		max-height: 80vh;
		overflow-y: auto;
		animation: dialog-in 0.2s ease-out;
	}

	@keyframes dialog-in {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	.menu-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 20px 12px;
		border-bottom: 1px solid var(--border);
	}

	.menu-header h3 {
		font-size: 16px;
		font-weight: 600;
	}

	.close-btn {
		padding: 6px;
		border-radius: 50%;
		color: var(--text-secondary);
		transition: all var(--transition);
	}

	.close-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.menu-list {
		padding: 8px;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px;
		border-radius: 10px;
		text-align: left;
		color: var(--text-primary);
		transition: all var(--transition);
	}

	.menu-item:hover {
		background: var(--bg-hover);
	}

	.menu-icon {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--accent);
	}

	.menu-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.menu-name {
		font-size: 14px;
		font-weight: 500;
	}

	.menu-desc {
		font-size: 12px;
		color: var(--text-secondary);
	}
</style>
