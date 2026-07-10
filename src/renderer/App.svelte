<script lang="ts">
  import AuthView from './components/AuthView/AuthView.svelte'
  import ServiceSelect from './components/ServiceSelect/ServiceSelect.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import PackView from './components/PackView/PackView.svelte'
  import UnpackView from './components/UnpackView/UnpackView.svelte'
  import RepackView from './components/RepackView/RepackView.svelte'
  import UpscaleView from './components/UpscaleView/UpscaleView.svelte'
  import AdminView from './components/AdminView/AdminView.svelte'

  type Service = 'home' | 'pack' | 'unpack' | 'repack' | 'upscale' | 'admin'

  let user: { id: number; username: string; display_name: string; is_admin: number; is_guest: number } | null = $state(null)
  let token: string | null = $state(null)
  let activeService: Service = $state('home')
  let activeMode: 'quick' | 'deep' = $state('quick')
  let activeEngine: string | undefined = $state(undefined)
  let activePreset: string | undefined = $state(undefined)

  async function handleAuth(event: CustomEvent) {
    const result = event.detail
    user = result.user
    token = result.token
    activeService = 'home'
  }

  async function handleLogout() {
    if (token) await window.nanopack.logout(token)
    user = null
    token = null
  }

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

{#if !user}
  <AuthView on:auth={handleAuth} />
{:else}
  <Sidebar
    {activeService}
    mode={activeMode}
    isAdmin={user.is_admin === 1}
    userName={user.display_name || user.username}
    on:serviceChange={(e) => handleServiceChange(e.detail)}
    on:modeChange={(e) => handleModeChange(e.detail)}
    on:logout={handleLogout}
  />

  <div class="workspace">
    {#if activeService === 'home'}
      <ServiceSelect on:navigate={handleNavigate} />
    {:else if activeService === 'pack'}
      <PackView mode={activeMode} userId={user.id} />
    {:else if activeService === 'unpack'}
      <UnpackView userId={user.id} />
    {:else if activeService === 'repack'}
      <RepackView mode={activeMode} userId={user.id} />
    {:else if activeService === 'upscale'}
      <UpscaleView mode={activeMode} engine={activeEngine} preset={activePreset} userId={user.id} />
    {:else if activeService === 'admin'}
      <AdminView />
    {/if}
  </div>
{/if}
