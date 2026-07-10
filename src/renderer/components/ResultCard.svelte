<script lang="ts">
  let {
    success,
    title,
    subtitle,
    originalSize,
    finalSize,
    message,
    path,
  }: {
    success: boolean
    title: string
    subtitle?: string
    originalSize?: number
    finalSize?: number
    message?: string
    path?: string
  } = $props()

  function fmt(n: number | undefined): string {
    if (n === undefined) return '—'
    if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
    return n + ' B'
  }

  let savingsPct = $derived.by(() => {
    if (originalSize === undefined || finalSize === undefined) return null
    if (originalSize === 0) return null
    return Math.round((1 - finalSize / originalSize) * 100)
  })
</script>

<div class="result-card" class:success class:fail={!success}>
  <div class="rc-icon">{success ? '✓' : '✕'}</div>
  <div class="rc-body">
    <div class="rc-title">{title}</div>
    {#if subtitle}
      <div class="rc-subtitle">{subtitle}</div>
    {/if}

    {#if originalSize !== undefined && finalSize !== undefined}
      <div class="rc-compare">
        <div class="rc-bar-group">
          <div class="rc-bar-label">Before</div>
          <div class="rc-bar-track">
            <div class="rc-bar before" style="width: 100%"></div>
          </div>
          <div class="rc-bar-value">{fmt(originalSize)}</div>
        </div>
        <div class="rc-bar-group">
          <div class="rc-bar-label">After</div>
          <div class="rc-bar-track">
            <div class="rc-bar after" style="width: {finalSize && originalSize ? Math.max(5, (finalSize / originalSize) * 100) : 100}%"></div>
          </div>
          <div class="rc-bar-value">{fmt(finalSize)}</div>
        </div>
        {#if savingsPct !== null}
          <div class="rc-savings">
            <span class="rc-savings-pct">-{savingsPct}%</span>
            <span class="rc-savings-label">saved</span>
          </div>
        {/if}
      </div>
    {/if}

    {#if message}
      <div class="rc-message">{message}</div>
    {/if}
    {#if path}
      <div class="rc-path">{path}</div>
    {/if}
  </div>
</div>

<style>
  .result-card {
    display: flex;
    gap: 14px;
    padding: 16px 18px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--surface);
    transition: border-color var(--transition-fast);
  }
  .result-card.success { border-color: var(--accent); }
  .result-card.fail { border-color: var(--danger); }

  .rc-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .success .rc-icon {
    background: rgba(99, 182, 130, 0.12);
    color: var(--accent);
  }
  .fail .rc-icon {
    background: rgba(217, 99, 74, 0.12);
    color: var(--danger);
  }

  .rc-body { flex: 1; min-width: 0; }
  .rc-title { font-size: 15px; font-weight: 700; color: var(--text); }
  .rc-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  .rc-compare { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
  .rc-bar-group { display: flex; align-items: center; gap: 10px; }
  .rc-bar-label { font-size: 11px; color: var(--text-muted); width: 44px; flex-shrink: 0; font-weight: 500; }
  .rc-bar-track { flex: 1; height: 18px; background: var(--bg); border-radius: 4px; overflow: hidden; }
  .rc-bar { height: 100%; border-radius: 4px; transition: width 0.8s ease; }
  .rc-bar.before { background: var(--text-muted); opacity: 0.3; }
  .rc-bar.after { background: var(--accent); }
  .rc-bar-value { font-size: 12px; font-family: var(--font-mono); color: var(--text); width: 72px; text-align: right; flex-shrink: 0; }

  .rc-savings {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 6px 12px;
    background: rgba(62, 207, 122, 0.08);
    border-radius: var(--radius-sm);
    align-self: flex-start;
  }
  .rc-savings-pct { font-size: 16px; font-weight: 800; font-family: var(--font-mono); color: #3ecf7a; }
  .rc-savings-label { font-size: 11px; color: var(--text-muted); }

  .rc-message { font-size: 12px; color: var(--text-muted); margin-top: 8px; line-height: 1.4; }
  .rc-path { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-top: 6px; word-break: break-all; }
</style>
