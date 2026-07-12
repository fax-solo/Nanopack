<script lang="ts">
  interface DownloadTask {
    id: string
    name: string
    url: string
    dest: string
    progress: number
    status: 'downloading' | 'completed' | 'cancelled' | 'error'
    error?: string
  }

  let downloads: DownloadTask[] = $state([])

  function loadDownloads() {
    window.nanopack.getDownloads().then((list) => { downloads = list })
  }

  function cancel(id: string) {
    window.nanopack.cancelDownload(id)
  }

  let cleanup: (() => void) | null = null

  $effect(() => {
    loadDownloads()
    cleanup = window.nanopack.onDownloadProgress((task) => {
      downloads = downloads.map(d => d.id === task.id ? task : d)
      if (!downloads.find(d => d.id === task.id)) {
        downloads = [...downloads, task]
      }
      if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'error') {
        setTimeout(() => {
          downloads = downloads.filter(d => d.id !== task.id)
        }, 4000)
      }
    })
    return () => { cleanup?.() }
  })
</script>

{#if downloads.length > 0}
  <div class="download-bar">
    {#each downloads as dl (dl.id)}
      <div class="dl-item" class:dim={dl.status !== 'downloading'}>
        <div class="dl-info">
          <span class="dl-name">{dl.name}</span>
          {#if dl.status === 'error'}
            <span class="dl-status error">{dl.error || 'Download failed'}</span>
          {:else if dl.status === 'cancelled'}
            <span class="dl-status cancelled">Cancelled</span>
          {:else if dl.status === 'completed'}
            <span class="dl-status done">Complete</span>
          {:else}
            <span class="dl-status">{dl.progress}%</span>
          {/if}
        </div>
        <div class="dl-track">
          <div
            class="dl-fill"
            class:error={dl.status === 'error'}
            class:done={dl.status === 'completed'}
            style="width: {dl.progress}%"
          ></div>
        </div>
        {#if dl.status === 'downloading'}
          <button class="dl-cancel" onclick={() => cancel(dl.id)} title="Cancel download">✕</button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .download-bar {
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 16px;
  }
  .dl-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    transition: opacity var(--transition-fast);
  }
  .dl-item.dim {
    opacity: 0.5;
  }
  .dl-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .dl-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dl-status {
    font-size: 10px;
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .dl-status.error { color: var(--danger); }
  .dl-status.cancelled { color: var(--text-muted); }
  .dl-status.done { color: var(--accent); }
  .dl-track {
    flex: 1;
    max-width: 200px;
    height: 6px;
    background: var(--bg);
    border-radius: 3px;
    overflow: hidden;
  }
  .dl-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 300ms ease;
  }
  .dl-fill.error { background: var(--danger); }
  .dl-fill.done { background: var(--accent-dim); }
  .dl-cancel {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    line-height: 1;
    flex-shrink: 0;
  }
  .dl-cancel:hover {
    color: var(--danger);
    background: rgba(217,99,74,0.1);
  }
</style>
