<script>
	import { viewer } from '$lib/stores/viewer.svelte.js';
	import { onMount } from 'svelte';

	let containerEl = $state(null);

	// Swipe state
	let offsetX = $state(0);
	let isDragging = $state(false);
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let currentX = 0;
	let isHorizontalSwipe = $state(false);
	let directionLocked = false;

	// Animation
	let animating = $state(false);
	let animationTarget = 0;

	/** @param {any} item */
	const itemSrc = (item) => item?.url || item?.thumbnail || '';

	// Preload adjacent images
	let preloaded = $state(new Set());
	$effect(() => {
		const idx = viewer.index;
		const toLoad = [idx - 1, idx, idx + 1].filter(
			(i) => i >= 0 && i < viewer.items.length
		);
		toLoad.forEach((i) => {
			if (!preloaded.has(i)) {
				const img = new Image();
				img.src = itemSrc(viewer.items[i]);
				preloaded.add(i);
			}
		});
	});

	const slideWidth = () => containerEl?.clientWidth ?? window.innerWidth;

	const handleTouchStart = (/** @type {TouchEvent} */ e) => {
		if (animating) return;
		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		startTime = Date.now();
		isDragging = true;
		directionLocked = false;
		isHorizontalSwipe = false;
		currentX = 0;
	};

	const handleTouchMove = (/** @type {TouchEvent} */ e) => {
		if (!isDragging) return;
		const touch = e.touches[0];
		const dx = touch.clientX - startX;
		const dy = touch.clientY - startY;

		if (!directionLocked) {
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
				directionLocked = true;
				isHorizontalSwipe = Math.abs(dx) > Math.abs(dy);
			}
			return;
		}

		if (!isHorizontalSwipe) return;

		e.preventDefault();
		currentX = dx;

		// Rubber band effect at edges
		if ((dx > 0 && !viewer.hasPrev) || (dx < 0 && !viewer.hasNext)) {
			offsetX = dx * 0.3;
		} else {
			offsetX = dx;
		}
	};

	// Click outside image to close
	let didMove = false;
	const handleOverlayClick = (/** @type {MouseEvent} */ e) => {
		if (didMove) return;
		const target = /** @type {HTMLElement} */ (e.target);
		// Close if clicking the dark background, not the image or controls
		if (
			target.closest('.slide img') ||
			target.closest('.viewer-header') ||
			target.closest('.nav-arrow') ||
			target.closest('.dots')
		) return;
		viewer.close();
	};

	const handleMouseDown = () => { didMove = false; };
	const handleMouseMove = () => { didMove = true; };

	const handleTouchEnd = () => {
		if (!isDragging || !isHorizontalSwipe) {
			isDragging = false;
			offsetX = 0;
			return;
		}

		isDragging = false;
		const elapsed = Date.now() - startTime;
		const velocity = currentX / elapsed;
		const width = slideWidth();
		const threshold = width * 0.25;

		const shouldSwipe =
			Math.abs(currentX) > threshold || Math.abs(velocity) > 0.4;

		if (shouldSwipe && currentX > 0 && viewer.hasPrev) {
			animateToSlide(width, () => {
				viewer.prev();
				offsetX = 0;
			});
		} else if (shouldSwipe && currentX < 0 && viewer.hasNext) {
			animateToSlide(-width, () => {
				viewer.next();
				offsetX = 0;
			});
		} else {
			animateToSlide(0, () => {
				offsetX = 0;
			});
		}
	};

	/**
	 * @param {number} target
	 * @param {() => void} onComplete
	 */
	const animateToSlide = (target, onComplete) => {
		animating = true;
		const start = offsetX;
		const distance = target - start;
		const duration = Math.min(300, Math.max(150, Math.abs(distance) * 0.5));
		const startTimestamp = performance.now();

		const tick = (/** @type {number} */ now) => {
			const elapsed = now - startTimestamp;
			const progress = Math.min(elapsed / duration, 1);
			// Ease out cubic
			const eased = 1 - Math.pow(1 - progress, 3);
			offsetX = start + distance * eased;

			if (progress < 1) {
				requestAnimationFrame(tick);
			} else {
				animating = false;
				onComplete();
			}
		};

		requestAnimationFrame(tick);
	};

	// Keyboard navigation
	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (e.key === 'Escape') viewer.close();
		if (e.key === 'ArrowLeft') viewer.prev();
		if (e.key === 'ArrowRight') viewer.next();
	};

	onMount(() => {
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="viewer-overlay"
	bind:this={containerEl}
	onclick={handleOverlayClick}
	onmousedown={handleMouseDown}
	onmousemove={handleMouseMove}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
>
	<div class="viewer-header">
		<div class="viewer-title">
			<span class="viewer-name">{viewer.current?.name ?? ''}</span>
			<span class="viewer-count">{viewer.index + 1} / {viewer.items.length}</span>
		</div>
		<button class="close-btn" onclick={() => viewer.close()} aria-label="Close">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		</button>
	</div>

	<div class="slides-track" style="transform: translateX({offsetX}px)">
		{#if viewer.hasPrev}
			<div class="slide slide-prev">
				<img src={itemSrc(viewer.items[viewer.index - 1])} alt="" />
			</div>
		{/if}

		<div class="slide slide-current">
			{#if viewer.current}
				<img src={itemSrc(viewer.current)} alt={viewer.current.name} />
			{/if}
		</div>

		{#if viewer.hasNext}
			<div class="slide slide-next">
				<img src={itemSrc(viewer.items[viewer.index + 1])} alt="" />
			</div>
		{/if}
	</div>

	<!-- Desktop nav arrows -->
	{#if viewer.hasPrev}
		<button class="nav-arrow nav-prev" onclick={() => viewer.prev()} aria-label="Previous">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M15 18l-6-6 6-6" />
			</svg>
		</button>
	{/if}

	{#if viewer.hasNext}
		<button class="nav-arrow nav-next" onclick={() => viewer.next()} aria-label="Next">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M9 18l6-6-6-6" />
			</svg>
		</button>
	{/if}

	<!-- Dot indicators -->
	{#if viewer.items.length <= 20}
		<div class="dots">
			{#each viewer.items as _, i}
				<div class="dot" class:active={i === viewer.index}></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.viewer-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.95);
		z-index: 200;
		display: flex;
		flex-direction: column;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
	}

	.viewer-header {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		padding-top: calc(env(safe-area-inset-top) + 12px);
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
		z-index: 10;
	}

	.viewer-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.viewer-name {
		font-size: 14px;
		font-weight: 500;
	}

	.viewer-count {
		font-size: 12px;
		color: var(--text-muted);
	}

	.close-btn {
		padding: 8px;
		border-radius: 50%;
		transition: background var(--transition);
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.slides-track {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		will-change: transform;
	}

	.slide {
		position: absolute;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 60px 16px;
	}

	.slide img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 4px;
		pointer-events: none;
	}

	.slide-prev {
		transform: translateX(-100%);
	}

	.slide-next {
		transform: translateX(100%);
	}

	.nav-arrow {
		display: none;
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(8px);
		align-items: center;
		justify-content: center;
		transition: background var(--transition);
		z-index: 10;
	}

	.nav-arrow:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.nav-prev {
		left: 16px;
	}

	.nav-next {
		right: 16px;
	}

	@media (min-width: 768px) {
		.nav-arrow {
			display: flex;
		}
	}

	.dots {
		position: absolute;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 6px;
		z-index: 10;
		padding-bottom: env(safe-area-inset-bottom);
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.3);
		transition: all 0.2s ease;
	}

	.dot.active {
		background: white;
		transform: scale(1.3);
	}
</style>
