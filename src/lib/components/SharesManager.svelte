<script>
	import { sharing } from '$lib/stores/sharing.svelte.js';

	const handleBackdrop = (/** @type {MouseEvent} */ e) => {
		if (/** @type {HTMLElement} */ (e.target).classList.contains('overlay')) {
			sharing.closeManager();
		}
	};

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Escape') sharing.closeManager();
	};

	const formatDate = (/** @type {string} */ iso) => {
		if (!iso) return '';
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	};

	const isExpired = (/** @type {string|null} */ expiresAt) => {
		if (!expiresAt) return false;
		return new Date(expiresAt) < new Date();
	};
</script>

{#if sharing.managerOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="overlay" onclick={handleBackdrop} onkeydown={handleKeydown} role="dialog" tabindex="-1">
		<div class="dialog">
			<div class="dialog-header">
				<h3>Shared links</h3>
				<button class="close-btn" onclick={() => sharing.closeManager()} aria-label="Close">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="dialog-body">
				{#if sharing.loadingShares}
					<div class="empty">Loading...</div>
				{:else if sharing.shares.length === 0}
					<div class="empty">No shared links yet</div>
				{:else}
					<div class="shares-list">
						{#each sharing.shares as share (share.token)}
							<div class="share-item" class:expired={isExpired(share.expires_at)}>
								<div class="share-info">
									<div class="share-name">{share.filename}</div>
									<div class="share-meta">
										<span>Created {formatDate(share.created_at)}</span>
										{#if share.expires_at}
											<span class="dot">·</span>
											{#if isExpired(share.expires_at)}
												<span class="expired-label">Expired</span>
											{:else}
												<span>Expires {formatDate(share.expires_at)}</span>
											{/if}
										{:else}
											<span class="dot">·</span>
											<span>Never expires</span>
										{/if}
										{#if share.has_password}
											<span class="dot">·</span>
											<span class="badge">Password</span>
										{/if}
										{#if share.max_downloads}
											<span class="dot">·</span>
											<span>{share.download_count}/{share.max_downloads} downloads</span>
										{:else}
											<span class="dot">·</span>
											<span>{share.download_count} downloads</span>
										{/if}
									</div>
								</div>
								<div class="share-actions">
									<button class="action-btn" onclick={() => sharing.copyShareUrl(share.token)} title="Copy link">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<rect x="9" y="9" width="13" height="13" rx="2" />
											<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
										</svg>
									</button>
									<button class="action-btn danger" onclick={() => sharing.revokeShare(share.token)} title="Revoke">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
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
		max-width: 520px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
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
		flex-shrink: 0;
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
		overflow-y: auto;
		flex: 1;
	}

	.empty {
		padding: 40px 20px;
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
	}

	.shares-list {
		display: flex;
		flex-direction: column;
	}

	.share-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border-subtle);
		transition: background var(--transition);
	}

	.share-item:hover {
		background: var(--bg-hover);
	}

	.share-item.expired {
		opacity: 0.5;
	}

	.share-info {
		flex: 1;
		min-width: 0;
	}

	.share-name {
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.share-meta {
		font-size: 11px;
		color: var(--text-muted);
		margin-top: 2px;
		display: flex;
		flex-wrap: wrap;
		gap: 0;
		align-items: center;
	}

	.dot {
		margin: 0 4px;
	}

	.expired-label {
		color: var(--danger, #e74c3c);
	}

	.badge {
		color: var(--accent);
	}

	.share-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.action-btn {
		padding: 6px;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		transition: all var(--transition);
	}

	.action-btn:hover {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.action-btn.danger:hover {
		color: var(--danger, #e74c3c);
		background: rgba(231, 76, 60, 0.1);
	}
</style>
