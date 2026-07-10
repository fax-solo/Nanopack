<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  type Service = 'pack' | 'unpack' | 'repack' | 'upscale' | 'admin'

  let { activeService, mode, isAdmin = false, userName = '' }: {
    activeService: Service
    mode: 'quick' | 'deep'
    isAdmin?: boolean
    userName?: string
  } = $props()

  const dispatch = createEventDispatcher()

  const services: { id: Service; label: string; icon: string; desc: string; adminOnly?: boolean }[] = [
    { id: 'pack', label: 'Pack', icon: '📦', desc: 'Pack files into an archive' },
    { id: 'unpack', label: 'Unpack', icon: '📂', desc: 'Extract or mount an archive' },
    { id: 'repack', label: 'Repack', icon: '🔄', desc: 'Update an existing archive' },
    { id: 'upscale', label: 'Upscale', icon: '🔍', desc: 'AI upscale video' },
    { id: 'admin', label: 'Dashboard', icon: '📊', desc: 'Admin analytics', adminOnly: true },
  ]

  function select(svc: Service) {
    dispatch('serviceChange', svc)
  }

  function setMode(m: 'quick' | 'deep') {
    dispatch('modeChange', m)
  }

  function logout() {
    dispatch('logout')
  }
</script>

<aside class="sidebar">
  <div style="padding: 0 16px 16px;">
    <div style="font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--accent); letter-spacing: -0.5px;">
      NanoPack
    </div>
    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
      precision archiving
    </div>
    {#if userName}
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border);">
        {userName}
      </div>
    {/if}
  </div>

  <nav class="service-list">
    {#each services as svc}
      {#if !svc.adminOnly || isAdmin}
        <button
          class="service-item"
          class:active={activeService === svc.id}
          onclick={() => select(svc.id)}
        >
          <span class="icon">{svc.icon}</span>
          <div>
            <div>{svc.label}</div>
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 400;">{svc.desc}</div>
          </div>
        </button>
      {/if}
    {/each}
  </nav>

  <div class="mode-toggle-area">
    <div class="mode-label">Mode</div>
    <div class="mode-buttons">
      <button class="mode-btn" class:active={mode === 'quick'} onclick={() => setMode('quick')}>
        Quick
      </button>
      <button class="mode-btn deep" class:active={mode === 'deep'} onclick={() => setMode('deep')}>
        Deep
      </button>
    </div>
    <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px; padding: 0 2px;">
      {#if mode === 'quick'}
        Fast compression, modest savings
      {:else}
        Maximum compression, slower
      {/if}
    </div>
    <button class="btn btn-secondary" style="width: 100%; margin-top: 12px; font-size: 12px; justify-content: center;" onclick={logout}>
      Sign Out
    </button>
  </div>
</aside>
