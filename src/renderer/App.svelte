<script lang="ts">
  import { fade } from 'svelte/transition'
  import ServiceSelect from './components/ServiceSelect/ServiceSelect.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import PackView from './components/PackView/PackView.svelte'
  import UnpackView from './components/UnpackView/UnpackView.svelte'
  import RepackView from './components/RepackView/RepackView.svelte'
  import UpscaleView from './components/UpscaleView/UpscaleView.svelte'
  import SettingsView from './components/SettingsView/SettingsView.svelte'
  import DownloadBar from './components/DownloadBar.svelte'
  import Toast from './components/Toast.svelte'
  import { showToast } from './lib/toast.svelte'

  type Service = 'home' | 'pack' | 'unpack' | 'repack' | 'upscale' | 'settings'

  let activeService: Service = $state('home')
  let activeMode: 'quick' | 'deep' = $state('quick')
  let activeEngine: string | undefined = $state(undefined)
  let activePreset: string | undefined = $state(undefined)

  // Expose toast globally for child components
  ;(window as any).__toast = showToast

  async function applyTheme(theme: string) {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : theme
    document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : 'dark')
  }

  $effect(() => {
    window.nanopack.getSettings().then(s => applyTheme(s.theme))
  })

  function handleNavigate(event: CustomEvent) {
    const { service, mode, preset, engine } = event.detail
    activeService = service
    if (mode) activeMode = mode
    if (preset) activePreset = preset
    if (engine) activeEngine = engine
  }

  function handleServiceChange(service: Service) {
    activeService = service
    if (service !== 'upscale') {
      activeEngine = undefined
      activePreset = undefined
    }
  }

  async function handleModeChange(newMode: 'quick' | 'deep') {
    activeMode = newMode
    await window.nanopack.setMode(newMode)
  }
</script>

<Toast />

<Sidebar
  {activeService}
  mode={activeMode}
  on:serviceChange={(e) => handleServiceChange(e.detail)}
  on:modeChange={(e) => handleModeChange(e.detail)}
/>

<div class="workspace">
  <DownloadBar />
  {#key activeService}
    <div transition:fade={{ duration: 150 }}>
      {#if activeService === 'home'}
        <ServiceSelect on:navigate={handleNavigate} />
      {:else if activeService === 'pack'}
        <PackView mode={activeMode} />
      {:else if activeService === 'unpack'}
        <UnpackView />
      {:else if activeService === 'repack'}
        <RepackView mode={activeMode} />
      {:else if activeService === 'upscale'}
        <UpscaleView engine={activeEngine} preset={activePreset} />
      {:else if activeService === 'settings'}
        <SettingsView />
      {/if}
    </div>
  {/key}
</div>