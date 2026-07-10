<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  let mode: 'login' | 'register' = $state('login')
  let username = $state('')
  let password = $state('')
  let displayName = $state('')
  let error = $state('')
  let loading = $state(false)

  const dispatch = createEventDispatcher()

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''
    loading = true

    try {
      let result
      if (mode === 'login') {
        result = await window.nanopack.login(username, password)
      } else {
        result = await window.nanopack.register(username, password, displayName || username)
      }

      if (result.success) {
        dispatch('auth', result)
      } else {
        error = result.error || 'An error occurred'
      }
    } catch (e: any) {
      error = e.message || 'Connection error'
    }
    loading = false
  }

  async function handleGuest() {
    loading = true
    try {
      const result = await window.nanopack.guestLogin()
      if (result.success) {
        dispatch('auth', result)
      } else {
        error = result.error || 'Could not create guest session'
      }
    } catch (e: any) {
      error = e.message || 'Connection error'
    }
    loading = false
  }

  function switchMode() {
    mode = mode === 'login' ? 'register' : 'login'
    error = ''
  }
</script>

<div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: var(--bg);">
  <div class="card" style="width: 400px; padding: 32px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--accent); letter-spacing: -0.5px;">
        NanoPack
      </div>
      <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
        precision archiving
      </div>
    </div>

    <form onsubmit={handleSubmit} class="flex-col gap-12">
      <input
        bind:value={username}
        placeholder="Username"
        class="input"
        required
        minlength={3}
        disabled={loading}
      />

      {#if mode === 'register'}
        <input
          bind:value={displayName}
          placeholder="Display name (optional)"
          class="input"
          disabled={loading}
        />
      {/if}

      <input
        bind:value={password}
        type="password"
        placeholder="Password"
        class="input"
        required
        minlength={4}
        disabled={loading}
      />

      {#if error}
        <div style="font-size: 12px; color: var(--danger); padding: 8px; background: rgba(217,99,74,0.1); border-radius: var(--radius-sm);">
          {error}
        </div>
      {/if}

      <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;" disabled={loading}>
        {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
      </button>
    </form>

    <div style="margin-top: 16px; text-align: center;">
      <button class="btn btn-secondary" style="width: 100%; justify-content: center;" onclick={handleGuest} disabled={loading}>
        Continue as Guest
      </button>
    </div>

    <div style="margin-top: 16px; text-align: center; font-size: 13px; color: var(--text-muted);">
      {#if mode === 'login'}
        Don't have an account?
        <button class="link-btn" onclick={switchMode}>Register</button>
      {:else}
        Already have an account?
        <button class="link-btn" onclick={switchMode}>Sign In</button>
      {/if}
    </div>
  </div>
</div>

<style>
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
  .input:focus {
    border-color: var(--accent);
  }
  .input::placeholder {
    color: var(--text-muted);
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 13px;
    font-family: var(--font-sans);
    padding: 0;
    text-decoration: underline;
  }
  .link-btn:hover {
    color: var(--accent-dim);
  }
</style>
