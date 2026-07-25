<script>
	import { ui } from '$lib/stores/ui.svelte.js';
	import { onMount } from 'svelte';

	let confirmBtn = $state(null);

	onMount(() => {
		confirmBtn?.focus();
	});

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Escape') ui.resolveConfirm(false);
		if (e.key === 'Enter') ui.resolveConfirm(true);
	};
</script>

{#if ui.confirmDialog}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="dialog-overlay" onclick={(e) => { if (e.target === e.currentTarget) ui.resolveConfirm(false); }} onkeydown={handleKeydown}>
		<div class="dialog">
			<h3>{ui.confirmDialog.title}</h3>
			<p class="message">{ui.confirmDialog.message}</p>
			<div class="dialog-actions">
				<button class="btn btn-cancel" onclick={() => ui.resolveConfirm(false)}>Cancel</button>
				<button
					bind:this={confirmBtn}
					class="btn btn-confirm"
					class:danger={ui.confirmDialog.danger}
					onclick={() => ui.resolveConfirm(true)}
				>
					{ui.confirmDialog.confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.dialog {
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 24px;
		width: 100%;
		max-width: 360px;
		animation: dialog-in 0.2s ease-out;
	}

	@keyframes dialog-in {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	h3 {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.message {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.5;
		margin-bottom: 20px;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.btn {
		padding: 8px 20px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		transition: all var(--transition);
	}

	.btn-cancel {
		color: var(--text-secondary);
	}

	.btn-cancel:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.btn-confirm {
		background: var(--accent);
		color: white;
	}

	.btn-confirm:hover {
		filter: brightness(1.1);
	}

	.btn-confirm.danger {
		background: var(--danger);
	}
</style>
