<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { fade, fly } from 'svelte/transition'

  let mode: 'login' | 'register' = $state('login')
  let username = $state('')
  let password = $state('')
  let displayName = $state('')
  let error = $state('')
  let loading = $state(false)
  let showForm = $state(true)

  const dispatch = createEventDispatcher()

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''
    loading = true
    try {
      const result = mode === 'login'
        ? await window.nanopack.login(username, password)
        : await window.nanopack.register(username, password, displayName || username)
      if (result.success) dispatch('auth', result)
      else error = result.error || 'An error occurred'
    } catch (e: any) { error = e.message || 'Connection error' }
    loading = false
  }

  async function handleGuest() {
    loading = true
    try {
      const result = await window.nanopack.guestLogin()
      if (result.success) dispatch('auth', result)
      else error = result.error || 'Could not create guest session'
    } catch (e: any) { error = e.message || 'Connection error' }
    loading = false
  }

  function switchMode() {
    mode = mode === 'login' ? 'register' : 'login'
    error = ''
  }

  $effect(() => { setTimeout(() => showForm = true, 200) })
</script>

<div class="auth-bg">
  <div class="auth-container">
    <div class="auth-brand">
      <div class="brand-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 20V4l8 12V4l8 16" />
        </svg>
      </div>
      <div class="brand-name">NanoPack</div>
      <div class="brand-tag">precision archiving</div>
    </div>

    {#if showForm}
      <div class="auth-card" transition:fly={{ y: 20, duration: 300 }}>
        <div class="auth-tabs">
          <button class="auth-tab" class:active={mode === 'login'} onclick={() => { mode = 'login'; error = '' }}>Sign In</button>
          <button class="auth-tab" class:active={mode === 'register'} onclick={() => { mode = 'register'; error = '' }}>Register</button>
        </div>

        <form onsubmit={handleSubmit}>
          <div class="field">
            <label class="field-label">
              Username
              <input bind:value={username} placeholder="Enter your username" class="input" required minlength={3} disabled={loading} />
            </label>
          </div>
          {#if mode === 'register'}
            <div class="field">
              <label class="field-label">
                Display name
                <input bind:value={displayName} placeholder="How others see you (optional)" class="input" disabled={loading} />
              </label>
            </div>
          {/if}
          <div class="field">
            <label class="field-label">
              Password
              <input bind:value={password} type="password" placeholder="Enter your password" class="input" required minlength={4} disabled={loading} />
            </label>
          </div>

          {#if error}
            <div class="auth-error" transition:fade>{error}</div>
          {/if}

          <button type="submit" class="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div class="auth-divider"><span>or</span></div>

        <button class="btn btn-secondary auth-guest" onclick={handleGuest} disabled={loading}>
          Continue as Guest
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .auth-bg {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    z-index: 100;
  }
  .auth-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    width: 100%;
    max-width: 400px;
    padding: 0 24px;
  }
  .auth-brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .brand-icon {
    width: 56px;
    height: 56px;
    background: var(--accent);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 26px;
    font-weight: 800;
    color: var(--bg);
    margin-bottom: 4px;
  }
  .brand-name {
    font-family: var(--font-mono);
    font-size: 26px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.5px;
  }
  .brand-tag {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .auth-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 28px 24px 24px;
    width: 100%;
  }
  .auth-tabs {
    display: flex;
    gap: 4px;
    background: var(--bg);
    border-radius: var(--radius-md);
    padding: 3px;
    margin-bottom: 24px;
  }
  .auth-tab {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font-sans);
    background: transparent;
    color: var(--text-muted);
    transition: all var(--transition-fast);
  }
  .auth-tab.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .auth-tab:hover:not(.active) { color: var(--text); }
  .field { margin-bottom: 16px; }
  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 6px;
    display: block;
  }
  .input {
    width: 100%;
    padding: 10px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    font-size: 14px;
    font-family: var(--font-sans);
    outline: none;
    transition: border var(--transition-fast);
  }
  .input:focus { border-color: var(--accent); }
  .input::placeholder { color: var(--text-muted); }
  .auth-error {
    font-size: 12px;
    color: var(--danger);
    padding: 8px 12px;
    background: rgba(217,99,74,0.1);
    border-radius: var(--radius-sm);
    margin-bottom: 12px;
  }
  .auth-submit { width: 100%; justify-content: center; margin-top: 4px; }
  .auth-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
    color: var(--text-muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .auth-divider::before,
  .auth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .auth-guest { width: 100%; justify-content: center; }
</style>
