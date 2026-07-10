<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { fly } from 'svelte/transition'

  type ContentType = 'video' | 'files' | 'pictures'
  type Service = 'pack' | 'unpack' | 'repack' | 'upscale'

  interface Model {
    id: string
    name: string
    description: string
    timeEstimate: string
    savingsPercent: string
    savingsInfo: string
  }

  const dispatch = createEventDispatcher()

  let step: 'content' | 'service' | 'model' = $state('content')
  let contentType: ContentType | null = $state(null)
  let selectedService: Service | null = $state(null)

  const contentTypes: { id: ContentType; label: string; icon: string; bg: string; services: Service[] }[] = [
    { id: 'video', label: 'Video', icon: '🎬', bg: 'linear-gradient(135deg, #1a2a3a, #0f1a24)', services: ['pack', 'upscale', 'unpack', 'repack'] },
    { id: 'files', label: 'Files', icon: '📁', bg: 'linear-gradient(135deg, #1a2a1a, #0f1a0f)', services: ['pack', 'unpack', 'repack'] },
    { id: 'pictures', label: 'Pictures', icon: '🖼️', bg: 'linear-gradient(135deg, #2a1a2a, #1a0f1a)', services: ['pack', 'upscale', 'unpack', 'repack'] },
  ]

  const serviceInfo: Record<Service, { label: string; icon: string; desc: string }> = {
    pack: { label: 'Pack', icon: '📦', desc: 'Compress into an archive' },
    unpack: { label: 'Unpack', icon: '📂', desc: 'Extract an existing archive' },
    repack: { label: 'Repack', icon: '🔄', desc: 'Update an archive with new data' },
    upscale: { label: 'Upscale', icon: '🔍', desc: 'AI upscale to higher resolution' },
  }

  const packModels: Model[] = [
    { id: 'quick', name: 'Quick (Zstd)', description: 'Fast compression using Zstandard. Good balance of speed and compression ratio. Ideal for everyday use and frequently accessed archives.', timeEstimate: 'Seconds to minutes', savingsPercent: '20-35%', savingsInfo: '~2.5 GB saved per 10 GB' },
    { id: 'deep', name: 'Deep (Maximum)', description: 'Maximum compression using deflate + bsdiff + lepton pipeline. Designed for archival and long-term storage where every byte counts.', timeEstimate: 'Minutes to hours', savingsPercent: '35-55%', savingsInfo: '~4.5 GB saved per 10 GB' },
  ]

  const upscaleModels: Model[] = [
    { id: 'realesrgan-720p', name: 'Real-ESRGAN 720p → 1080p', description: 'AI model optimized for upscaling 720p sources. Produces sharp 1080p output with enhanced detail and reduced artifacts.', timeEstimate: 'Slow (1-5 min/min)', savingsPercent: '—', savingsInfo: '~2.25x output' },
    { id: 'realesrgan-1080p', name: 'Real-ESRGAN 1080p → 4K', description: 'High-quality AI upscaling from 1080p to 4K. Best for large displays and professional use. Requires a powerful GPU.', timeEstimate: 'Very slow (5-20 min/min)', savingsPercent: '—', savingsInfo: '~4x output' },
    { id: 'waifu2x', name: 'Waifu2x (Anime)', description: 'Purpose-built for anime and digital illustration. Includes noise reduction and 2x upscaling with minimal quality loss.', timeEstimate: 'Moderate', savingsPercent: '—', savingsInfo: '~2x output' },
  ]

  const unpackModel: Model = {
    id: 'standard', name: 'Standard Extract', description: 'Extract all files from the archive to a folder of your choice. Preserves directory structure and file metadata.',
    timeEstimate: 'Seconds to minutes', savingsPercent: '—', savingsInfo: 'Original content size',
  }

  function getModels(svc: Service): Model[] {
    if (svc === 'pack' || svc === 'repack') return packModels
    if (svc === 'upscale') return upscaleModels
    return [unpackModel]
  }

  function selectContent(id: ContentType) { contentType = id; step = 'service' }
  function selectService(svc: Service) { selectedService = svc; step = 'model' }
  function selectModel(model: Model) {
    dispatch('navigate', {
      service: selectedService,
      mode: model.id === 'deep' ? 'deep' : 'quick',
      preset: model.id.startsWith('realesrgan') || model.id === 'waifu2x' ? model.id : undefined,
      engine: model.id === 'waifu2x' ? 'waifu2x' : model.id.startsWith('realesrgan') ? 'realesrgan' : undefined,
    })
  }

  function back() {
    if (step === 'model') { step = 'service'; selectedService = null }
    else if (step === 'service') { step = 'content'; contentType = null }
  }
</script>

<div class="ss-page">
  <!-- Header -->
  <div class="ss-header">
    <div style="display: flex; align-items: center; gap: 12px;">
      {#if step !== 'content'}
        <button class="back-btn" onclick={back}>←</button>
      {/if}
      <div>
        <div class="ss-title">
          {#if step === 'content'}What are you working with?
          {:else if step === 'service'}{contentTypes.find(c => c.id === contentType)?.icon} {contentTypes.find(c => c.id === contentType)?.label}
          {:else}{serviceInfo[selectedService!]?.icon} {serviceInfo[selectedService!]?.label}{/if}
        </div>
        <div class="ss-sub">
          {#if step === 'content'}Select the type of content you want to process
          {:else if step === 'service'}Choose an operation
          {:else}Select a compression or processing model{/if}
        </div>
      </div>
    </div>
    {#if step !== 'content'}
      <div class="ss-steps">
        <span class="ss-step" class:done={step !== 'content'}>Content</span>
        <span class="ss-arrow">→</span>
        <span class="ss-step" class:done={step === 'model'}>Operation</span>
        <span class="ss-arrow">→</span>
        <span class="ss-step" class:active={step === 'model'}>Model</span>
      </div>
    {/if}
  </div>

  <!-- Step 1 -->
  {#if step === 'content'}
    <div class="ct-grid">
      {#each contentTypes as ct, i}
        <button class="ct-card" style="background: {ct.bg};" onclick={() => selectContent(ct.id)} transition:fly={{ y: 30, duration: 350, delay: i * 80 }}>
          <div class="ct-icon">{ct.icon}</div>
          <div class="ct-name">{ct.label}</div>
          <div class="ct-services">{ct.services.map(s => serviceInfo[s].label).join(' · ')}</div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Step 2 -->
  {#if step === 'service' && contentType}
    <div class="svc-grid">
      {#each contentTypes.find(c => c.id === contentType)!.services as svc, i}
        <button class="svc-card" onclick={() => selectService(svc)} transition:fly={{ y: 20, duration: 300, delay: i * 60 }}>
          <div class="svc-icon">{serviceInfo[svc].icon}</div>
          <div class="svc-name">{serviceInfo[svc].label}</div>
          <div class="svc-desc">{serviceInfo[svc].desc}</div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Step 3 -->
  {#if step === 'model' && selectedService}
    <div class="model-list">
      {#each getModels(selectedService) as model, i}
        <button class="model-card" onclick={() => selectModel(model)} transition:fly={{ y: 20, duration: 300, delay: i * 80 }}>
          <div class="model-top">
            <div class="model-name">{model.name}</div>
            <div class="model-badge">{model.savingsInfo}</div>
          </div>
          <div class="model-desc">{model.description}</div>
          <div class="model-meta">
            <span>⏱ {model.timeEstimate}</span>
            {#if model.savingsPercent !== '—'}<span>💾 ~{model.savingsPercent}</span>{/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ss-page { padding: 24px 32px; max-width: 960px; margin: 0 auto; }
  .ss-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
    gap: 16px;
  }
  .ss-title { font-size: 22px; font-weight: 700; color: var(--text); font-family: var(--font-mono); }
  .ss-sub { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .ss-steps { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-shrink: 0; margin-top: 4px; }
  .ss-step { color: var(--text-muted); font-weight: 500; }
  .ss-step.done { color: var(--accent); }
  .ss-step.active { color: var(--text); font-weight: 700; }
  .ss-arrow { color: var(--border); font-size: 14px; }
  .back-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    cursor: pointer;
    font-size: 16px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }
  .back-btn:hover { border-color: var(--accent); }

  .ct-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .ct-card {
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 36px 24px;
    cursor: pointer;
    text-align: center;
    transition: all var(--transition-fast);
    font-family: var(--font-sans);
    color: inherit;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .ct-card:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
  .ct-icon { font-size: 52px; }
  .ct-name { font-size: 20px; font-weight: 700; color: var(--text); }
  .ct-services { font-size: 12px; color: var(--text-muted); opacity: 0.7; }

  .svc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .svc-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px 20px;
    cursor: pointer;
    text-align: center;
    transition: all var(--transition-fast);
    font-family: var(--font-sans);
    color: inherit;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .svc-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(99,182,130,0.12); }
  .svc-icon { font-size: 40px; }
  .svc-name { font-size: 17px; font-weight: 700; color: var(--text); }
  .svc-desc { font-size: 12px; color: var(--text-muted); line-height: 1.3; }

  .model-list { display: flex; flex-direction: column; gap: 12px; }
  .model-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px 24px;
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
    font-family: var(--font-sans);
    color: inherit;
    width: 100%;
  }
  .model-card:hover { border-color: var(--accent); box-shadow: 0 2px 12px rgba(99,182,130,0.12); }
  .model-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .model-name { font-size: 16px; font-weight: 700; color: var(--text); }
  .model-badge {
    font-size: 13px;
    font-weight: 700;
    font-family: var(--font-mono);
    color: #3ecf7a;
    background: rgba(62,207,122,0.1);
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .model-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
  .model-meta { display: flex; gap: 24px; margin-top: 12px; font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
</style>
