<script>
	import { viewer } from '$lib/stores/viewer.svelte.js';
	import { files } from '$lib/stores/files.svelte.js';
	import { extensions } from '$lib/extensions/registry.svelte.js';
	import { onMount } from 'svelte';

	let playbackError = $state(false);
	let paused = $state(false);
	let capturing = $state(false);

	/** @type {HTMLVideoElement|undefined} */
	let videoEl = $state();

	/** @type {HTMLCanvasElement|undefined} */
	let canvasEl = $state();

	/** @type {HTMLDivElement|undefined} */
	let overlayEl = $state();

	const PROGRESS_KEY = 'video-progress';
	const SAVE_INTERVAL = 5;
	let lastProgressSave = 0;

	const saveProgress = () => {
		if (!videoEl || !viewer.current?.key) return;
		try {
			const data = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}');
			data[viewer.current.key] = videoEl.currentTime;
			const keys = Object.keys(data);
			if (keys.length > 100) {
				for (const k of keys.slice(0, keys.length - 100)) delete data[k];
			}
			localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
		} catch { /* ignore */ }
	};

	const getProgress = () => {
		if (!viewer.current?.key) return 0;
		try {
			const data = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}');
			return data[viewer.current.key] || 0;
		} catch { return 0; }
	};

	const clearProgress = () => {
		if (!viewer.current?.key) return;
		try {
			const data = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}');
			delete data[viewer.current.key];
			localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
		} catch { /* ignore */ }
	};

	const handleTimeUpdate = () => {
		if (!videoEl) return;
		if (Math.abs(videoEl.currentTime - lastProgressSave) >= SAVE_INTERVAL) {
			lastProgressSave = videoEl.currentTime;
			saveProgress();
		}
	};

	const handleClose = () => {
		saveProgress();
		viewer.close();
	};

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Escape') handleClose();
		if (e.key === 'ArrowLeft' && videoEl) {
			e.preventDefault();
			videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
		}
		if (e.key === 'ArrowRight' && videoEl) {
			e.preventDefault();
			videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 5);
		}
		if (e.key === ' ') {
			e.preventDefault();
			if (!videoEl) return;
			videoEl.paused ? videoEl.play() : videoEl.pause();
		}
	};

	const handleVideoError = () => {
		playbackError = true;
	};

	const enterPip = () => {
		if (!viewer.current || !videoEl) return;
		viewer.enterPip(viewer.current, videoEl.currentTime);
	};

	const handleLoadedMetadata = () => {
		if (videoEl && viewer.pipTime > 0) {
			videoEl.currentTime = viewer.pipTime;
			viewer.updatePipTime(0);
		} else if (videoEl) {
			const saved = getProgress();
			if (saved > 0) videoEl.currentTime = saved;
		}
	};

	const downloadCurrent = () => {
		if (!viewer.current) return;
		const a = document.createElement('a');
		a.href = files.getDownloadUrl(viewer.current.key);
		a.download = viewer.current.name;
		a.click();
		viewer.close();
	};

	/**
	 * Capture the current video frame as a JPEG data URL (native resolution).
	 * @returns {Promise<string|null>}
	 */
	const captureFrame = () => new Promise((resolve) => {
		if (!videoEl || !canvasEl) return resolve(null);

		canvasEl.width = videoEl.videoWidth;
		canvasEl.height = videoEl.videoHeight;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return resolve(null);

		try {
			ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
			canvasEl.toBlob((blob) => {
				if (!blob) return resolve(null);
				const reader = new FileReader();
				reader.onload = () => resolve(/** @type {string} */ (reader.result));
				reader.readAsDataURL(blob);
			}, 'image/jpeg', 0.92);
		} catch {
			// Tainted canvas (large video redirected to R2 without CORS)
			resolve(null);
		}
	});

	/**
	 * Run a registered media action, giving it a frame-capture handle.
	 * @param {import('$lib/extensions/registry.svelte.js').MediaAction} ma
	 */
	const runMediaAction = async (ma) => {
		capturing = true;
		try {
			await ma.action({
				captureFrame,
				videoWidth: videoEl?.videoWidth ?? 0,
				videoHeight: videoEl?.videoHeight ?? 0,
				name: viewer.current?.name ?? 'frame',
			});
		} finally {
			capturing = false;
		}
	};

	/** Redirect focus from video back to overlay so our keydown handler stays active */
	const handleFocusIn = (/** @type {FocusEvent} */ e) => {
		if (e.target === videoEl || videoEl?.contains(/** @type {Node} */ (e.target))) {
			overlayEl?.focus();
		}
	};

	onMount(() => {
		overlayEl?.focus();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="video-overlay" bind:this={overlayEl} tabindex="0" onkeydown={handleKeydown} onfocusin={handleFocusIn}>
	<div class="video-header">
		<span class="video-name">{viewer.current?.name ?? ''}</span>
		<div class="header-actions">
			<button class="header-btn" onclick={enterPip} aria-label="Mini player" title="Mini player">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="2" y="3" width="20" height="14" rx="2" />
					<rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3" />
				</svg>
			</button>
			<button class="header-btn" onclick={handleClose} aria-label="Close">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
	</div>

	<div class="video-container">
		{#if viewer.current}
			{#if playbackError}
				<div class="error-fallback">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
					<p>This format can't be played in the browser</p>
					<button class="download-btn" onclick={downloadCurrent}>Download instead</button>
				</div>
			{:else}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoEl}
					src={viewer.current.url}
					crossorigin="anonymous"
					controls
					autoplay
					playsinline
					preload="metadata"
					onerror={handleVideoError}
					onloadedmetadata={handleLoadedMetadata}
					ontimeupdate={handleTimeUpdate}
					onpause={() => { paused = true; saveProgress(); }}
					onplay={() => paused = false}
					onended={clearProgress}
				></video>
			{/if}
		{/if}
	</div>

	{#if paused && !playbackError && extensions.mediaActions.length > 0}
		<div class="capture-bar">
			{#each extensions.mediaActions as ma}
				<button
					class="capture-btn"
					class:enhance={ma.accent}
					onclick={() => runMediaAction(ma)}
					disabled={capturing}
				>
					{@html ma.icon}
					{capturing && ma.busyLabel ? ma.busyLabel : ma.label}
				</button>
			{/each}
		</div>
	{/if}

	<canvas bind:this={canvasEl} class="hidden-canvas"></canvas>
</div>

<style>
	.video-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.95);
		z-index: 200;
		display: flex;
		flex-direction: column;
		outline: none;
	}

	.video-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		padding-top: calc(env(safe-area-inset-top) + 12px);
		z-index: 10;
	}

	.video-name {
		font-size: 14px;
		font-weight: 500;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.header-btn {
		padding: 8px;
		border-radius: 50%;
		transition: background var(--transition);
	}

	.header-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.video-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		overflow: hidden;
		min-height: 0;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 8px;
		outline: none;
	}

	.error-fallback {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		color: var(--text-secondary);
	}

	.error-fallback p {
		font-size: 15px;
	}

	.download-btn {
		padding: 10px 24px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: white;
		font-size: 14px;
		font-weight: 500;
		transition: opacity var(--transition);
	}

	.download-btn:hover {
		opacity: 0.85;
	}

	.capture-bar {
		display: flex;
		justify-content: center;
		gap: 12px;
		padding: 12px 16px;
		padding-bottom: calc(env(safe-area-inset-bottom) + 12px);
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(8px);
	}

	.capture-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.12);
		color: white;
		font-size: 13px;
		font-weight: 500;
		transition: background var(--transition);
	}

	.capture-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
	}

	.capture-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.capture-btn.enhance {
		background: var(--accent);
	}

	.capture-btn.enhance:hover:not(:disabled) {
		opacity: 0.85;
	}

	.hidden-canvas {
		display: none;
	}
</style>
