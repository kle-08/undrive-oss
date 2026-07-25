<script>
	import { files } from '$lib/stores/files.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import { onMount } from 'svelte';

	let inputEl = $state(null);
	let name = $state(ui.renameTarget?.name ?? '');

	onMount(() => {
		if (!inputEl) return;
		inputEl.focus();
		// Select filename without extension
		const dotIdx = name.lastIndexOf('.');
		if (dotIdx > 0) {
			inputEl.setSelectionRange(0, dotIdx);
		} else {
			inputEl.select();
		}
	});

	let saving = $state(false);

	const handleSubmit = async () => {
		const trimmed = name.trim();
		if (!trimmed || !ui.renameTarget || saving) return;
		if (trimmed === ui.renameTarget.name) {
			ui.closeRename();
			return;
		}
		saving = true;
		try {
			await files.rename(ui.renameTarget.id, trimmed);
		} finally {
			saving = false;
		}
		ui.closeRename();
	};

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Enter') handleSubmit();
		if (e.key === 'Escape') ui.closeRename();
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="dialog-overlay" onclick={(e) => { if (e.target === e.currentTarget) ui.closeRename(); }}>
	<div class="dialog">
		<h3>Rename</h3>
		<input
			bind:this={inputEl}
			bind:value={name}
			type="text"
			placeholder="New name"
			class="rename-input"
			onkeydown={handleKeydown}
		/>
		<div class="dialog-actions">
			<button class="btn btn-cancel" onclick={() => ui.closeRename()}>Cancel</button>
			<button class="btn btn-save" onclick={handleSubmit} disabled={saving || !name.trim() || name.trim() === ui.renameTarget?.name}>Rename</button>
		</div>
	</div>
</div>

<style>
	.dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 250;
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
		margin-bottom: 16px;
	}

	.rename-input {
		width: 100%;
		padding: 10px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 14px;
		font-family: inherit;
		outline: none;
		transition: border-color var(--transition);
	}

	.rename-input:focus {
		border-color: var(--accent);
	}

	.rename-input::placeholder {
		color: var(--text-muted);
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 20px;
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

	.btn-save {
		background: var(--accent);
		color: white;
	}

	.btn-save:hover {
		filter: brightness(1.1);
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
