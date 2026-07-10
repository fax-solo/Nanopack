<script lang="ts">
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
    if (p) {
      npkPath = p
      outputDir = p.replace(/\.npk$/, '')
      result = null
      verifyResult = null
    }
  }

  async function selectOutputDir() {
    const p = await window.nanopack.openFolderDialog()
    if (p) outputDir = p
  }

  async function runUnpack() {
    if (!npkPath || !outputDir) return
    working = true
    result = null
    logs = []
    const unsub = window.nanopack.onProgress((data) => {
      logs = [...logs, { text: data.stage + (data.currentFile ? ` — ${data.currentFile}` : ''), type: 'info' }]
    })
    const r = await window.nanopack.unpack(npkPath, outputDir, userId)
    unsub()
    result = r
    working = false
  }

  async function runMount() {
    if (!npkPath) return
    working = true
    mountPath = ''
    try {
      const p = await window.nanopack.mount(npkPath)
      mountPath = p
      logs = [...logs, { text: `Mounted at ${p}`, type: 'done' }]
    } catch (e) {
      logs = [...logs, { text: `Mount failed: ${e}`, type: 'error' }]
    }
    working = false
  }

  async function runVerify() {
    if (!npkPath) return
    working = true
    verifyResult = null
    const r = await window.nanopack.verify(npkPath)
    verifyResult = r
    working = false
  }

  function reset() {
    npkPath = ''
    outputDir = ''
    selectingAction = false
    result = null
    verifyResult = null
    mountPath = ''
    logs = []
  }
</script>

<div class="card">
  <div class="card-title">Unpack</div>
  <div class="card-desc">
    Open a NanoPack archive to extract, mount, or verify its contents.
  </div>

  <div class="flex-col gap-12">
    <div class="path-input" onclick={selectNpk}>
      <span class="path-text">{npkPath || 'Choose a .npk archive...'}</span>
      <span class="mono" style="color: var(--accent); font-size: 11px;">Browse</span>
    </div>

    {#if npkPath && !selectingAction}
      <div class="flex-row" style="gap: 16px;">
        <button class="btn btn-primary" onclick={() => selectingAction = true}>
          Continue
        </button>
        <button class="btn btn-secondary" onclick={reset}>Cancel</button>
      </div>
    {/if}
  </div>

  {#if selectingAction}
    <div style="margin-top: 20px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 12px;">
        Choose an action
      </div>

      <div class="flex-col gap-12">
        <div class="card" style="cursor: pointer; background: var(--bg);" onclick={runUnpack}>
          <div style="font-weight: 600; color: var(--text);">Full Unpack</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
            Extract all files to a folder, bit-identical to the originals.
          </div>
        </div>

        <div class="card" style="cursor: pointer; background: var(--bg);" onclick={runMount}>
          <div style="font-weight: 600; color: var(--text);">Instant Mount</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
            Browse and open files directly from the archive without extracting.
          </div>
        </div>

        <div class="card" style="cursor: pointer; background: var(--bg);" onclick={runVerify}>
          <div style="font-weight: 600; color: var(--text);">Verify</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
            Recompute hashes of restored files and confirm against the archive manifest.
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if working}
    <div style="margin-top: 16px;">
      <div class="progress-bar">
        <div class="fill" style="width: 80%; animation: pulse 1.5s infinite;"></div>
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
        <div style="color: var(--accent); font-weight: 600;">Unpack complete</div>
        <div class="mono" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          {result.filesProcessed} files extracted to {result.path}
        </div>
      {:else}
        <div style="color: var(--danger); font-weight: 600;">Unpack failed</div>
        {#if result.errors}
          {#each result.errors as err}
            <div class="mono" style="font-size: 12px; color: var(--danger); margin-top: 2px;">{err}</div>
          {/each}
        {/if}
      {/if}
    </div>
  {/if}

  {#if verifyResult}
    <div style="margin-top: 16px; padding: 12px; border-radius: var(--radius-md); background: var(--bg); border: 1px solid {verifyResult.success ? 'var(--accent)' : 'var(--danger)'};">
      {#if verifyResult.success}
        <div style="color: var(--accent); font-weight: 600;">Verification passed</div>
        <div class="mono" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          All file hashes match the manifest.
        </div>
      {:else}
        <div style="color: var(--danger); font-weight: 600;">Verification failed</div>
        <div class="mono" style="font-size: 12px; color: var(--danger); margin-top: 4px;">
          {verifyResult.message}
        </div>
      {/if}
    </div>
  {/if}

  {#if mountPath}
    <div style="margin-top: 16px; padding: 12px; border-radius: var(--radius-md); background: var(--bg); border: 1px solid var(--accent);">
      <div style="color: var(--accent); font-weight: 600;">Mounted</div>
      <div class="mono" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        {mountPath}
      </div>
    </div>
  {/if}
</div>
