<script>
	let { type, color = '#666', size = 40 } = $props();
</script>

{#if type === 'folder'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
		<path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
	</svg>
{:else if type === 'image'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#4f9cf7" stroke-width="1.5">
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<circle cx="8.5" cy="8.5" r="1.5" />
		<path d="M21 15l-5-5L5 21" />
	</svg>
{:else if type === 'video'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="1.5">
		<rect x="2" y="4" width="20" height="16" rx="2" />
		<polygon points="10,8 16,12 10,16" fill="#e74c3c" stroke="none" />
	</svg>
{:else if type === 'document'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="1.5">
		<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
		<polyline points="14,2 14,8 20,8" />
		<line x1="8" y1="13" x2="16" y2="13" />
		<line x1="8" y1="17" x2="13" y2="17" />
	</svg>
{:else if type === 'audio'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e67e22" stroke-width="1.5">
		<path d="M9 18V5l12-2v13" />
		<circle cx="6" cy="18" r="3" />
		<circle cx="18" cy="16" r="3" />
	</svg>
{:else if type === 'archive'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9b59b6" stroke-width="1.5">
		<path d="M21 8v13H3V8" />
		<path d="M1 3h22v5H1z" />
		<path d="M10 12h4" />
	</svg>
{:else}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5">
		<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
		<polyline points="14,2 14,8 20,8" />
	</svg>
{/if}
