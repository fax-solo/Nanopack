<script lang="ts">
  import CompactionReadout from '../CompactionReadout.svelte'

  let { mode, userId }: { mode: 'quick' | 'deep'; userId?: number } = $props()

  let npkPath = $state('')
  let sourcePath = $state('')
  let outputPath = $state('')
  let working = $state(false)
  let result: { success: boolean; path?: string; originalSize?: number; finalSize?: number; filesProcessed?: number; message?: string } | null = $state(null)
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])
  let progress = $state({ stage: '', percent: 0, processed: 0, total: 0 })

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
    working = true
    result = null
    logs = []
    const unsub = window.nanopack.onProgress((data) => {
      progress = data
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })
    const r = await window.nanopack.repack(npkPath, sourcePath, outPath, mode, userId)
    unsub()
    result = r
    working = false
  }

  function reset() {
    npkPath = ''
    sourcePath = ''
    outputPath = ''
    result = null
    logs = []
  }
</script>

<div class="card">
  <div class="card-title">Repack</div>
  <div class="card-desc">
    Update an existing archive with changed files. Only differences are stored — fast incremental updates.
  </div>

  <div class="flex-col gap-12">
    <div class="path-input" onclick={selectNpk}>
      <span class="path-text">{npkPath || 'Choose existing .npk...'}</span>
      <span class="mono" style="color: var(--accent); font-size: 11px;">Browse</span>
    </div>

    <div class="path-input" onclick={selectSource}>
      <span class="path-text">{sourcePath || 'Choose updated source folder...'}</span>
      <span class="mono" style="color: var(--accent); font-size: 11px;">Browse</span>
    </div>

    {#if npkPath && sourcePath && !result}
      <div class="flex-row gap-12">
        <button class="btn btn-primary" onclick={runRepack} disabled={working}>
          {working ? 'Repacking...' : 'Repack'}
        </button>
        <button class="btn btn-secondary" onclick={reset}>Cancel</button>
      </div>
    {/if}
  </div>

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
        <div class="flex-row" style="justify-content: space-between;">
          <div>
            <div style="color: var(--accent); font-weight: 600;">Repack complete</div>
            <div class="mono" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
              {result.filesProcessed} files processed
            </div>
          </div>
          <CompactionReadout originalSize={result.originalSize} finalSize={result.finalSize} showNumbers={false} />
        </div>
      {:else}
        <div style="color: var(--danger); font-weight: 600;">Repack failed</div>
        <div class="mono" style="font-size: 12px; color: var(--text-muted);">{result.message}</div>
      {/if}
    </div>
  {/if}
</div>
