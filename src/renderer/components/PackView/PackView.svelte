<script lang="ts">
  import CompactionReadout from '../CompactionReadout.svelte'
  import ProgressPanel from '../ProgressPanel.svelte'
  import ResultCard from '../ResultCard.svelte'

  let { mode, userId }: { mode: 'quick' | 'deep'; userId?: number } = $props()

  let sourcePath = $state('')
  let outputPath = $state('')
  let estimating = $state(false)
  let packing = $state(false)
  let estimate: { quickSize: number; deepSize: number; quickTime: number; deepTime: number; fileCount: number; totalSize: number } | null = $state(null)
  let result: { success: boolean; path?: string; originalSize?: number; finalSize?: number; filesProcessed?: number; message?: string } | null = $state(null)
  let progress = $state({ stage: '', percent: 0, processed: 0, total: 0, currentFile: '' })
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])

  async function selectFolder() {
    const p = await window.nanopack.openFolderDialog()
    if (p) { sourcePath = p; outputPath = ''; estimate = null; result = null }
  }
  async function selectOutput() {
    const p = await window.nanopack.saveNpkDialog()
    if (p) outputPath = p
  }
  async function runEstimate() {
    if (!sourcePath) return
    estimating = true
    estimate = await window.nanopack.estimate(sourcePath)
    estimating = false
  }
  async function runPack() {
    if (!sourcePath) return
    const outPath = outputPath || sourcePath.replace(/\/?$/, '') + '.npk'
    outputPath = outPath
    packing = true
    result = null; logs = []
    progress = { stage: 'Starting...', percent: 0, processed: 0, total: 0 }
    const unsub = window.nanopack.onProgress((data) => {
      progress = data
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })
    const r = await window.nanopack.pack(sourcePath, outPath, mode, userId)
    unsub()
    result = r
    packing = false
    if (r.success) logs = [...logs, { text: `Done — saved ${r.filesProcessed} files`, type: 'done' }]
  }
  function reset() {
    sourcePath = ''; outputPath = ''; estimate = null; result = null; logs = []
    progress = { stage: '', percent: 0, processed: 0, total: 0 }
  }
</script>

<div class="svc-view">
  <div class="svc-title">Pack Files</div>
  <div class="svc-desc">
    Select a folder to pack into a NanoPack archive. {mode === 'deep' ? 'Deep mode maximizes compression (slower).' : 'Quick mode is fast with modest savings.'}
  </div>

  <div class="input-stack">
    <div class="path-row" onclick={selectFolder}>
      <span class="path-row-icon">📁</span>
      <span class="path-row-text">{sourcePath || 'Choose source folder...'}</span>
      <span class="path-row-btn">Browse</span>
    </div>
    {#if sourcePath}
      <div class="path-row" onclick={selectOutput}>
        <span class="path-row-icon">💾</span>
        <span class="path-row-text">{outputPath || sourcePath.replace(/\/?$/, '') + '.npk'}</span>
        <span class="path-row-btn">Save As</span>
      </div>
    {/if}
  </div>

  {#if sourcePath && !estimate && !result}
    <div class="action-bar">
      <button class="btn btn-secondary" onclick={runEstimate} disabled={estimating}>
        {estimating ? 'Estimating...' : '📊 Estimate size'}
      </button>
    </div>
  {/if}

  {#if estimate}
    <div class="estimate-section">
      <div class="estimate-grid">
        <div class="est-card">
          <div class="est-label">Quick Mode</div>
          <CompactionReadout originalSize={estimate.totalSize} finalSize={estimate.quickSize} />
          <div class="est-time">Est. ~{Math.round(estimate.quickTime)}s</div>
        </div>
        <div class="est-card">
          <div class="est-label">Deep Mode</div>
          <CompactionReadout originalSize={estimate.totalSize} finalSize={estimate.deepSize} />
          <div class="est-time">Est. ~{Math.round(estimate.deepTime)}s</div>
        </div>
      </div>
      <div class="est-meta">{estimate.fileCount} files · {(estimate.totalSize / (1024 * 1024)).toFixed(1)} MB</div>
      <div class="est-caveat">⚠ Estimated — actual results may vary</div>

      <div class="action-bar">
        <button class="btn btn-primary" onclick={runPack} disabled={packing}>
          {packing ? 'Packing...' : mode === 'deep' ? '🚀 Pack Deep' : '🚀 Pack Quick'}
        </button>
        <button class="btn btn-secondary" onclick={reset}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if packing}
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
      title={result.success ? 'Pack complete' : 'Pack failed'}
      subtitle={result.success ? `${result.filesProcessed} files processed` : undefined}
        originalSize={result.originalSize}
        finalSize={result.finalSize}
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
  .path-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .path-row:hover { border-color: var(--accent); }
  .path-row-icon { font-size: 16px; flex-shrink: 0; }
  .path-row-text { flex: 1; font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path-row-btn { font-size: 11px; font-weight: 600; color: var(--accent); flex-shrink: 0; }
  .action-bar { display: flex; gap: 10px; }
  .estimate-section { display: flex; flex-direction: column; gap: 12px; }
  .estimate-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .est-card { background: var(--bg); border-radius: var(--radius-md); padding: 16px; border: 1px solid var(--border); }
  .est-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
  .est-time { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 6px; }
  .est-meta { font-size: 12px; color: var(--text-muted); }
  .est-caveat { font-size: 11px; color: var(--text-muted); opacity: 0.7; text-align: center; margin-top: -4px; }
  .log-box { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; background: var(--bg); border-radius: var(--radius-md); padding: 10px 14px; border: 1px solid var(--border); }
  .log-line { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); padding: 2px 0; }
  .log-line.done { color: var(--accent); }
  .log-line.error { color: var(--danger); }
</style>
