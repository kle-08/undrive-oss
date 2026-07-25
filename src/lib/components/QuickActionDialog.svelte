<script>
	import { quickactions } from '$lib/stores/quickactions.svelte.js';

	const action = $derived(quickactions.activeAction);
	const plan = $derived(quickactions.plan);

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Escape') quickactions.close();
	};

	// Config handlers per action type
	const handlePatternInput = (/** @type {Event} */ e) => {
		quickactions.setConfig('pattern', /** @type {HTMLInputElement} */ (e.target).value);
		quickactions.updatePreview();
	};

	const handleStartNumInput = (/** @type {Event} */ e) => {
		quickactions.setConfig('startNum', /** @type {HTMLInputElement} */ (e.target).value);
		quickactions.updatePreview();
	};

	const handleReplacementChange = (/** @type {Event} */ e) => {
		quickactions.setConfig('replacement', /** @type {HTMLSelectElement} */ (e.target).value);
		quickactions.updatePreview();
	};

	const handleThresholdInput = (/** @type {Event} */ e) => {
		quickactions.setConfig('thresholdMB', /** @type {HTMLInputElement} */ (e.target).value);
		quickactions.updatePreview();
	};

	// Auto-generate preview for config actions on first render
	$effect(() => {
		if (action?.id === 'rename-pattern' && !quickactions.config.pattern) {
			quickactions.setConfig('pattern', 'file');
			quickactions.setConfig('startNum', '1');
			quickactions.updatePreview();
		}
		if (action?.id === 'replace-spaces' && !quickactions.config.replacement) {
			quickactions.setConfig('replacement', '_');
			quickactions.updatePreview();
		}
		if (action?.id === 'find-large' && !quickactions.config.thresholdMB) {
			quickactions.setConfig('thresholdMB', '50');
			quickactions.updatePreview();
		}
	});
</script>

{#if action}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="dialog-overlay" onclick={(e) => { if (e.target === e.currentTarget) quickactions.close(); }} onkeydown={handleKeydown}>
		<div class="dialog">
			<div class="dialog-header">
				<h3>{action.name}</h3>
				<button class="close-btn" onclick={() => quickactions.close()} aria-label="Close">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Config section -->
			{#if action.id === 'rename-pattern'}
				<div class="config-section">
					<label class="config-label">
						<span>Prefix</span>
						<input
							class="config-input"
							type="text"
							value={quickactions.config.pattern || 'file'}
							oninput={handlePatternInput}
							placeholder="e.g. Khoa, photo"
						/>
					</label>
					<label class="config-label">
						<span>Start number</span>
						<input
							class="config-input small"
							type="number"
							min="0"
							value={quickactions.config.startNum || '1'}
							oninput={handleStartNumInput}
						/>
					</label>
				</div>
			{:else if action.id === 'replace-spaces'}
				<div class="config-section">
					<label class="config-label">
						<span>Replace with</span>
						<select class="config-input" onchange={handleReplacementChange}>
							<option value="_" selected={quickactions.config.replacement === '_'}>Underscore (_)</option>
							<option value="-" selected={quickactions.config.replacement === '-'}>Dash (-)</option>
						</select>
					</label>
				</div>
			{:else if action.id === 'find-large'}
				<div class="config-section">
					<label class="config-label">
						<span>Larger than (MB)</span>
						<input
							class="config-input small"
							type="number"
							min="1"
							value={quickactions.config.thresholdMB || '50'}
							oninput={handleThresholdInput}
						/>
					</label>
				</div>
			{/if}

			<!-- Preview -->
			<div class="preview-section">
				<div class="preview-header">
					<span class="preview-title">Preview</span>
					<span class="preview-count">{plan.length} change{plan.length !== 1 ? 's' : ''}</span>
				</div>
				{#if plan.length === 0}
					<div class="preview-empty">No changes to make</div>
				{:else}
					<div class="preview-list">
						{#each plan as step, i}
							<div class="preview-item" class:create={step.action === 'createFolder'}>
								{#if step.action === 'createFolder'}
									<svg class="step-icon create" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
									</svg>
								{:else if step.action === 'rename'}
									<svg class="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
									</svg>
								{:else if step.action === 'move'}
									<svg class="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M5 12h14M12 5l7 7-7 7" />
									</svg>
								{:else}
									<svg class="step-icon delete" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z" />
									</svg>
								{/if}
								<span class="step-label">{step.label}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Actions -->
			{#if quickactions.executing}
				<div class="dialog-actions">
					<div class="progress-bar">
						<div class="progress-fill" style="width: {Math.round((quickactions.executedCount / plan.length) * 100)}%"></div>
					</div>
					<span class="progress-text">{quickactions.executedCount} / {plan.length}</span>
				</div>
			{:else}
				<div class="dialog-actions">
					<button class="btn btn-cancel" onclick={() => quickactions.close()}>Cancel</button>
					{#if plan.length > 0 && action.id !== 'find-large'}
						<button class="btn btn-confirm" onclick={() => quickactions.execute()}>
							Apply {plan.length} change{plan.length !== 1 ? 's' : ''}
						</button>
					{:else if action.id === 'find-large' && plan.length > 0}
						<button class="btn btn-confirm" onclick={() => quickactions.close()}>
							Done
						</button>
					{/if}
				</div>
			{/if}
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
		width: 100%;
		max-width: 500px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		animation: dialog-in 0.2s ease-out;
	}

	@keyframes dialog-in {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 20px 12px;
	}

	.dialog-header h3 {
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

	/* Config */
	.config-section {
		padding: 0 20px 12px;
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.config-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 100px;
	}

	.config-label span {
		font-size: 12px;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.config-input {
		padding: 8px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 14px;
		font-family: inherit;
		outline: none;
		transition: border-color var(--transition);
	}

	.config-input:focus {
		border-color: var(--accent);
	}

	.config-input.small {
		max-width: 100px;
	}

	/* Preview */
	.preview-section {
		flex: 1;
		min-height: 0;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
	}

	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 20px 8px;
	}

	.preview-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.preview-count {
		font-size: 12px;
		color: var(--text-muted);
	}

	.preview-empty {
		padding: 24px 20px;
		text-align: center;
		font-size: 14px;
		color: var(--text-muted);
	}

	.preview-list {
		overflow-y: auto;
		max-height: 300px;
		padding: 0 12px 12px;
	}

	.preview-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		font-size: 13px;
		color: var(--text-secondary);
	}

	.preview-item:hover {
		background: var(--bg-hover);
	}

	.preview-item.create {
		color: var(--accent);
	}

	.step-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.step-icon.create {
		color: var(--accent);
	}

	.step-icon.delete {
		color: var(--danger);
	}

	.step-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Actions */
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 8px;
		padding: 12px 20px 20px;
		border-top: 1px solid var(--border);
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

	/* Progress */
	.progress-bar {
		flex: 1;
		height: 6px;
		background: var(--bg-tertiary);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 3px;
		transition: width 0.2s ease;
	}

	.progress-text {
		font-size: 12px;
		color: var(--text-secondary);
		white-space: nowrap;
	}
</style>
