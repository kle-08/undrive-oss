<script>
	import { files } from '$lib/stores/files.svelte.js';

	let { onClose } = $props();
	let fileInputEl = $state(null);
	let folderInputEl = $state(null);
	let dragOver = $state(false);
	/** @type {File[]} */
	let stagedFiles = $state([]);
	let uploadIds = $state(new Set());
	let uploading = $state(false);

	let myUploads = $derived(
		files.uploadQueue.filter((u) => uploadIds.has(u.id))
	);
	let myErrors = $derived(myUploads.filter((u) => u.error));
	let allDone = $derived(
		myUploads.length > 0 && myUploads.every((u) => u.done || u.error)
	);
	let retrying = $state(false);

	let closeTimer = $state(null);

	$effect(() => {
		if (allDone && uploading && !closeTimer && myErrors.length === 0) {
			closeTimer = setTimeout(() => onClose(), 1200);
		}
		if (!allDone && closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	});

	const retryFailed = async () => {
		if (retrying) return;
		retrying = true;
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
		await files.retryFailed();
		retrying = false;
	};

	/**
	 * Add files after validating they're actually readable (not directories).
	 * @param {File[]} fileList
	 */
	const addFiles = async (fileList) => {
		/** @type {File[]} */
		const valid = [];
		for (const f of fileList) {
			if (f.size === 0 && !f.type) continue;
			try {
				// Try reading 1 byte — directories will throw ERR_ACCESS_DENIED
				await f.slice(0, 1).arrayBuffer();
				valid.push(f);
			} catch {
				console.warn('Skipping unreadable entry (directory?):', f.name);
			}
		}
		if (valid.length > 0) {
			stagedFiles = [...stagedFiles, ...valid];
		}
	};

	/**
	 * Recursively read all files from a directory entry.
	 * @param {FileSystemDirectoryEntry} dirEntry
	 * @param {string} basePath
	 * @returns {Promise<File[]>}
	 */
	const readDirRecursive = (dirEntry, basePath = '') => {
		const path = basePath ? `${basePath}/${dirEntry.name}` : dirEntry.name;

		return new Promise((resolve, reject) => {
			const reader = dirEntry.createReader();
			/** @type {File[]} */
			const allFiles = [];

			const readBatch = () => {
				reader.readEntries(async (entries) => {
					if (entries.length === 0) {
						resolve(allFiles);
						return;
					}

					for (const entry of entries) {
						try {
							if (entry.isFile) {
								const file = await new Promise((res, rej) => {
									/** @type {FileSystemFileEntry} */ (entry).file(res, rej);
								});
								const named = new File([file], `${path}/${entry.name}`, {
									type: file.type,
									lastModified: file.lastModified,
								});
								allFiles.push(named);
							} else if (entry.isDirectory) {
								const sub = await readDirRecursive(/** @type {FileSystemDirectoryEntry} */ (entry), path);
								allFiles.push(...sub);
							}
						} catch (err) {
							console.warn('Skipping unreadable entry:', entry.name, err);
						}
					}

					// readEntries returns max 100 at a time, keep reading
					readBatch();
				}, reject);
			};

			readBatch();
		});
	};

	const removeStaged = (/** @type {number} */ index) => {
		stagedFiles = stagedFiles.filter((_, i) => i !== index);
	};

	const startUpload = () => {
		if (stagedFiles.length === 0 || uploading) return;
		uploading = true;
		const { ids } = files.uploadFiles(stagedFiles);
		uploadIds = new Set(ids);
		stagedFiles = [];
	};

	const handleDrop = async (/** @type {DragEvent} */ e) => {
		e.preventDefault();
		dragOver = false;
		if (!e.dataTransfer?.items?.length) return;

		/** @type {File[]} */
		const collected = [];

		// Capture entries synchronously before any await (DataTransfer is ephemeral)
		const items = [...e.dataTransfer.items];
		const hasEntryApi = typeof items[0]?.webkitGetAsEntry === 'function';

		/** @type {FileSystemEntry[]} */
		const entries = hasEntryApi
			? items.map((item) => item.webkitGetAsEntry()).filter(Boolean)
			: [];

		// Also capture flat file list synchronously as fallback
		const flatFiles = [...(e.dataTransfer.files || [])];

		if (entries.length > 0) {
			for (const entry of entries) {
				try {
					if (entry.isDirectory) {
						const dirFiles = await readDirRecursive(/** @type {FileSystemDirectoryEntry} */ (entry));
						collected.push(...dirFiles);
					} else if (entry.isFile) {
						const file = await new Promise((resolve, reject) => {
							/** @type {FileSystemFileEntry} */ (entry).file(resolve, reject);
						});
						collected.push(file);
					}
				} catch (err) {
					console.error('Error reading entry:', entry.name, err);
				}
			}
		} else {
			// No entry API — use flat file list, skip directories
			for (const f of flatFiles) {
				if (f.size > 0) collected.push(f);
			}
		}

		if (collected.length > 0) {
			await addFiles(collected);
		} else {
			console.warn('No files found in drop. Folder may be empty.');
		}
	};

	const handleDragOver = (/** @type {DragEvent} */ e) => {
		e.preventDefault();
		dragOver = true;
	};

	const handleDragLeave = () => {
		dragOver = false;
	};

	const handleFileSelect = async (/** @type {Event} */ e) => {
		const input = /** @type {HTMLInputElement} */ (e.target);
		if (input.files?.length) {
			await addFiles([...input.files]);
		}
		input.value = '';
	};

	const handleFolderSelect = async (/** @type {Event} */ e) => {
		const input = /** @type {HTMLInputElement} */ (e.target);
		if (input.files?.length) {
			const fileList = [...input.files]
				.filter((f) => f.size > 0 || f.type)
				.map((f) => {
					const relPath = f.webkitRelativePath || f.name;
					if (relPath === f.name) return f;
					return new File([f], relPath, { type: f.type, lastModified: f.lastModified });
				});
			if (fileList.length > 0) {
				stagedFiles = [...stagedFiles, ...fileList];
			}
		}
		input.value = '';
	};

	const formatSize = (/** @type {number} */ bytes) => {
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="upload-overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
	<div
		class="upload-modal"
		class:drag-over={dragOver}
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
	>
		<div class="modal-header">
			<h2>{uploading ? 'Uploading...' : 'Upload files'}</h2>
			<button class="close-btn" onclick={onClose} aria-label="Close">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		{#if uploading}
			<div class="upload-list">
				{#each myUploads as item (item.id)}
					<div class="upload-item" class:done={item.done} class:error={!!item.error}>
						<div class="upload-info">
							<span class="upload-name">{item.name}</span>
							{#if item.done}
								<svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2.5">
									<polyline points="20,6 9,17 4,12" />
								</svg>
							{:else if item.error}
								<span class="status-text error">Failed</span>
							{:else}
								<span class="status-text">{item.progress}%</span>
							{/if}
						</div>
						<div class="progress-bar">
							<div
								class="progress-fill"
								class:error={!!item.error}
								style="width: {item.progress}%"
							></div>
						</div>
					</div>
				{/each}
			</div>
			{#if allDone && myErrors.length === 0}
				<div class="done-message">All uploads complete</div>
			{:else if allDone && myErrors.length > 0}
				<div class="retry-section">
					<span class="fail-message">{myErrors.length} file{myErrors.length > 1 ? 's' : ''} failed</span>
					<button class="retry-btn" onclick={retryFailed} disabled={retrying}>
						{retrying ? 'Retrying...' : 'Retry failed'}
					</button>
				</div>
			{/if}
		{:else if stagedFiles.length === 0}
			<div class="drop-area" onclick={() => fileInputEl?.click()}>
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.6">
					<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
					<polyline points="17,8 12,3 7,8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<p class="drop-text">Drag files or folders here, or tap to browse</p>
				<p class="drop-hint">Folders with subfolders supported</p>
			</div>
			<button class="folder-browse" onclick={() => folderInputEl?.click()}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
				</svg>
				Browse folder
			</button>
		{:else}
			<div class="staged-list">
				{#each stagedFiles as file, i}
					<div class="staged-item">
						<span class="staged-name">{file.name}</span>
						<span class="staged-size">{formatSize(file.size)}</span>
						<button class="remove-btn" onclick={() => removeStaged(i)} aria-label="Remove">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
			</div>

			<div class="modal-actions">
				<div class="add-more-group">
					<button class="add-more" onclick={() => fileInputEl?.click()}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						Files
					</button>
					<button class="add-more" onclick={() => folderInputEl?.click()}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
						</svg>
						Folder
					</button>
				</div>
				<button class="upload-btn" onclick={startUpload}>
					Upload ({stagedFiles.length})
				</button>
			</div>
		{/if}

		<input
			bind:this={fileInputEl}
			type="file"
			multiple
			class="hidden-input"
			onchange={handleFileSelect}
		/>
		<input
			bind:this={folderInputEl}
			type="file"
			class="hidden-input"
			onchange={handleFolderSelect}
			webkitdirectory
		/>
	</div>
</div>

<style>
	.upload-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 250;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.upload-modal {
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 16px;
		width: 100%;
		max-width: 480px;
		padding: 24px;
		animation: modal-in 0.2s ease-out;
		transition: border-color 0.2s ease;
	}

	.upload-modal.drag-over {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-dim);
	}

	@keyframes modal-in {
		from { opacity: 0; transform: scale(0.95) translateY(10px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}

	.modal-header h2 {
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

	.drop-area {
		border: 2px dashed var(--border);
		border-radius: var(--radius);
		padding: 48px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		cursor: pointer;
		transition: all var(--transition);
	}

	.drop-area:hover {
		border-color: var(--accent);
		background: var(--accent-dim);
	}

	.drop-text {
		font-size: 14px;
		color: var(--text-primary);
	}

	.drop-hint {
		font-size: 12px;
		color: var(--text-muted);
	}

	.folder-browse {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 12px;
		padding: 8px 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 13px;
		color: var(--text-secondary);
		transition: all var(--transition);
		width: 100%;
	}

	.folder-browse:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-dim);
	}

	/* Staged files */
	.staged-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 300px;
		overflow-y: auto;
	}

	.staged-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 4px;
		border-radius: var(--radius-sm);
	}

	.staged-item:hover {
		background: var(--bg-hover);
	}

	.staged-name {
		font-size: 13px;
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.staged-size {
		font-size: 12px;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.remove-btn {
		padding: 4px;
		border-radius: 50%;
		color: var(--text-muted);
		transition: all var(--transition);
		flex-shrink: 0;
	}

	.remove-btn:hover {
		background: rgba(231, 76, 60, 0.1);
		color: var(--danger);
	}

	.modal-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 16px;
		gap: 12px;
	}

	.add-more-group {
		display: flex;
		gap: 4px;
	}

	.add-more {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		color: var(--text-secondary);
		transition: all var(--transition);
	}

	.add-more:hover {
		color: var(--accent);
		background: var(--accent-dim);
	}

	.upload-btn {
		padding: 8px 20px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		background: var(--accent);
		color: #fff;
		transition: all var(--transition);
	}

	.upload-btn:hover {
		opacity: 0.9;
	}

	/* Upload progress */
	.upload-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-height: 300px;
		overflow-y: auto;
	}

	.upload-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.upload-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.upload-name {
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.status-text {
		font-size: 12px;
		color: var(--text-muted);
		flex-shrink: 0;
		margin-left: 12px;
	}

	.status-text.error {
		color: var(--danger);
	}

	.check-icon {
		flex-shrink: 0;
		margin-left: 12px;
	}

	.progress-bar {
		height: 3px;
		background: var(--bg-tertiary);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 2px;
		transition: width 0.2s ease;
	}

	.upload-item.done .progress-fill {
		background: #2ecc71;
	}

	.progress-fill.error {
		background: var(--danger);
	}

	.done-message {
		text-align: center;
		font-size: 13px;
		color: #2ecc71;
		margin-top: 16px;
		font-weight: 500;
	}

	.retry-section {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 16px;
	}

	.fail-message {
		font-size: 13px;
		color: var(--danger);
		font-weight: 500;
	}

	.retry-btn {
		font-size: 13px;
		font-weight: 500;
		padding: 6px 14px;
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

	.hidden-input {
		display: none;
	}
</style>
