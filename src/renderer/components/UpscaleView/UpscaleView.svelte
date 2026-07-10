<script lang="ts">
  import CompactionReadout from '../CompactionReadout.svelte'

  let { mode, userId, engine, preset }: { mode: 'quick' | 'deep'; userId?: number; engine?: string; preset?: string } = $props()

  let inputPath = $state('')
  let outputPath = $state('')
  let selectedEngine = $state(engine || 'realesrgan')
  let selectedPreset = $state(preset || '720p-1080p')
  let working = $state(false)
  let gpu: { name: string; vramGB: number; vulkanSupported: boolean; vendor: string } | null = $state(null)
  let noGpuWarning = $state(false)
  let result: { success: boolean; path?: string; message?: string } | null = $state(null)
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])
  let progress = $state({ stage: '', percent: 0, processed: 0, total: 0 })

  const presets = [
    { id: '480p-1080p', label: '480p → 1080p', desc: 'SD to HD, good uplift' },
    { id: '720p-1080p', label: '720p → 1080p', desc: 'Standard HD upscale, best quality' },
    { id: '720p-4K', label: '720p → 4K', desc: 'Large jump, moderate quality' },
    { id: '1080p-4K', label: '1080p → 4K', desc: 'HD to UHD, best for high quality source' },
  ]

  const engines = [
    { id: 'realesrgan', name: 'Real-ESRGAN', desc: 'Best for live-action and photorealistic footage (default)', icon: '🎬' },
    { id: 'anime4k', name: 'Anime4K', desc: 'Fastest option, ideal for 2D animation and casual upscaling', icon: '⚡' },
  ]

  const aggressivePresets = ['480p-4K', '480p-1080p']  // presets with large pixel jumps

  let isAggressive = $derived(aggressivePresets.includes(selectedPreset))

  async function selectVideo() {
    const p = await window.nanopack.openFileDialog()
    if (p) {
      inputPath = p
      outputPath = ''
      result = null
    }
  }

  async function selectOutput() {
    const p = await window.nanopack.saveNpkDialog()
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
    const outPath = outputPath || inputPath.replace(/\.[^.]+$/, '') + '_upscaled.mp4'
    working = true
    result = null
    logs = []

    const unsub = window.nanopack.onProgress((data) => {
      progress = data
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })

    const r = await window.nanopack.upscale(inputPath, outPath, selectedEngine, selectedPreset, userId)
    unsub()
    result = r
    working = false
  }

  function reset() {
    inputPath = ''
    outputPath = ''
    result = null
    logs = []
  }
</script>

<div class="card">
  <div class="card-title">Upscale</div>
  <div class="card-desc">
    AI-powered video upscaling. Select a video, an upscaling engine, and a resolution target.
  </div>

  <div class="flex-col gap-12">
    <div class="path-input" onclick={selectVideo}>
      <span class="path-text">{inputPath || 'Choose a video file...'}</span>
      <span class="mono" style="color: var(--accent); font-size: 11px;">Browse</span>
    </div>

    {#if inputPath && !working}
      <div>
        <button class="btn btn-secondary" onclick={detectGpu}>
          {gpu ? 'Re-detect GPU' : 'Detect GPU'}
        </button>
        {#if gpu}
          <span class="mono" style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">
            {gpu.name} · {gpu.vramGB} GB
          </span>
        {/if}
      </div>
    {/if}
  </div>

  {#if noGpuWarning}
    <div class="warning-banner" style="margin-top: 12px;">
      <span class="icon">⚠</span>
      <div>
        No compatible GPU detected with 4GB+ VRAM and Vulkan support. CPU upscaling will be very slow (1–2 fps). A 90-minute video could take most of a day.
      </div>
    </div>
  {/if}

  {#if inputPath}
    <div style="margin-top: 20px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 12px;">
        Upscaling Engine
      </div>
      <div class="flex-col gap-8">
        {#each engines as engine}
          <div
            class="engine-card"
            class:selected={selectedEngine === engine.id}
            onclick={() => selectedEngine = engine.id}
          >
            <div class="name">{engine.icon} {engine.name}</div>
            <div class="desc">{engine.desc}</div>
          </div>
        {/each}
      </div>
    </div>

    <div style="margin-top: 20px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 12px;">
        Resolution Preset
      </div>
      <div class="flex-col gap-8">
        {#each presets as preset}
          <label class="flex-row" style="cursor: pointer; padding: 8px 12px; background: var(--surface); border-radius: var(--radius-md); border: 1px solid {selectedPreset === preset.id ? 'var(--accent)' : 'var(--border)'};">
            <input type="radio" name="preset" value={preset.id} bind:group={selectedPreset} style="accent-color: var(--accent);" />
            <div>
              <div style="font-size: 13px; font-weight: 500; color: var(--text);">{preset.label}</div>
              <div class="text-muted" style="font-size: 12px;">{preset.desc}</div>
            </div>
          </label>
        {/each}
      </div>
    </div>

    {#if isAggressive}
      <div class="warning-banner" style="margin-top: 12px;">
        <span class="icon">⚠</span>
        <div>
          This is an aggressive upscale jump. Quality may be noticeably degraded. Consider a smaller step for better results.
        </div>
      </div>
    {/if}

    {#if !result && !working}
      <div class="flex-row gap-12" style="margin-top: 20px;">
        <button
          class="btn {noGpuWarning ? 'btn-warning' : 'btn-primary'}"
          onclick={runUpscale}
          disabled={working || !inputPath}
        >
          {noGpuWarning ? 'Upscale anyway (very slow)' : 'Start Upscale'}
        </button>
        <button class="btn btn-secondary" onclick={reset}>Cancel</button>
      </div>
    {/if}
  {/if}

  {#if working}
    <div style="margin-top: 16px;">
      <div class="progress-status">
        <span class="stage mono">{progress.stage}</span>
        <span class="mono">{Math.round(progress.percent)}%</span>
      </div>
      <div class="progress-bar" style="margin-top: 8px;">
        <div class="fill" style="width: {progress.percent}%"></div>
      </div>
    </div>
  {/if}

  {#if logs.length > 0}
    <div class="progress-log" style="margin-top: 12px;">
      {#each logs as log}
        <div class="entry {log.type}">{log.text}</div>
      {/each}
    </div>
  {/if}

  {#if result}
    <div style="margin-top: 16px; padding: 12px; border-radius: var(--radius-md); background: var(--bg); border: 1px solid {result.success ? 'var(--accent)' : 'var(--danger)'};">
      {#if result.success}
        <div style="color: var(--accent); font-weight: 600;">Upscale complete</div>
        <div class="mono" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          {result.path}
        </div>
      {:else}
        <div style="color: var(--danger); font-weight: 600;">Upscale failed</div>
        <div class="mono" style="font-size: 12px; color: var(--text-muted);">{result.message}</div>
      {/if}
    </div>
  {/if}
</div>
