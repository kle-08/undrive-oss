<script>
	import { files } from '$lib/stores/files.svelte.js';
	import { onMount } from 'svelte';

	let { onClose } = $props();
	let name = $state('');
	let inputEl = $state(null);

	onMount(() => {
		inputEl?.focus();
	});

	const handleSubmit = () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		files.createFolder(trimmed);
		onClose();
	};

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Enter') handleSubmit();
		if (e.key === 'Escape') onClose();
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="dialog-overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
	<div class="dialog">
		<h3>New folder</h3>
		<input
			bind:this={inputEl}
			bind:value={name}
			type="text"
			placeholder="Folder name"
			class="folder-input"
			onkeydown={handleKeydown}
		/>
		<div class="dialog-actions">
			<button class="btn btn-cancel" onclick={onClose}>Cancel</button>
			<button class="btn btn-create" onclick={handleSubmit} disabled={!name.trim()}>Create</button>
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

	.folder-input {
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

	.folder-input:focus {
		border-color: var(--accent);
	}

	.folder-input::placeholder {
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

	.btn-create {
		background: var(--accent);
		color: white;
	}

	.btn-create:hover {
		filter: brightness(1.1);
	}

	.btn-create:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
