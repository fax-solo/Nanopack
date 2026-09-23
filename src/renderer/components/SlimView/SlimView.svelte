<script lang="ts">
  import { onMount } from 'svelte'
  import ProgressPanel from '../ProgressPanel.svelte'
  import ResultCard from '../ResultCard.svelte'
  import type { SlimPresetId, SlimResult, SlimToolchainStatus } from '../../../preload'

  let { mode, preset }: { mode: 'quick' | 'deep'; preset?: string } = $props()

  let sourcePath = $state('')
  let outputPath = $state('')
  let working = $state(false)
  let presetId = $state<SlimPresetId>('balance')
  let toolchain = $state<SlimToolchainStatus | null>(null)
  let result: SlimResult | null = $state(null)
  let progress = $state({ stage: '', percent: 0, processed: 0, total: 0 })
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])

  onMount(async () => {
    if (preset === 'max' || preset === 'speed' || preset === 'balance') presetId = preset
    toolchain = await window.nanopack.slimToolchain()
  })

  async function selectFolder() {
    const p = await window.nanopack.openFolderDialog()
    if (p) { sourcePath = p; result = null; logs = [] }
  }
  async function selectOutput() {
    const p = await window.nanopack.saveNpkDialog()
    if (p) outputPath = p
  }
  async function runSlim() {
    if (!sourcePath) return
    const outPath = outputPath || sourcePath.replace(/\/?$/, '') + '-slim.npk'
    outputPath = outPath
    working = true
    result = null; logs = []
    progress = { stage: 'Starting…', percent: 0, processed: 0, total: 0 }
    const unsub = window.nanopack.onProgress((data) => {
      progress = data
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })
    const r = await window.nanopack.slim(sourcePath, outPath, mode, presetId)
    unsub()
    result = r
    working = false
    if (r.cancelled) logs = [...logs, { text: 'Operation cancelled by user', type: 'done' }]
    else if (r.success) logs = [...logs, { text: 'Slim repack complete', type: 'done' }]
    else if (r.message) logs = [...logs, { text: r.message, type: 'error' }]
  }
  async function cancelSlim() {
    await window.nanopack.cancelOperation()
  }
  function reset() {
    sourcePath = ''; outputPath = ''; result = null; logs = []
    progress = { stage: '', percent: 0, processed: 0, total: 0 }
  }

  const presets: { id: SlimPresetId; name: string; hint: string }[] = [
    { id: 'balance', name: 'Balanced', hint: 'Opus 128k · HEVC CRF 28 — best quality/size mix' },
    { id: 'speed', name: 'Fast', hint: 'Opus 96k · HEVC CRF 30 — quickest, more lossy' },
    { id: 'max', name: 'Max saving', hint: 'Opus 80k · HEVC CRF 32 — smallest, slowest, most lossy' },
  ]
</script>

<div class="svc-view">
  <div class="svc-title">Slim Repack</div>
  <div class="svc-desc">
    FitGirl-style media repack: lossily re-encodes audio → Opus and video → HEVC, then packs into a NanoPack archive. Files are only replaced when the re-encode is meaningfully smaller — originals that don't shrink are kept as-is. Quality is <b>deliberately traded for size</b>.
  </div>

  {#if toolchain && !toolchain.available}
    <div class="toolch-banner warn">
      <b>ffmpeg not found.</b> Run <code>npm run install-vendor</code> to bundle a static build (~150 MB), or install ffmpeg and it will be picked up from PATH.
    </div>
  {:else if toolchain}
    <div class="toolch-banner ok">
      {toolchain.source === 'bundled' ? '🧰 Bundled ffmpeg ready' : '🧰 ffmpeg found on system'}
      {#if toolchain.version}<span class="muted">— {toolchain.version}</span>{/if}
    </div>
  {/if}

  <div class="input-stack">
    <button type="button" class="path-row" onclick={selectFolder}>
      <span class="path-row-icon">🎮</span>
      <span class="path-row-text">{sourcePath || 'Choose game folder...'}</span>
      <span class="path-row-btn">Browse</span>
    </button>
    {#if sourcePath}
      <button type="button" class="path-row" onclick={selectOutput}>
        <span class="path-row-icon">💾</span>
        <span class="path-row-text">{outputPath || sourcePath.replace(/\/?$/, '') + '-slim.npk'}</span>
        <span class="path-row-btn">Save As</span>
      </button>
    {/if}
  </div>

  {#if sourcePath}
    <div class="preset-block">
      <div class="preset-label">Re-encode quality</div>
      <div class="preset-row">
        {#each presets as p}
          <button
            class="preset-card"
            class:active={presetId === p.id}
            onclick={() => { presetId = p.id; result = null }}
          >
            <div class="preset-name">{p.name}</div>
            <div class="preset-hint">{p.hint}</div>
          </button>
        {/each}
      </div>
    </div>

    <div class="action-bar">
      <button class="btn btn-primary" onclick={runSlim} disabled={working || (toolchain !== null && !toolchain.available)}>
        {working ? 'Repacking…' : '🎬 Slim repack'}
      </button>
      <button class="btn btn-secondary" onclick={working ? cancelSlim : reset}>
        {working ? 'Cancel' : 'Reset'}
      </button>
    </div>
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

  {#if result && result.success}
    <div class="slim-summary">
      {#if result.audioReencoded > 0}{result.audioReencoded} audio{#if result.videoReencoded > 0} + {/if}{/if}
      {#if result.videoReencoded > 0}{result.videoReencoded} video{/if}
      {#if result.audioReencoded === 0 && result.videoReencoded === 0}no media re-encoded{/if}
       · media {(result.mediaBefore / (1024 * 1024)).toFixed(1)} MB → {(result.mediaAfter / (1024 * 1024)).toFixed(1)} MB
      {#if result.encodedKeepFailed > 0}<span class="muted"> · {result.encodedKeepFailed} keep-original (encode failed)</span>{/if}
    </div>
    <ResultCard
      success={true}
      title="Slim repack complete"
      subtitle={`${result.filesProcessed} files processed`}
      originalSize={result.originalSize}
      finalSize={result.finalSize}
      message={result.message}
      path={result.path}
    />
  {:else if result}
    <ResultCard
      success={false}
      title={result.cancelled ? 'Slim repack cancelled' : 'Slim repack failed'}
      message={result.cancelled ? undefined : result.message}
      path={result.cancelled ? undefined : result.path}
    />
  {/if}
</div>

<style>
  .svc-view { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; max-width: 800px; }
  .svc-title { font-size: 20px; font-weight: 700; color: var(--text); font-family: var(--font-mono); }
  .svc-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
  .svc-desc b { color: var(--text); }
  .toolch-banner { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid; line-height: 1.5; }
  .toolch-banner.ok { color: var(--accent); border-color: var(--border); background: var(--surface); }
  .toolch-banner.warn { color: var(--danger); border-color: var(--border); background: var(--surface); }
  .toolch-banner code { font-family: var(--font-mono); background: var(--bg); padding: 1px 6px; border-radius: 4px; }
  .muted { color: var(--text-muted); }
  .input-stack { display: flex; flex-direction: column; gap: 8px; }
  .path-row { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-fast); font-family: var(--font-sans); text-align: left; color: inherit; width: 100%; }
  .path-row:hover { border-color: var(--accent); }
  .path-row-icon { font-size: 16px; flex-shrink: 0; }
  .path-row-text { flex: 1; font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path-row-btn { font-size: 11px; font-weight: 600; color: var(--accent); flex-shrink: 0; }
  .preset-block { display: flex; flex-direction: column; gap: 8px; }
  .preset-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .preset-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .preset-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 14px; cursor: pointer; text-align: left; color: inherit; font-family: var(--font-sans); transition: all var(--transition-fast); }
  .preset-card:hover { border-color: var(--accent); }
  .preset-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .preset-name { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
  .preset-hint { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
  .action-bar { display: flex; gap: 10px; }
  .log-box { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; background: var(--bg); border-radius: var(--radius-md); padding: 10px 14px; border: 1px solid var(--border); }
  .log-line { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); padding: 2px 0; }
  .log-line.done { color: var(--accent); }
  .log-line.error { color: var(--danger); }
  .slim-summary { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
</style>