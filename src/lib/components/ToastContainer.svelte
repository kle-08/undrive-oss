<script>
	import { toast } from '$lib/stores/toast.svelte.js';
</script>

{#if toast.items.length > 0}
	<div class="toast-container">
		{#each toast.items as item (item.id)}
			<div class="toast toast-{item.type}" role="alert">
				<span class="toast-msg">{item.message}</span>
				<button class="toast-close" onclick={() => toast.dismiss(item.id)} aria-label="Dismiss">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: calc(env(safe-area-inset-bottom) + 72px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 500;
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-radius: 8px;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		font-size: 13px;
		color: var(--text-primary);
		pointer-events: auto;
		animation: toast-in 0.2s ease-out;
		white-space: nowrap;
	}

	.toast-success {
		border-color: #2ecc71;
		background: rgba(46, 204, 113, 0.1);
	}

	.toast-error {
		border-color: var(--danger, #e74c3c);
		background: rgba(231, 76, 60, 0.1);
	}

	.toast-msg {
		flex: 1;
	}

	.toast-close {
		flex-shrink: 0;
		padding: 2px;
		border-radius: 4px;
		color: var(--text-muted);
		transition: color 0.15s;
	}

	.toast-close:hover {
		color: var(--text-primary);
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
