<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import Skeleton from '../Skeleton.svelte'

  interface Settings {
    mode: 'quick' | 'deep'
    theme: 'dark' | 'light' | 'system'
    defaultOutputDir: string
    confirmBeforeRun: boolean
    maxThreads: number
  }

  const dispatch = createEventDispatcher()

  let settings = $state<Settings | null>(null)
  let changed = $state(false)
  let themePreview = $state(false)

  async function load() {
    settings = await window.nanopack.getSettings()
    applyTheme(settings.theme)
  }

  function applyTheme(theme: 'dark' | 'light' | 'system') {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : theme
    document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : 'dark')
  }

  async function save() {
    if (!settings) return
    await window.nanopack.setSetting('theme', settings.theme)
    await window.nanopack.setSetting('defaultOutputDir', settings.defaultOutputDir)
    await window.nanopack.setSetting('confirmBeforeRun', settings.confirmBeforeRun)
    await window.nanopack.setSetting('maxThreads', settings.maxThreads)
    applyTheme(settings.theme)
    changed = false
    dispatch('themeChange', settings.theme)
  }

  async function selectOutputDir() {
    const dir = await window.nanopack.openFolderDialog()
    if (dir && settings) {
      settings.defaultOutputDir = dir
      changed = true
    }
  }

  function toggleConfirm() {
    if (!settings) return
    settings.confirmBeforeRun = !settings.confirmBeforeRun
    changed = true
  }

  function setTheme(t: 'dark' | 'light' | 'system') {
    if (!settings) return
    settings.theme = t
    changed = true
  }

  function setThreads(t: number) {
    if (!settings) return
    settings.maxThreads = t
    changed = true
  }

  function clearOutputDir() {
    if (!settings) return
    settings.defaultOutputDir = ''
    changed = true
  }

  $effect(() => { load() })
</script>

<div class="flex-col gap-24" style="padding: 24px 32px; max-width: 800px; margin: 0 auto;">
  <div>
    <div style="font-size: 18px; font-weight: 700; color: var(--text); font-family: var(--font-mono);">Settings</div>
    <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Configure NanoPack to your preferences</div>
  </div>

  {#if !settings}
    <div class="flex-col gap-16">
      {#each Array(3) as _}
        <div class="settings-section"><Skeleton height="100px" /></div>
      {/each}
    </div>
  {:else}
    <!-- General -->
    <section class="settings-section">
      <div class="section-title">General</div>

      <div class="setting-row">
        <div>
          <div class="setting-label">Default output directory</div>
          <div class="setting-desc">Where new packs are saved by default (optional)</div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          {#if settings.defaultOutputDir}
            <span class="mono path-display">{settings.defaultOutputDir}</span>
            <button class="btn btn-ghost" onclick={clearOutputDir} title="Clear">✕</button>
          {/if}
          <button class="btn btn-secondary" onclick={selectOutputDir} style="font-size: 12px;">
            {settings.defaultOutputDir ? 'Change' : 'Choose Folder'}
          </button>
        </div>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-label">Confirm before running</div>
          <div class="setting-desc">Show a confirmation dialog before starting pack/unpack/repack</div>
        </div>
        <button
          class="toggle"
          class:active={settings.confirmBeforeRun}
          onclick={toggleConfirm}
          role="switch"
          aria-checked={settings.confirmBeforeRun}
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </section>

    <!-- Appearance -->
    <section class="settings-section">
      <div class="section-title">Appearance</div>

      <div class="setting-row">
        <div>
          <div class="setting-label">Theme</div>
          <div class="setting-desc">Choose your preferred appearance</div>
        </div>
        <div class="theme-selector">
          {#each [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }, { id: 'system', label: 'System' }] as opt}
            <button
              class="theme-btn"
              class:active={settings.theme === opt.id}
              onclick={() => setTheme(opt.id as 'dark' | 'light' | 'system')}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- Performance -->
    <section class="settings-section">
      <div class="section-title">Performance</div>

      <div class="setting-row">
        <div>
          <div class="setting-label">Max parallel threads</div>
          <div class="setting-desc">0 = auto (uses all available CPU cores)</div>
        </div>
        <select class="select" value={settings.maxThreads} onchange={(e) => setThreads(Number(e.currentTarget.value))}>
          <option value={0}>Auto</option>
          {#each [1, 2, 4, 6, 8, 12, 16] as n}
            <option value={n}>{n} threads</option>
          {/each}
        </select>
      </div>
    </section>

    <!-- Account -->
    <section class="settings-section">
      <div class="section-title">Account</div>

      <div class="setting-row">
        <div>
          <div class="setting-label">Sign out</div>
          <div class="setting-desc">Return to the login screen</div>
        </div>
        <button class="btn btn-secondary" style="font-size: 12px; color: var(--danger);" onclick={() => dispatch('logout')}>
          Sign Out
        </button>
      </div>
    </section>

    <!-- About -->
    <section class="settings-section">
      <div class="section-title">About</div>

      <div class="setting-row">
        <div>
          <div class="setting-label">NanoPack</div>
          <div class="setting-desc">Precision archiving</div>
        </div>
        <div class="mono" style="color: var(--text-muted); font-size: 13px;">v1.0.0</div>
      </div>
    </section>

    <!-- Save bar -->
    {#if changed}
      <div style="display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; border-top: 1px solid var(--border);">
        <button class="btn btn-secondary" onclick={() => load()} style="font-size: 13px;">Cancel</button>
        <button class="btn btn-primary" onclick={save} style="font-size: 13px;">Save Changes</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .settings-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px 24px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
  }
  .setting-row + .setting-row {
    border-top: 1px solid var(--border);
  }
  .setting-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .setting-desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .path-display {
    font-size: 12px;
    color: var(--text-muted);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .theme-selector {
    display: flex;
    gap: 4px;
    background: var(--bg);
    border-radius: var(--radius-md);
    padding: 3px;
  }
  .theme-btn {
    padding: 6px 14px;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-sans);
    background: transparent;
    color: var(--text-muted);
    transition: all var(--transition-fast);
  }
  .theme-btn.active {
    background: var(--accent);
    color: var(--bg);
  }
  .theme-btn:hover:not(.active) {
    color: var(--text);
  }
  .toggle {
    flex-shrink: 0;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    border: none;
    background: var(--border);
    cursor: pointer;
    position: relative;
    transition: background var(--transition-fast);
    padding: 0;
  }
  .toggle.active {
    background: var(--accent);
  }
  .toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--text);
    transition: left var(--transition-fast);
  }
  .toggle.active .toggle-knob {
    left: 23px;
    background: var(--bg);
  }
  .select {
    padding: 6px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    font-size: 13px;
    font-family: var(--font-sans);
    cursor: pointer;
    outline: none;
  }
  .select:focus {
    border-color: var(--accent);
  }
</style>
