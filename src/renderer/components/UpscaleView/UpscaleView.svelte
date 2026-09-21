<script lang="ts">
  import ProgressPanel from '../ProgressPanel.svelte'
  import ResultCard from '../ResultCard.svelte'

  let { engine, preset }: { engine?: string; preset?: string } = $props()

  let inputPath = $state('')
  let outputPath = $state('')
  let selectedEngine = $state('realesrgan')
  let selectedPreset = $state('720p-1080p')
  let working = $state(false)
  let gpu: { name: string; vramGB: number; vulkanSupported: boolean; vendor: string } | null = $state(null)
  let noGpuWarning = $state(false)
  let result: { success: boolean; path?: string; message?: string } | null = $state(null)
  let downloadingModel = $state(false)
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])
  let progress = $state({ stage: '', percent: 0, processed: 0, total: 0, currentFile: '' })

  const presets = [
    { id: '480p-1080p', label: '480p → 1080p', desc: 'SD to HD, good uplift' },
    { id: '720p-1080p', label: '720p → 1080p', desc: 'Standard HD upscale, best quality' },
    { id: '720p-4K', label: '720p → 4K', desc: 'Large jump, moderate quality' },
    { id: '1080p-4K', label: '1080p → 4K', desc: 'HD to UHD, best for high quality source' },
  ]
  const engines = [
    { id: 'realesrgan', name: 'Real-ESRGAN', desc: 'Best for live-action and photorealistic footage', icon: '🎬' },
    { id: 'anime4k', name: 'Anime4K', desc: 'Fastest option, ideal for 2D animation and casual upscaling', icon: '⚡' },
  ]
  const aggressivePresets = ['480p-1080p']
  let isAggressive = $derived(aggressivePresets.includes(selectedPreset))

  $effect(() => {
    if (engine) selectedEngine = engine
    if (preset) selectedPreset = preset
  })

  $effect(() => {
    if (!gpu && !noGpuWarning) detectGpu()
  })

  async function selectVideo() {
    const p = await window.nanopack.openFileDialog()
    if (p) { inputPath = p; outputPath = ''; result = null }
  }
  async function selectOutput() {
    const p = await window.nanopack.saveVideoDialog()
    if (p) outputPath = p
  }
  async function detectGpu() {
    const info = await window.nanopack.detectGpu()
    gpu = info
    noGpuWarning = !info || !info.vulkanSupported || info.vramGB < 4
  }
  async function runUpscale() {
    if (!inputPath) return
    if (noGpuWarning) return

    if (selectedEngine === 'realesrgan') {
      const { needed } = await window.nanopack.ensureModel()
      if (needed) {
        downloadingModel = true
        logs = [...logs, { text: 'Downloading Real-ESRGAN model...', type: 'info' }]
        await new Promise<void>((resolve) => {
          const unsub = window.nanopack.onDownloadProgress((task) => {
            if (task.id === 'realesrgan-model') {
              progress = { stage: `Downloading model (${task.progress}%)`, percent: task.progress, processed: 0, total: 0, currentFile: '' }
              if (task.status === 'completed' || task.status === 'error') {
                unsub()
                downloadingModel = false
                resolve()
              }
            }
          })
        })
      }
    }

    const outPath = outputPath || inputPath.replace(/\.[^.]+$/, '') + '_upscaled.mp4'
    working = true; result = null; logs = []
    const unsub = window.nanopack.onProgress((data) => {
      progress = data
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })
    const r = await window.nanopack.upscale(inputPath, outPath, selectedEngine, selectedPreset)
    unsub()
    result = r; working = false
  }
  function reset() { inputPath = ''; outputPath = ''; result = null; logs = [] }
</script>

<div class="svc-view">
  <div class="svc-title">Upscale</div>
  <div class="svc-desc">
    AI-powered video upscaling. Select a video, an upscaling engine, and a resolution target.
  </div>

  <div class="input-stack">
    <button type="button" class="path-row" onclick={selectVideo}>
      <span class="path-row-icon">🎬</span>
      <span class="path-row-text">{inputPath || 'Choose a video file...'}</span>
      <span class="path-row-btn">Browse</span>
    </button>
    {#if inputPath}
      <button type="button" class="path-row" onclick={selectOutput}>
        <span class="path-row-icon">💾</span>
        <span class="path-row-text">{outputPath || inputPath.replace(/\.[^.]+$/, '') + '_upscaled.mp4'}</span>
        <span class="path-row-btn">Save As</span>
      </button>
    {/if}
  </div>

  {#if !working}
    <div class="gpu-strip">
      {#if gpu}
        <span class="gpu-ok">🖥️ {gpu.name} · {gpu.vramGB} GB VRAM · Vulkan ready</span>
      {:else if gpu === null && !noGpuWarning}
        <span class="gpu-load">Detecting GPU…</span>
      {:else}
        <span class="gpu-warn">No GPU detected</span>
      {/if}
      <button class="btn btn-secondary" onclick={detectGpu} style="font-size: 11px; padding: 4px 12px;">Re-detect</button>
    </div>
  {/if}

  {#if noGpuWarning}
    <div class="warn-banner">
      <span>⚠</span>
      <span>No compatible GPU found (4GB+ VRAM with Vulkan). Upscaling requires a Vulkan-capable GPU — enable it in your GPU drivers or install a Vulkan driver package (e.g. <span class="mono">vulkan-tools</span>/<span class="mono">mesa-vulkan-drivers</span> on Linux).</span>
    </div>
  {/if}

  {#if inputPath}
    <div class="section">
      <div class="section-title">Engine</div>
      <div class="radio-stack">
        {#each engines as e}
          <label class="radio-row" class:checked={selectedEngine === e.id}>
            <input type="radio" name="engine" bind:group={selectedEngine} value={e.id} />
            <span class="radio-name">{e.icon} {e.name}</span>
            <span class="radio-desc">{e.desc}</span>
          </label>
        {/each}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Resolution</div>
      <div class="radio-stack">
        {#each presets as p}
          <label class="radio-row" class:checked={selectedPreset === p.id}>
            <input type="radio" name="preset" bind:group={selectedPreset} value={p.id} />
            <span class="radio-name">{p.label}</span>
            <span class="radio-desc">{p.desc}</span>
          </label>
        {/each}
      </div>
    </div>

    {#if isAggressive}
      <div class="warn-banner">
        <span>⚠</span>
        <span>This is an aggressive jump. Quality may be degraded. Consider a smaller step.</span>
      </div>
    {/if}

    {#if !result && !working}
      <div class="action-bar">
        <button class="btn btn-primary" onclick={runUpscale} disabled={working || downloadingModel || !inputPath || noGpuWarning}>
          {working ? 'Upscaling…' : downloadingModel ? 'Downloading model…' : '🚀 Start Upscale'}
        </button>
        <button class="btn btn-secondary" onclick={reset}>Cancel</button>
      </div>
    {/if}
  {/if}

  {#if working}
    <ProgressPanel {...progress} />
  {/if}

  {#if logs.length > 0}
    <div class="log-box">
      {#each logs as log}
        <div class="log-line {log.type}">{log.text}</div>
      {/each}
    </div>
  {/if}

  {#if result}
    <ResultCard
      success={result.success}
        title={result.success ? 'Upscale complete' : 'Upscale failed'}
        message={result.success ? undefined : result.message}
        path={result.path}
    />
  {/if}
</div>

<style>
  .svc-view { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; max-width: 800px; }
  .svc-title { font-size: 20px; font-weight: 700; color: var(--text); font-family: var(--font-mono); }
  .svc-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
  .input-stack { display: flex; flex-direction: column; gap: 8px; }
  .path-row { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-fast); font-family: var(--font-sans); text-align: left; color: inherit; width: 100%; }
  .path-row:hover { border-color: var(--accent); }
  .path-row-icon { font-size: 16px; flex-shrink: 0; }
  .path-row-text { flex: 1; font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path-row-btn { font-size: 11px; font-weight: 600; color: var(--accent); flex-shrink: 0; }
  .action-bar { display: flex; gap: 10px; align-items: center; }
  .gpu-strip { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
  .gpu-ok { font-size: 12px; font-family: var(--font-mono); color: var(--accent); flex: 1; }
  .gpu-warn { font-size: 12px; font-family: var(--font-mono); color: var(--danger); flex: 1; }
  .gpu-load { font-size: 12px; font-family: var(--font-mono); color: var(--text-muted); flex: 1; }
  .warn-banner { display: flex; gap: 10px; padding: 12px 14px; background: rgba(232, 163, 61, 0.08); border: 1px solid rgba(232, 163, 61, 0.2); border-radius: var(--radius-md); font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .section { display: flex; flex-direction: column; gap: 8px; }
  .section-title { font-size: 13px; font-weight: 600; color: var(--text); }
  .radio-stack { display: flex; flex-direction: column; gap: 6px; }
  .radio-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-fast); }
  .radio-row:hover { border-color: var(--accent); }
  .radio-row.checked { border-color: var(--accent); background: rgba(99,182,130,0.04); }
  .radio-row input { accent-color: var(--accent); flex-shrink: 0; }
  .radio-name { font-size: 13px; font-weight: 600; color: var(--text); min-width: 140px; }
  .radio-desc { font-size: 12px; color: var(--text-muted); }
  .log-box { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; background: var(--bg); border-radius: var(--radius-md); padding: 10px 14px; border: 1px solid var(--border); }
  .log-line { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); padding: 2px 0; }
  .log-line.done { color: var(--accent); }
  .log-line.error { color: var(--danger); }
</style>
