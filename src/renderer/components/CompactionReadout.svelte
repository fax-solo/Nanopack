<script lang="ts">
  import { tick } from 'svelte'

  let { originalSize = 0, finalSize = 0, inverted = false, label = '', showNumbers = true }: {
    originalSize?: number
    finalSize?: number
    inverted?: boolean
    label?: string
    showNumbers?: boolean
  } = $props()

  let currentWidth = $state(0)

  function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  let savings = $derived(originalSize > 0 ? ((1 - finalSize / originalSize) * 100) : 0)
  let fillPercent = $derived(originalSize > 0 ? Math.min((finalSize / originalSize) * 100, 100) : 0)

  $effect(() => {
    currentWidth = fillPercent
  })
</script>

<div class="compaction-bar">
  {#if showNumbers}
    <span class="before mono">{formatBytes(originalSize)}</span>
  {/if}
  <div class="track">
    <div
      class="fill"
      class:inverted
      style="width: {currentWidth}%"
    ></div>
  </div>
  {#if showNumbers}
    <span class="after mono">{formatBytes(finalSize)}</span>
    <span class="savings mono" class:inverted>
      {savings >= 0 ? '-' : '+'}{Math.abs(savings).toFixed(1)}%
    </span>
  {/if}
</div>

{#if label}
  <div style="font-size: 12px; color: var(--text-muted); text-align: center; margin-top: -8px;">
    {label}
  </div>
{/if}
