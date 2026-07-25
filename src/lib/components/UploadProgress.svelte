<script>
	import { files } from '$lib/stores/files.svelte.js';

	let expanded = $state(false);

	let queue = $derived(files.uploadQueue);
	let activeQueue = $derived(queue.filter((u) => !u.skipped));
	let doneCount = $derived(activeQueue.filter((u) => u.done).length);
	let errorCount = $derived(activeQueue.filter((u) => u.error).length);
	let allDone = $derived(activeQueue.length > 0 && doneCount + errorCount === activeQueue.length);
	let overallProgress = $derived(
		activeQueue.length > 0
			? Math.round(activeQueue.reduce((sum, u) => sum + u.progress, 0) / activeQueue.length)
			: 0
	);

	let hasFailures = $derived(errorCount > 0 && allDone);
	let retrying = $state(false);
	let dismissTimer = $state(null);

	$effect(() => {
		if (allDone && !dismissTimer && errorCount === 0) {
			dismissTimer = setTimeout(() => {
				if (!files.hasActiveUploads && files.uploadQueue.length > 0) {
					files.clearUploadQueue();
				}
				dismissTimer = null;
			}, 4000);
		}
		if (!allDone && dismissTimer) {
			clearTimeout(dismissTimer);
			dismissTimer = null;
		}
	});

	const dismiss = (/** @type {MouseEvent} */ e) => {
		e.stopPropagation();
		if (dismissTimer) {
			clearTimeout(dismissTimer);
			dismissTimer = null;
		}
		if (files.hasActiveUploads) {
			files.dismissCompletedUploads();
		} else {
			files.clearUploadQueue();
		}
	};

	const retryAll = async (/** @type {MouseEvent} */ e) => {
		e.stopPropagation();
		if (retrying) return;
		retrying = true;
		if (dismissTimer) {
			clearTimeout(dismissTimer);
			dismissTimer = null;
		}
		await files.retryFailed();
		retrying = false;
	};
</script>

{#if queue.length > 0}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="upload-toast" class:expanded>
		<div class="toast-header" onclick={() => (expanded = !expanded)}>
			<div class="toast-title">
				{#if allDone}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2.5">
						<polyline points="20,6 9,17 4,12" />
					</svg>
					<span>Uploaded {doneCount} file{doneCount !== 1 ? 's' : ''}</span>
				{:else}
					<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2">
						<path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
					</svg>
					<span>Uploading {doneCount + 1} of {activeQueue.length}</span>
				{/if}
			</div>
			<div class="toast-actions">
				<button class="toast-btn" onclick={() => (expanded = !expanded)} aria-label="Toggle details">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
						style="transform: rotate({expanded ? '180deg' : '0deg'}); transition: transform 0.15s ease">
						<polyline points="6,9 12,15 18,9" />
					</svg>
				</button>
				<button class="toast-btn" onclick={dismiss} aria-label="Dismiss">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		{#if !allDone}
			<div class="overall-bar">
				<div class="overall-fill" style="width: {overallProgress}%"></div>
			</div>
		{/if}

		{#if expanded}
			<div class="toast-details">
				{#each queue as item (item.id)}
					<div class="toast-item" class:done={item.done} class:error={!!item.error}>
						<span class="item-name">{item.name}</span>
						{#if item.done}
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2.5">
								<polyline points="20,6 9,17 4,12" />
							</svg>
						{:else if item.error}
							<span class="item-status error" title={item.error}>Failed</span>
						{:else if item.progress > 0}
							<span class="item-status">{item.progress}%</span>
						{:else}
							<span class="item-status">Queued</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if hasFailures}
			<div class="toast-footer">
				<button class="retry-btn" onclick={retryAll} disabled={retrying}>
					{retrying ? 'Retrying...' : `Retry ${errorCount} failed`}
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.upload-toast {
		position: fixed;
		bottom: 24px;
		right: 24px;
		width: 320px;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		z-index: 300;
		overflow: hidden;
		animation: toast-in 0.2s ease-out;
	}

	@media (max-width: 767px) {
		.upload-toast {
			bottom: calc(var(--bottom-bar-height) + 12px);
			right: 12px;
			left: 12px;
			width: auto;
		}
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateY(12px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.toast-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		cursor: pointer;
	}

	.toast-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
	}

	.toast-actions {
		display: flex;
		gap: 4px;
	}

	.toast-btn {
		padding: 4px;
		border-radius: 4px;
		color: var(--text-muted);
		transition: all var(--transition);
	}

	.toast-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.overall-bar {
		height: 2px;
		background: var(--bg-tertiary);
	}

	.overall-fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.3s ease;
	}

	.toast-details {
		padding: 8px 14px 12px;
		max-height: 200px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.toast-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 0;
		font-size: 12px;
	}

	.item-name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--text-secondary);
	}

	.toast-item.done .item-name {
		color: var(--text-muted);
	}

	.item-status {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.item-status.error {
		color: var(--danger);
	}

	.toast-footer {
		padding: 8px 14px 12px;
		display: flex;
		justify-content: flex-end;
	}

	.retry-btn {
		font-size: 12px;
		font-weight: 500;
		padding: 5px 12px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: #fff;
		transition: opacity var(--transition);
	}

	.retry-btn:hover {
		opacity: 0.9;
	}

	.retry-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
