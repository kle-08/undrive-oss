<script>
	import { sharing } from '$lib/stores/sharing.svelte.js';

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Escape') sharing.close();
	};

	const handleBackdrop = (/** @type {MouseEvent} */ e) => {
		if (/** @type {HTMLElement} */ (e.target).classList.contains('overlay')) {
			sharing.close();
		}
	};
</script>

{#if sharing.open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="overlay" onclick={handleBackdrop} onkeydown={handleKeydown} role="dialog" tabindex="-1">
		<div class="dialog">
			<div class="dialog-header">
				<h3>Share</h3>
				<button class="close-btn" onclick={() => sharing.close()} aria-label="Close">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="dialog-body">
				<div class="filename">{sharing.filename}</div>

				{#if !sharing.shareUrl}
					<div class="field">
						<label for="share-expiry">Expires</label>
						<select id="share-expiry" value={sharing.expiresIn} onchange={(e) => sharing.setExpiresIn(e.target.value)}>
							<option value="1h">1 hour</option>
							<option value="24h">24 hours</option>
							<option value="7d">7 days</option>
							<option value="30d">30 days</option>
							<option value="">Never</option>
						</select>
					</div>

					<div class="field">
						<label for="share-password">Password (optional)</label>
						<input
							id="share-password"
							type="text"
							placeholder="Leave empty for no password"
							value={sharing.password}
							oninput={(e) => sharing.setPassword(e.target.value)}
						/>
					</div>

					<button class="create-btn" onclick={() => sharing.createLink()} disabled={sharing.creating}>
						{sharing.creating ? 'Creating...' : 'Create share link'}
					</button>
				{:else}
					<div class="link-row">
						<input type="text" class="link-input" value={sharing.shareUrl} readonly />
						<button class="copy-btn" onclick={() => sharing.copyUrl()}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="9" y="9" width="13" height="13" rx="2" />
								<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
							</svg>
							Copy
						</button>
					</div>

					{#if sharing.password}
						<div class="info">Password: <strong>{sharing.password}</strong></div>
					{/if}

					<button class="done-btn" onclick={() => sharing.close()}>Done</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 400;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.dialog {
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		width: 100%;
		max-width: 420px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
		animation: dialog-in 0.15s ease-out;
	}

	@keyframes dialog-in {
		from { opacity: 0; transform: scale(0.95) translateY(8px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}

	.dialog-header h3 {
		font-size: 15px;
		font-weight: 600;
		margin: 0;
	}

	.close-btn {
		padding: 4px;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		transition: color var(--transition);
	}

	.close-btn:hover {
		color: var(--text-primary);
	}

	.dialog-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.filename {
		font-size: 13px;
		color: var(--text-secondary);
		padding: 8px 12px;
		background: var(--bg-secondary);
		border-radius: var(--radius-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.field select,
	.field input {
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 13px;
		outline: none;
	}

	.field select:focus,
	.field input:focus {
		border-color: var(--accent);
	}

	.create-btn {
		padding: 10px 20px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: white;
		font-size: 14px;
		font-weight: 500;
		transition: opacity var(--transition);
	}

	.create-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.create-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.link-row {
		display: flex;
		gap: 8px;
	}

	.link-input {
		flex: 1;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 12px;
		outline: none;
		min-width: 0;
	}

	.copy-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: white;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		transition: opacity var(--transition);
	}

	.copy-btn:hover {
		opacity: 0.85;
	}

	.info {
		font-size: 12px;
		color: var(--text-secondary);
		padding: 8px 12px;
		background: var(--bg-secondary);
		border-radius: var(--radius-sm);
	}

	.done-btn {
		padding: 10px 20px;
		border-radius: var(--radius-sm);
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 500;
		border: 1px solid var(--border);
		transition: background var(--transition);
	}

	.done-btn:hover {
		background: var(--bg-hover);
	}
</style>
