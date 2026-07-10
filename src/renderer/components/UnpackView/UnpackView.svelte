<script lang="ts">
  import ResultCard from '../ResultCard.svelte'

  let { userId }: { userId?: number } = $props()

  let npkPath = $state('')
  let outputDir = $state('')
  let selectingAction = $state(false)
  let working = $state(false)
  let mountPath = $state('')
  let result: { success: boolean; path?: string; filesProcessed?: number; errors?: string[]; message?: string } | null = $state(null)
  let verifyResult: { success: boolean; message?: string } | null = $state(null)
  let logs: { text: string; type: 'info' | 'done' | 'error' }[] = $state([])

  async function selectNpk() {
    const p = await window.nanopack.openNpkDialog()
    if (p) { npkPath = p; outputDir = p.replace(/\.npk$/, ''); result = null; verifyResult = null }
  }
  async function selectOutputDir() {
    const p = await window.nanopack.openFolderDialog()
    if (p) outputDir = p
  }
  async function runUnpack() {
    if (!npkPath || !outputDir) return
    working = true; result = null; logs = []
    const unsub = window.nanopack.onProgress((data) => {
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })
    const r = await window.nanopack.unpack(npkPath, outputDir, userId)
    unsub()
    result = r; working = false
  }
  async function runMount() {
    if (!npkPath) return
    working = true; mountPath = ''
    try {
      const p = await window.nanopack.mount(npkPath)
      mountPath = p
      logs = [...logs, { text: `Mounted at ${p}`, type: 'done' }]
    } catch (e) { logs = [...logs, { text: `Mount failed: ${e}`, type: 'error' }] }
    working = false
  }
  async function runVerify() {
    if (!npkPath) return
    working = true; verifyResult = null
    const r = await window.nanopack.verify(npkPath)
    verifyResult = r; working = false
  }
  function reset() {
    npkPath = ''; outputDir = ''; selectingAction = false; result = null
    verifyResult = null; mountPath = ''; logs = []
  }
</script>

<div class="svc-view">
  <div class="svc-title">Unpack</div>
  <div class="svc-desc">
    Open a NanoPack archive to extract, mount, or verify its contents.
  </div>

  <div class="input-stack">
    <div class="path-row" onclick={selectNpk}>
      <span class="path-row-icon">📦</span>
      <span class="path-row-text">{npkPath || 'Choose a .npk archive...'}</span>
      <span class="path-row-btn">Browse</span>
    </div>
    {#if npkPath && selectingAction}
      <div class="path-row" onclick={selectOutputDir}>
        <span class="path-row-icon">📂</span>
        <span class="path-row-text">{outputDir || 'Choose output folder...'}</span>
        <span class="path-row-btn">Browse</span>
      </div>
    {/if}
  </div>

  {#if npkPath && !selectingAction}
    <div class="action-bar">
      <button class="btn btn-primary" onclick={() => selectingAction = true}>Continue</button>
      <button class="btn btn-secondary" onclick={reset}>Cancel</button>
    </div>
  {/if}

  {#if selectingAction}
    <div class="action-cards">
      <div class="act-card" onclick={runUnpack}>
        <span class="act-icon">📂</span>
        <div>
          <div class="act-name">Full Unpack</div>
          <div class="act-desc">Extract all files to a folder, bit-identical to the originals.</div>
        </div>
      </div>
      <div class="act-card" onclick={runMount}>
        <span class="act-icon">⛰️</span>
        <div>
          <div class="act-name">Instant Mount</div>
          <div class="act-desc">Browse and open files directly from the archive without extracting.</div>
        </div>
      </div>
      <div class="act-card" onclick={runVerify}>
        <span class="act-icon">✓</span>
        <div>
          <div class="act-name">Verify</div>
          <div class="act-desc">Recompute hashes of restored files and confirm against the archive manifest.</div>
        </div>
      </div>
    </div>
  {/if}

  {#if working}
    <div class="working-indicator"><div class="wi-bar"></div></div>
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
      title={result.success ? 'Unpack complete' : 'Unpack failed'}
      subtitle={result.success ? `${result.filesProcessed} files extracted` : undefined}
      message={result.success ? undefined : result.errors?.join(', ')}
      path={result.path}
    />
  {/if}

  {#if verifyResult}
    <ResultCard
      success={verifyResult.success}
      title={verifyResult.success ? 'Verification passed' : 'Verification failed'}
      subtitle={verifyResult.success ? 'All file hashes match the manifest.' : undefined}
      message={verifyResult.success ? undefined : verifyResult.message}
    />
  {/if}

  {#if mountPath}
    <ResultCard
      success={true}
      title="Mounted"
      path={mountPath}
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
  .action-cards { display: flex; flex-direction: column; gap: 8px; }
  .act-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-fast); }
  .act-card:hover { border-color: var(--accent); }
  .act-icon { font-size: 24px; flex-shrink: 0; }
  .act-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .act-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .working-indicator { padding: 4px 0; }
  .wi-bar { height: 4px; background: var(--accent); border-radius: 2px; width: 60%; animation: pulse 1.5s infinite ease-in-out; }
  @keyframes pulse { 0%, 100% { opacity: 0.4; width: 60%; } 50% { opacity: 1; width: 80%; } }
  .log-box { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; background: var(--bg); border-radius: var(--radius-md); padding: 10px 14px; border: 1px solid var(--border); }
  .log-line { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); padding: 2px 0; }
  .log-line.done { color: var(--accent); }
  .log-line.error { color: var(--danger); }
</style>
