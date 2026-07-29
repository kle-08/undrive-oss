<script>
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import ImageViewer from '$lib/components/ImageViewer.svelte';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import DocEditor from '$lib/components/DocEditor.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import QuickActionMenu from '$lib/components/QuickActionMenu.svelte';
	import QuickActionDialog from '$lib/components/QuickActionDialog.svelte';
	import MiniPlayer from '$lib/components/MiniPlayer.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import SharesManager from '$lib/components/SharesManager.svelte';
	import VaultModal from '$lib/components/VaultModal.svelte';
	import { viewer } from '$lib/stores/viewer.svelte.js';
	import { files } from '$lib/stores/files.svelte.js';
	import { isBackendDown } from '$lib/api/client.js';
	import { extensions } from '$lib/extensions/registry.svelte.js';
	import { registerPlugins } from '$lib/extensions/active-plugins.js';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	let sidebarOpen = $state(false);
	let backendDown = $state(false);

	// Drive navigation from URL
	let lastPath = '';
	$effect(() => {
		const urlPath = decodeURIComponent(page.url.pathname);
		if (urlPath !== lastPath) {
			lastPath = urlPath;
			files.navigate(urlPath === '/' ? '/' : urlPath);
		}
	});

	// Register optional plugins client-side (no-op in the pure-drive build)
	onMount(() => {
		registerPlugins();
		const interval = setInterval(() => {
			backendDown = isBackendDown();
		}, 2000);
		return () => clearInterval(interval);
	});

	const retryConnection = async () => {
		try {
			await files.refresh();
			backendDown = isBackendDown();
		} catch {
			backendDown = true;
		}
	};
</script>

<div class="app">
	<Sidebar bind:open={sidebarOpen} />

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
	<main class="main" onclick={() => (sidebarOpen = false)}>
		{#if backendDown}
			<div class="connection-banner">
				<span>Backend unreachable — data may be stale</span>
				<button onclick={retryConnection}>Retry</button>
			</div>
		{/if}
		{@render children()}
	</main>

	<BottomBar onMenuToggle={() => (sidebarOpen = !sidebarOpen)} />
</div>

{#if viewer.open && viewer.type === 'image'}
	<ImageViewer />
{/if}

{#if viewer.open && viewer.type === 'video'}
	<VideoPlayer />
{/if}

{#each extensions.panels as Panel}
	<Panel />
{/each}
<DocEditor />
<ConfirmDialog />
<QuickActionMenu />
<QuickActionDialog />
<MiniPlayer />
<ShareDialog />
<SharesManager />
<VaultModal />
<ToastContainer />

<style>
	.app {
		display: flex;
		height: 100dvh;
		width: 100%;
		overflow: hidden;
	}

	.main {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 16px;
		padding-bottom: calc(var(--bottom-bar-height) + 16px);
	}

	@media (min-width: 768px) {
		.main {
			padding: 24px 32px;
			padding-bottom: 24px;
		}
	}

	.connection-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		margin-bottom: 12px;
		background: #d32f2f22;
		border: 1px solid #d32f2f55;
		border-radius: var(--radius-sm);
		color: #ef5350;
		font-size: 13px;
		font-weight: 500;
	}

	.connection-banner button {
		padding: 4px 14px;
		border-radius: var(--radius-sm);
		background: #d32f2f;
		color: white;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
	}

	.connection-banner button:hover {
		filter: brightness(1.15);
	}
</style>
