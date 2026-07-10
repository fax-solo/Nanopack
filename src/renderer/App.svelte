<script lang="ts">
  import AuthView from './components/AuthView/AuthView.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import PackView from './components/PackView/PackView.svelte'
  import UnpackView from './components/UnpackView/UnpackView.svelte'
  import RepackView from './components/RepackView/RepackView.svelte'
  import UpscaleView from './components/UpscaleView/UpscaleView.svelte'
  import AdminView from './components/AdminView/AdminView.svelte'

  type Service = 'pack' | 'unpack' | 'repack' | 'upscale' | 'admin'

  let user: { id: number; username: string; display_name: string; is_admin: number; is_guest: number } | null = $state(null)
  let token: string | null = $state(null)
  let activeService: Service = $state('pack')
  let mode: 'quick' | 'deep' = $state('quick')

  async function handleAuth(event: CustomEvent) {
    const result = event.detail
    user = result.user
    token = result.token
    activeService = 'pack'
  }

  async function handleLogout() {
    if (token) await window.nanopack.logout(token)
    user = null
    token = null
  }

  async function handleServiceChange(service: Service) {
    activeService = service
  }

  async function handleModeChange(newMode: 'quick' | 'deep') {
    mode = newMode
    await window.nanopack.setMode(newMode)
  }
</script>

{#if !user}
  <AuthView on:auth={handleAuth} />
{:else}
  <Sidebar
    {activeService}
    {mode}
    isAdmin={user.is_admin === 1}
    userName={user.display_name || user.username}
    on:serviceChange={(e) => handleServiceChange(e.detail)}
    on:modeChange={(e) => handleModeChange(e.detail)}
    on:logout={handleLogout}
  />

  <div class="workspace">
    {#if activeService === 'pack'}
      <PackView {mode} userId={user.id} />
    {:else if activeService === 'unpack'}
      <UnpackView userId={user.id} />
    {:else if activeService === 'repack'}
      <RepackView {mode} userId={user.id} />
    {:else if activeService === 'upscale'}
      <UpscaleView {mode} userId={user.id} />
    {:else if activeService === 'admin'}
      <AdminView />
    {/if}
  </div>
{/if}
