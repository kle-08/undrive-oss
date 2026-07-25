<script>
	import { viewer } from '$lib/stores/viewer.svelte.js';

	/** @type {HTMLVideoElement|undefined} */
	let videoEl = $state();

	let seeked = $state(false);
	let seekTarget = 0;

	// Dragging state
	let dragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let posX = $state(-1);
	let posY = $state(-1);
	let startPosX = 0;
	let startPosY = 0;
	let hasMoved = false;

	const STORAGE_KEY = 'mini-player-pos';

	const initPosition = () => {
		if (posX === -1) {
			try {
				const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
				posX = Math.min(saved.x, window.innerWidth - 280);
				posY = Math.min(saved.y, window.innerHeight - 200);
			} catch {
				posX = window.innerWidth - 280 - 16;
				posY = window.innerHeight - 200 - 16;
			}
		}
	};

	const savePosition = () => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: posX, y: posY }));
		} catch { /* ignore */ }
	};

	const handleMouseDown = (/** @type {MouseEvent} */ e) => {
		if (/** @type {HTMLElement} */ (e.target).closest('.mini-btn') || /** @type {HTMLElement} */ (e.target).closest('video')) return;
		e.preventDefault();
		dragging = true;
		hasMoved = false;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		startPosX = posX;
		startPosY = posY;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	};

	const handleMouseMove = (/** @type {MouseEvent} */ e) => {
		if (!dragging) return;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
		posX = Math.max(0, Math.min(startPosX + dx, window.innerWidth - 280));
		posY = Math.max(0, Math.min(startPosY + dy, window.innerHeight - 200));
	};

	const handleMouseUp = () => {
		dragging = false;
		if (hasMoved) savePosition();
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	};

	const handleExpand = (/** @type {MouseEvent} */ e) => {
		e.stopPropagation();
		if (videoEl) viewer.updatePipTime(videoEl.currentTime);
		viewer.expandPip();
	};

	const handleClose = (/** @type {MouseEvent} */ e) => {
		e.stopPropagation();
		if (videoEl && viewer.pipItem?.key) {
			try {
				const data = JSON.parse(localStorage.getItem('video-progress') ?? '{}');
				data[viewer.pipItem.key] = videoEl.currentTime;
				localStorage.setItem('video-progress', JSON.stringify(data));
			} catch { /* ignore */ }
		}
		viewer.closePip();
	};

	const handleTimeUpdate = () => {
		if (!seeked) return;
		if (videoEl) viewer.updatePipTime(videoEl.currentTime);
	};

	const handleLoadedMetadata = () => {
		if (videoEl && seekTarget > 0) {
			videoEl.currentTime = seekTarget;
		}
		seeked = true;
	};

	$effect(() => {
		if (viewer.pip) {
			initPosition();
			seeked = false;
			seekTarget = viewer.pipTime;
		}
	});
</script>

{#if viewer.pip && viewer.pipItem}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="mini-player"
		class:dragging
		style="left:{posX}px; top:{posY}px"
		onmousedown={handleMouseDown}
	>
		<div class="mini-header">
			<span class="mini-name">{viewer.pipItem.name}</span>
			<div class="mini-actions">
				<button class="mini-btn" onclick={handleExpand} aria-label="Expand" title="Expand">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="15 3 21 3 21 9" />
						<polyline points="9 21 3 21 3 15" />
						<line x1="21" y1="3" x2="14" y2="10" />
						<line x1="3" y1="21" x2="10" y2="14" />
					</svg>
				</button>
				<button class="mini-btn" onclick={handleClose} aria-label="Close" title="Close">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoEl}
			src={viewer.pipItem.url}
			autoplay
			controls
			playsinline
			ontimeupdate={handleTimeUpdate}
			onloadedmetadata={handleLoadedMetadata}
		></video>
	</div>
{/if}

<style>
	.mini-player {
		position: fixed;
		z-index: 300;
		width: 280px;
		border-radius: 10px;
		overflow: hidden;
		background: #000;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
	}

	.mini-player.dragging {
		cursor: grabbing;
		opacity: 0.9;
	}

	.mini-header {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent);
		z-index: 2;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.mini-player:hover .mini-header {
		opacity: 1;
	}

	.mini-name {
		font-size: 11px;
		font-weight: 500;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		margin-right: 4px;
	}

	.mini-actions {
		display: flex;
		gap: 2px;
		flex-shrink: 0;
	}

	.mini-btn {
		padding: 4px;
		border-radius: 50%;
		color: white;
		flex-shrink: 0;
		transition: background 0.15s;
	}

	.mini-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	video {
		width: 100%;
		display: block;
	}

	/* Hide native controls by default, show on hover */
	video::-webkit-media-controls {
		opacity: 0;
		transition: opacity 0.2s;
	}

	.mini-player:hover video::-webkit-media-controls {
		opacity: 1;
	}

	@media (max-width: 767px) {
		.mini-player {
			display: none;
		}
	}
</style>
