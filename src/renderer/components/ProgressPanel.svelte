<script lang="ts">
  let { stage = '', percent = 0, currentFile = '', total = 0, processed = 0 }: {
    stage?: string
    percent?: number
    currentFile?: string
    total?: number
    processed?: number
  } = $props()

  let startTime = $state(0)
  let elapsed = $state('0s')
  let eta = $state('—')
  let speed = $state('')
  let interval: ReturnType<typeof setInterval> | null = null

  let prevProcessed = 0
  let speedSamples: number[] = []

  $effect(() => {
    if (percent > 0 && percent < 100 && startTime === 0) {
      startTime = Date.now()
      interval = setInterval(() => {
        const secs = (Date.now() - startTime) / 1000
        elapsed = secs < 60 ? `${Math.round(secs)}s` : `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`

        if (percent > 0) {
          const totalSecs = secs / (percent / 100)
          const remainingSecs = totalSecs - secs
          eta = remainingSecs < 60
            ? `${Math.round(remainingSecs)}s`
            : `${Math.floor(remainingSecs / 60)}m ${Math.round(remainingSecs % 60)}s`
        }
      }, 500)
    }
    if (percent >= 100 || percent === 0) {
      if (interval) { clearInterval(interval); interval = null }
      if (percent >= 100) { elapsed = 'Done'; eta = '—' }
      if (percent === 0) { elapsed = '0s'; eta = '—'; startTime = 0 }
    }
    return () => { if (interval) clearInterval(interval) }
  })

  $effect(() => {
    if (processed > 0) {
      const now = Date.now()
      speedSamples.push(processed)
      if (speedSamples.length > 10) speedSamples.shift()
      const diff = speedSamples.length > 1 ? speedSamples[speedSamples.length - 1] - speedSamples[0] : 0
      const timeSpan = speedSamples.length > 1 ? (now - startTime) / 1000 : 1
      if (timeSpan > 0 && diff > 0) {
        const perSec = (diff / timeSpan).toFixed(1)
        speed = `${perSec}/s`
      }
    }
  })
</script>

{#if percent > 0}
  <div class="progress-panel">
    <div class="progress-header">
      <span class="progress-stage">{stage}</span>
      <span class="progress-pct">{Math.round(percent)}%</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" style="width: {percent}%;"></div>
    </div>
    <div class="progress-meta">
      <span>{elapsed}</span>
      {#if currentFile}
        <span class="progress-file" title={currentFile}>{currentFile.split('/').pop() || currentFile}</span>
      {/if}
      {#if percent > 0 && percent < 100}
        <span>ETA {eta}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .progress-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .progress-stage {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    text-transform: capitalize;
  }
  .progress-pct {
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
  }
  .progress-track {
    height: 6px;
    background: var(--bg);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-dim), var(--accent));
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .progress-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .progress-file {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }
</style>
