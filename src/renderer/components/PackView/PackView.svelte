<script lang="ts">
  import CompactionReadout from '../CompactionReadout.svelte'

  let { mode, userId }: { mode: 'quick' | 'deep'; userId?: number } = $props()

  let sourcePath = $state('')
  let outputPath = $state('')
  let estimating = $state(false)
  let packing = $state(false)
  let estimate: { quickSize: number; deepSize: number; quickTime: number; deepTime: number; fileCount: number; totalSize: number } | null = $state(null)
  let result: { success: boolean; path?: string; originalSize?: number; finalSize?: number; filesProcessed?: number; message?: string } | null = $state(null)
  let progress = $state({ stage: '', percent: 0, processed: 0, total: 0 })
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])

  async function selectFolder() {
    const p = await window.nanopack.openFolderDialog()
    if (p) {
      sourcePath = p
      outputPath = ''
      estimate = null
      result = null
    }
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
    result = null
    logs = []
    progress = { stage: 'Starting...', percent: 0, processed: 0, total: 0 }

    const unsub = window.nanopack.onProgress((data) => {
      progress = { stage: data.stage, percent: data.percent, processed: data.processed, total: data.total }
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })

    const r = await window.nanopack.pack(sourcePath, outPath, mode, userId)
    unsub()
    result = r
    packing = false
    if (r.success) {
      logs = [...logs, { text: `Done — saved ${r.filesProcessed} files`, type: 'done' }]
    }
  }

  function reset() {
    sourcePath = ''
    outputPath = ''
    estimate = null
    result = null
    logs = []
    progress = { stage: '', percent: 0, processed: 0, total: 0 }
  }

  let estimatedSize = $derived(estimate ? (mode === 'quick' ? estimate.quickSize : estimate.deepSize) : 0)
</script>

<div class="card">
  <div class="card-title">Pack Files</div>
  <div class="card-desc">
    Select a folder to pack into a NanoPack archive. {mode === 'deep' ? 'Deep mode will maximize compression (slower).' : 'Quick mode is fast with modest savings.'}
  </div>

  <div class="flex-col gap-12">
    <div class="path-input" onclick={selectFolder}>
      <span class="path-text">{sourcePath || 'Choose a folder...'}</span>
      <span class="mono" style="color: var(--accent); font-size: 11px;">Browse</span>
    </div>

    {#if sourcePath && !estimate}
      <div>
        <button class="btn btn-secondary" onclick={runEstimate} disabled={estimating}>
          {estimating ? 'Estimating...' : 'Estimate size'}
        </button>
      </div>
    {/if}
  </div>

  {#if estimate}
    <div style="margin-top: 16px;">
      <div class="estimate-grid">
        <div class="card" style="background: var(--bg);">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">
            Quick Mode
          </div>
          <CompactionReadout originalSize={estimate.totalSize} finalSize={estimate.quickSize} />
          <div class="mono" style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
            Est. time: ~{Math.round(estimate.quickTime)}s
          </div>
        </div>
        <div class="card" style="background: var(--bg);">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">
            Deep Mode
          </div>
          <CompactionReadout originalSize={estimate.totalSize} finalSize={estimate.deepSize} />
          <div class="mono" style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
            Est. time: ~{Math.round(estimate.deepTime)}s
          </div>
        </div>
      </div>

      <div style="font-size: 12px; color: var(--text-muted); margin: 12px 0;">
        {estimate.fileCount} files · {((estimate.totalSize) / (1024 * 1024)).toFixed(1)} MB total
      </div>

      <div class="flex-row gap-12">
        <button class="btn btn-primary" onclick={runPack} disabled={packing}>
          {packing ? 'Packing...' : mode === 'deep' ? 'Pack Deep' : 'Pack Quick'}
        </button>
        <button class="btn btn-secondary" onclick={reset}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if packing}
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
            <div style="color: var(--accent); font-weight: 600;">Pack complete</div>
            <div class="mono" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
              {result.filesProcessed} files · {result.path}
            </div>
          </div>
          <CompactionReadout originalSize={result.originalSize} finalSize={result.finalSize} showNumbers={false} />
        </div>
      {:else}
        <div style="color: var(--danger); font-weight: 600;">Pack failed</div>
        <div class="mono" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          {result.message || 'Unknown error'}
        </div>
      {/if}
    </div>
  {/if}
</div>
