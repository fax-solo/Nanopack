<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  type Service = 'home' | 'pack' | 'unpack' | 'repack' | 'upscale' | 'admin' | 'settings'

  let { activeService, mode, isAdmin = false, userName = '' }: {
    activeService: Service
    mode: 'quick' | 'deep'
    isAdmin?: boolean
    userName?: string
  } = $props()

  const dispatch = createEventDispatcher()

  const services: { id: Service; label: string; icon: string; adminOnly?: boolean }[] = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'pack', label: 'Pack', icon: '📦' },
    { id: 'unpack', label: 'Unpack', icon: '📂' },
    { id: 'repack', label: 'Repack', icon: '🔄' },
    { id: 'upscale', label: 'Upscale', icon: '🔍' },
    { id: 'admin', label: 'Dashboard', icon: '📊', adminOnly: true },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  function select(svc: Service) { dispatch('serviceChange', svc) }
  function setMode(m: 'quick' | 'deep') { dispatch('modeChange', m) }
  function logout() { dispatch('logout') }

  let initials = $derived(userName ? userName.slice(0, 2).toUpperCase() : 'NA')
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <div class="logo">
      <span class="logo-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 20V4l8 12V4l8 16" />
        </svg>
      </span>
      <div>
        <div class="logo-name">NanoPack</div>
        <div class="logo-tag">precision archiving</div>
      </div>
    </div>
  </div>

  <nav class="service-list">
    {#each services as svc}
      {#if !svc.adminOnly || isAdmin}
        <button
          class="service-item"
          class:active={activeService === svc.id}
          onclick={() => select(svc.id)}
        >
          <span class="si-icon">{svc.icon}</span>
          <span class="si-label">{svc.label}</span>
          {#if activeService === svc.id}<span class="si-active"></span>{/if}
        </button>
      {/if}
    {/each}
  </nav>

  <div class="sidebar-bottom">
    <div class="user-card">
      <div class="user-avatar">{initials}</div>
      <div class="user-name">{userName || 'User'}</div>
      <button class="user-logout" onclick={logout} title="Sign out">✕</button>
    </div>

    <div class="mode-area">
      <div class="mode-label">Mode</div>
      <div class="mode-buttons">
        <button class="mode-btn" class:active={mode === 'quick'} onclick={() => setMode('quick')}>
          Quick
        </button>
        <button class="mode-btn deep" class:active={mode === 'deep'} onclick={() => setMode('deep')}>
          Deep
        </button>
      </div>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar-header {
    padding: 20px 16px 12px;
    border-bottom: 1px solid var(--border);
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo-icon {
    width: 34px;
    height: 34px;
    background: var(--accent);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 800;
    color: var(--bg);
    flex-shrink: 0;
  }
  .logo-name {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.3px;
    line-height: 1.2;
  }
  .logo-tag {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .service-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px;
    overflow-y: auto;
  }
  .service-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    transition: all var(--transition-fast);
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: var(--font-sans);
    position: relative;
  }
  .service-item:hover {
    background: var(--surface-raised);
    color: var(--text);
  }
  .service-item.active {
    background: var(--surface-raised);
    color: var(--accent);
    font-weight: 600;
  }
  .si-icon { font-size: 16px; width: 22px; text-align: center; flex-shrink: 0; }
  .si-label { flex: 1; }
  .si-active {
    width: 3px;
    height: 18px;
    background: var(--accent);
    border-radius: 2px;
    flex-shrink: 0;
  }
  .sidebar-bottom {
    border-top: 1px solid var(--border);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .user-card {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .user-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent-dim);
    color: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-mono);
    flex-shrink: 0;
  }
  .user-name {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .user-logout {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    line-height: 1;
    flex-shrink: 0;
  }
  .user-logout:hover { color: var(--danger); background: rgba(217,99,74,0.1); }
  .mode-area { }
  .mode-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .mode-buttons {
    display: flex;
    gap: 4px;
    background: var(--bg);
    border-radius: var(--radius-md);
    padding: 3px;
  }
  .mode-btn {
    flex: 1;
    padding: 5px 10px;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono);
    transition: all var(--transition-fast);
    background: transparent;
    color: var(--text-muted);
  }
  .mode-btn:hover { color: var(--text); }
  .mode-btn.active {
    background: var(--accent);
    color: var(--bg);
  }
  .mode-btn.active.deep { background: var(--accent-dim); }
</style>
