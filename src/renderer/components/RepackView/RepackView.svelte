<script lang="ts">
  import ProgressPanel from '../ProgressPanel.svelte'
  import ResultCard from '../ResultCard.svelte'

  let { mode, userId }: { mode: 'quick' | 'deep'; userId?: number } = $props()

  let npkPath = $state('')
  let sourcePath = $state('')
  let outputPath = $state('')
  let working = $state(false)
  let result: { success: boolean; path?: string; originalSize?: number; finalSize?: number; filesProcessed?: number; message?: string } | null = $state(null)
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])
  let progress = $state({ stage: '', percent: 0, processed: 0, total: 0, currentFile: '' })

  async function selectNpk() {
    const p = await window.nanopack.openNpkDialog()
    if (p) npkPath = p
  }
  async function selectSource() {
    const p = await window.nanopack.openFolderDialog()
    if (p) sourcePath = p
  }
  async function selectOutput() {
    const p = await window.nanopack.saveNpkDialog()
    if (p) outputPath = p
  }
  async function runRepack() {
    if (!npkPath || !sourcePath) return
    const outPath = outputPath || npkPath
    working = true; result = null; logs = []
    const unsub = window.nanopack.onProgress((data) => {
      progress = data
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })
    const r = await window.nanopack.repack(npkPath, sourcePath, outPath, mode, userId)
    unsub()
    result = r; working = false
  }
  function reset() { npkPath = ''; sourcePath = ''; outputPath = ''; result = null; logs = [] }
</script>

<div class="svc-view">
  <div class="svc-title">Repack</div>
  <div class="svc-desc">
    Update an existing archive with changed files. Only differences are stored — fast incremental updates.
  </div>

  <div class="input-stack">
    <div class="path-row" onclick={selectNpk}>
      <span class="path-row-icon">📦</span>
      <span class="path-row-text">{npkPath || 'Choose existing .npk...'}</span>
      <span class="path-row-btn">Browse</span>
    </div>
    <div class="path-row" onclick={selectSource}>
      <span class="path-row-icon">📁</span>
      <span class="path-row-text">{sourcePath || 'Choose updated source folder...'}</span>
      <span class="path-row-btn">Browse</span>
    </div>
    {#if npkPath && sourcePath}
      <div class="path-row" onclick={selectOutput}>
        <span class="path-row-icon">💾</span>
        <span class="path-row-text">{outputPath || npkPath}</span>
        <span class="path-row-btn">Save As</span>
      </div>
    {/if}
  </div>

  {#if npkPath && sourcePath && !result}
    <div class="action-bar">
      <button class="btn btn-primary" onclick={runRepack} disabled={working}>
        {working ? 'Repacking...' : '🔄 Repack'}
      </button>
      <button class="btn btn-secondary" onclick={reset}>Cancel</button>
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

  {#if result}
    <ResultCard
      success={result.success}
      title={result.success ? 'Repack complete' : 'Repack failed'}
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
  .path-row { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-fast); }
  .path-row:hover { border-color: var(--accent); }
  .path-row-icon { font-size: 16px; flex-shrink: 0; }
  .path-row-text { flex: 1; font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path-row-btn { font-size: 11px; font-weight: 600; color: var(--accent); flex-shrink: 0; }
  .action-bar { display: flex; gap: 10px; }
  .log-box { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; background: var(--bg); border-radius: var(--radius-md); padding: 10px 14px; border: 1px solid var(--border); }
  .log-line { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); padding: 2px 0; }
  .log-line.done { color: var(--accent); }
  .log-line.error { color: var(--danger); }
</style>
