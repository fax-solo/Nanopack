<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  type ContentType = 'video' | 'files' | 'pictures'
  type Service = 'pack' | 'unpack' | 'repack' | 'upscale'
  type Mode = 'quick' | 'deep'

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
  let selectedModel: Model | null = $state(null)

  const contentTypes: { id: ContentType; label: string; icon: string; desc: string; services: Service[] }[] = [
    { id: 'video', label: 'Video', icon: '🎬', desc: 'Compress, upscale, or archive video files', services: ['pack', 'upscale', 'unpack', 'repack'] },
    { id: 'files', label: 'Files', icon: '📁', desc: 'Archive folders and files with maximum savings', services: ['pack', 'unpack', 'repack'] },
    { id: 'pictures', label: 'Pictures', icon: '🖼️', desc: 'Compress or AI-upscale image collections', services: ['pack', 'upscale', 'unpack', 'repack'] },
  ]

  const serviceInfo: Record<Service, { label: string; icon: string; desc: string }> = {
    pack: { label: 'Pack', icon: '📦', desc: 'Compress into an archive' },
    unpack: { label: 'Unpack', icon: '📂', desc: 'Extract an existing archive' },
    repack: { label: 'Repack', icon: '🔄', desc: 'Update an archive with new data' },
    upscale: { label: 'Upscale', icon: '🔍', desc: 'AI upscale to higher resolution' },
  }

  const packModels: Model[] = [
    {
      id: 'quick',
      name: 'Quick (Zstd)',
      description: 'Fast compression using Zstandard. Good balance of speed and compression ratio. Ideal for everyday use and frequently accessed archives.',
      timeEstimate: 'Seconds to minutes',
      savingsPercent: '20-35%',
      savingsInfo: '~2.5 GB saved per 10 GB',
    },
    {
      id: 'deep',
      name: 'Deep (Maximum)',
      description: 'Maximum compression using deflate + bsdiff + lepton pipeline. Designed for archival and long-term storage where every byte counts.',
      timeEstimate: 'Minutes to hours',
      savingsPercent: '35-55%',
      savingsInfo: '~4.5 GB saved per 10 GB',
    },
  ]

  const upscaleModels: Model[] = [
    {
      id: 'realesrgan-720p',
      name: 'Real-ESRGAN 720p → 1080p',
      description: 'AI model optimized for upscaling 720p sources. Produces sharp 1080p output with enhanced detail and reduced artifacts.',
      timeEstimate: 'Slow (1-5 min per min of video)',
      savingsPercent: '—',
      savingsInfo: '~2.25x output size',
    },
    {
      id: 'realesrgan-1080p',
      name: 'Real-ESRGAN 1080p → 4K',
      description: 'High-quality AI upscaling from 1080p to 4K. Best for large displays and professional use. Requires a powerful GPU.',
      timeEstimate: 'Very slow (5-20 min per min of video)',
      savingsPercent: '—',
      savingsInfo: '~4x output size',
    },
    {
      id: 'waifu2x',
      name: 'Waifu2x (Anime)',
      description: 'Purpose-built for anime and digital illustration. Includes noise reduction and 2x upscaling with minimal quality loss.',
      timeEstimate: 'Moderate',
      savingsPercent: '—',
      savingsInfo: '~2x output size',
    },
  ]

  const unpackModel: Model = {
    id: 'standard',
    name: 'Standard Extract',
    description: 'Extract all files from the archive to a folder of your choice. Preserves directory structure and file metadata.',
    timeEstimate: 'Seconds to minutes',
    savingsPercent: '—',
    savingsInfo: 'Output size matches original content',
  }

  function getModels(service: Service): Model[] {
    if (service === 'pack' || service === 'repack') return packModels
    if (service === 'upscale') return upscaleModels
    return [unpackModel]
  }

  function selectContent(id: ContentType) {
    contentType = id
    selectedService = null
    selectedModel = null
    step = 'service'
  }

  function selectService(svc: Service) {
    selectedService = svc
    selectedModel = null
    step = 'model'
  }

  function selectModel(model: Model) {
    selectedModel = model
    // Navigate to execution view
    dispatch('navigate', {
      service: selectedService,
      mode: model.id === 'deep' ? 'deep' : 'quick',
      preset: model.id.startsWith('realesrgan') || model.id === 'waifu2x' ? model.id : undefined,
      engine: model.id === 'waifu2x' ? 'waifu2x' : model.id.startsWith('realesrgan') ? 'realesrgan' : undefined,
    })
  }

  function back() {
    if (step === 'model') { step = 'service'; selectedModel = null }
    else if (step === 'service') { step = 'content'; selectedService = null; contentType = null }
  }
</script>

<div class="flex-col gap-24" style="padding: 24px 32px; max-width: 960px; margin: 0 auto;">
  <!-- Header -->
  <div style="display: flex; align-items: center; gap: 12px;">
    {#if step !== 'content'}
      <button class="btn btn-ghost" onclick={back} style="padding: 6px 10px; font-size: 18px;">←</button>
    {/if}
    <div>
      <div style="font-size: 20px; font-weight: 700; color: var(--text); font-family: var(--font-mono);">
        {#if step === 'content'}What are you working with?
        {:else if step === 'service'}{contentTypes.find(c => c.id === contentType)?.icon} {contentTypes.find(c => c.id === contentType)?.label}
        {:else}{serviceInfo[selectedService!]?.icon} {serviceInfo[selectedService!]?.label} — Choose a Model{/if}
      </div>
      <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">
        {#if step === 'content'}Select the type of content you want to compress or process
        {:else if step === 'service'}{contentTypes.find(c => c.id === contentType)?.desc}
        {:else}Select a compression or processing model{/if}
      </div>
    </div>
  </div>

  <!-- Step 1: Content Type -->
  {#if step === 'content'}
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
      {#each contentTypes as ct}
        <button class="content-card" onclick={() => selectContent(ct.id)}>
          <div style="font-size: 48px; margin-bottom: 12px;">{ct.icon}</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--text);">{ct.label}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">{ct.desc}</div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Step 2: Service Selection -->
  {#if step === 'service' && contentType}
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      {#each contentTypes.find(c => c.id === contentType)!.services as svc}
        <button class="service-card" onclick={() => selectService(svc)}>
          <div style="font-size: 36px; margin-bottom: 8px;">{serviceInfo[svc].icon}</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text);">{serviceInfo[svc].label}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">{serviceInfo[svc].desc}</div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Step 3: Model Selection -->
  {#if step === 'model' && selectedService}
    <div style="display: flex; flex-direction: column; gap: 16px;">
      {#each getModels(selectedService) as model}
        <button
          class="model-card"
          class:selected={selectedModel?.id === model.id}
          onclick={() => selectModel(model)}
        >
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
            <div style="flex: 1;">
              <div style="font-size: 16px; font-weight: 700; color: var(--text);">{model.name}</div>
              <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.5; text-align: left;">
                {model.description}
              </div>
              <div style="display: flex; gap: 24px; margin-top: 12px;">
                <div>
                  <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Estimated Time</div>
                  <div style="font-size: 13px; color: var(--text); font-family: var(--font-mono); margin-top: 2px;">{model.timeEstimate}</div>
                </div>
                {#if model.savingsPercent !== '—'}
                  <div>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Compression</div>
                    <div style="font-size: 13px; color: var(--accent); font-family: var(--font-mono); margin-top: 2px;">~{model.savingsPercent}</div>
                  </div>
                {/if}
              </div>
            </div>
            <div style="text-align: right; flex-shrink: 0;">
              <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">
                {selectedService === 'upscale' ? 'Output' : 'Saved'}
              </div>
              <div class="savings-badge">{model.savingsInfo}</div>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .content-card, .service-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 32px 24px;
    cursor: pointer;
    text-align: center;
    transition: all var(--transition-fast);
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: var(--font-sans);
    color: inherit;
    width: 100%;
  }
  .content-card:hover, .service-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(99, 182, 130, 0.15);
  }
  .model-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px 24px;
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
    font-family: var(--font-sans);
    color: inherit;
    width: 100%;
  }
  .model-card:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 12px rgba(99, 182, 130, 0.12);
  }
  .model-card.selected {
    border-color: var(--accent);
    background: rgba(99, 182, 130, 0.06);
  }
  .savings-badge {
    margin-top: 4px;
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-mono);
    color: #3ecf7a;
    background: rgba(62, 207, 122, 0.1);
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }
  .gap-24 { gap: 24px; }
  .btn-ghost {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    cursor: pointer;
    font-family: var(--font-sans);
    line-height: 1;
  }
  .btn-ghost:hover {
    background: var(--surface);
  }
</style>
