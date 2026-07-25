<script>
	import { onMount } from 'svelte';
	import { getVideoThumb, saveVideoThumb } from '$lib/api/client.js';

	let { videoUrl, videoKey, alt = '' } = $props();

	let thumbSrc = $state(null);
	let loading = $state(true);
	let el = $state(null);

	/**
	 * Extract a frame from a video URL using a hidden video element.
	 * Only downloads the first ~500KB-2MB (browser range request).
	 * @param {string} url
	 * @returns {Promise<{ dataUrl: string, blob: Blob }>}
	 */
	const extractFrame = (url) =>
		new Promise((resolve, reject) => {
			const video = document.createElement('video');
			video.crossOrigin = 'anonymous';
			video.muted = true;
			video.preload = 'metadata';

			const timeout = setTimeout(() => {
				video.src = '';
				reject(new Error('Timeout extracting frame'));
			}, 15000);

			video.onloadeddata = () => {
				// Seek to 1 second or 10% of duration, whichever is smaller
				video.currentTime = Math.min(1, video.duration * 0.1);
			};

			video.onseeked = () => {
				clearTimeout(timeout);
				try {
					const canvas = document.createElement('canvas');
					canvas.width = Math.min(video.videoWidth, 320);
					canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
					const ctx = canvas.getContext('2d');
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

					canvas.toBlob(
						(blob) => {
							if (!blob) {
								reject(new Error('Failed to create blob'));
								return;
							}
							const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
							video.src = '';
							resolve({ dataUrl, blob });
						},
						'image/jpeg',
						0.7
					);
				} catch (e) {
					video.src = '';
					reject(e);
				}
			};

			video.onerror = () => {
				clearTimeout(timeout);
				video.src = '';
				reject(new Error('Video load error'));
			};

			video.src = url;
		});

	onMount(() => {
		if (!videoUrl || !videoKey) {
			loading = false;
			return;
		}

		const observer = new IntersectionObserver(
			async (entries) => {
				if (!entries[0].isIntersecting) return;
				observer.disconnect();

				try {
					// Check cache first
					const cached = await getVideoThumb(videoKey);
					if (cached) {
						thumbSrc = cached;
						loading = false;
						return;
					}

					// Generate from video (R2 CORS policy keeps the canvas clean)
					const { dataUrl, blob } = await extractFrame(videoUrl);
					thumbSrc = dataUrl;
					loading = false;

					// Save to R2 in background (don't await)
					saveVideoThumb(videoKey, blob);
				} catch {
					loading = false;
				}
			},
			{ rootMargin: '200px' }
		);

		if (el) observer.observe(el);

		return () => observer.disconnect();
	});
</script>

<div class="video-thumb" bind:this={el}>
	{#if thumbSrc}
		<img src={thumbSrc} {alt} loading="lazy" />
		<div class="play-badge">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
				<polygon points="5,3 19,12 5,21" />
			</svg>
		</div>
	{:else if loading}
		<div class="thumb-loading">
			<div class="spinner"></div>
		</div>
	{:else}
		<slot />
	{/if}
</div>

<style>
	.video-thumb {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.video-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.play-badge {
		position: absolute;
		bottom: 8px;
		right: 8px;
		width: 32px;
		height: 32px;
		background: rgba(0, 0, 0, 0.7);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(4px);
	}

	.thumb-loading {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-tertiary);
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
