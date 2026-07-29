<script>
	import { vault } from '$lib/stores/vault.svelte.js';
	import { files } from '$lib/stores/files.svelte.js';

	let pass1 = $state('');
	let pass2 = $state('');
	let curPass = $state('');
	let okMsg = $state('');

	const show = $derived(vault.showGate || vault.showChange || (files.isVault && files.vaultLocked));
	const matchWarn = $derived(pass2.length > 0 && pass1 !== pass2);

	const reset = () => { pass1 = ''; pass2 = ''; curPass = ''; okMsg = ''; };

	const doSetup = async () => {
		if (pass1.length < 6 || pass1 !== pass2) return;
		await vault.setup(pass1);
		if (vault.unlocked) reset();
	};

	const doUnlock = async () => {
		await vault.unlock(pass1);
		if (vault.unlocked) reset();
	};

	const doChange = async () => {
		if (pass1.length < 6 || pass1 !== pass2) return;
		const ok = await vault.change(curPass, pass1);
		if (ok) { reset(); okMsg = 'Passphrase changed.'; vault.closeChange(); }
	};

	const close = () => {
		reset();
		if (vault.showChange) { vault.closeChange(); return; }
		vault.closeGate();
		if (files.isVault && files.vaultLocked) files.exitVault();
	};
</script>

{#if show}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="gate-overlay" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
		<div class="gate">
			<div class="gate-icon">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
			</div>

			{#if vault.showChange}
				<h3>Change passphrase</h3>
				<input type="password" placeholder="Current passphrase" bind:value={curPass} />
				<input type="password" placeholder="New passphrase (min 6)" bind:value={pass1} />
				<input type="password" placeholder="Confirm new" bind:value={pass2} onkeydown={(e) => e.key === 'Enter' && doChange()} />
				{#if matchWarn}<p class="err">New passphrases don't match</p>{/if}
				{#if vault.error}<p class="err">{vault.error}</p>{/if}
				<button class="btn" disabled={vault.loading || pass1.length < 6 || pass1 !== pass2 || !curPass} onclick={doChange}>
					{vault.loading ? 'Saving…' : 'Change passphrase'}
				</button>
			{:else if !vault.configured}
				<h3>Create your vault</h3>
				<p class="sub">Set a passphrase. Files aren't encrypted — the passphrase only gates access, so you can never be locked out of them.</p>
				<input type="password" placeholder="Passphrase (min 6 chars)" bind:value={pass1} onkeydown={(e) => e.key === 'Enter' && doSetup()} />
				<input type="password" placeholder="Confirm passphrase" bind:value={pass2} onkeydown={(e) => e.key === 'Enter' && doSetup()} />
				{#if matchWarn}<p class="err">Passphrases don't match</p>{/if}
				{#if vault.error}<p class="err">{vault.error}</p>{/if}
				<button class="btn" disabled={vault.loading || pass1.length < 6 || pass1 !== pass2} onclick={doSetup}>
					{vault.loading ? 'Creating…' : 'Create vault'}
				</button>
				<p class="sub">A “Vault” folder then appears on your Home for this session.</p>
			{:else}
				<h3>Unlock vault</h3>
				<input type="password" placeholder="Passphrase" bind:value={pass1} onkeydown={(e) => e.key === 'Enter' && doUnlock()} />
				{#if vault.error}<p class="err">{vault.error}</p>{/if}
				<button class="btn" disabled={vault.loading || !pass1} onclick={doUnlock}>
					{vault.loading ? 'Unlocking…' : 'Unlock'}
				</button>
				<p class="hint">Forgot it? Delete <code>__vault/.auth</code> in your R2 dashboard to reset — your files stay intact.</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.gate-overlay {
		position: fixed; inset: 0; z-index: 250; background: rgba(0, 0, 0, 0.6);
		display: flex; align-items: center; justify-content: center; padding: 16px;
	}
	.gate {
		width: min(360px, 100%); display: flex; flex-direction: column; gap: 10px; text-align: center;
		background: var(--bg-secondary); border: 1px solid var(--border);
		border-radius: 14px; padding: 28px 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
	}
	.gate-icon { display: flex; justify-content: center; color: var(--accent); margin-bottom: 2px; }
	.gate h3 { font-size: 16px; }
	.sub { font-size: 13px; color: var(--text-muted); }
	.gate input {
		padding: 10px 12px; border-radius: 8px; background: var(--bg-tertiary);
		border: 1px solid var(--border); font-size: 14px; color: var(--text-primary);
	}
	.btn { padding: 10px; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 500; font-size: 14px; }
	.btn:disabled { opacity: 0.5; }
	.err { color: #ef5350; font-size: 13px; }
	.hint { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
	.hint code { background: var(--bg-tertiary); padding: 1px 5px; border-radius: 4px; }
</style>
