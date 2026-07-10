<script lang="ts">
  let { icon = '📂', title = 'Nothing here', description = '', actionLabel, onaction }: {
    icon?: string
    title?: string
    description?: string
    actionLabel?: string
    onaction?: () => void
  } = $props()
</script>

<div class="empty-state">
  <div class="empty-icon">{icon}</div>
  <div class="empty-title">{title}</div>
  {#if description}
    <div class="empty-desc">{description}</div>
  {/if}
  {#if actionLabel && onaction}
    <button class="btn btn-primary" onclick={onaction} style="margin-top: 12px; font-size: 13px;">
      {actionLabel}
    </button>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
  }
  .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.6; }
  .empty-title { font-size: 16px; font-weight: 700; color: var(--text-muted); }
  .empty-desc { font-size: 13px; color: var(--text-muted); margin-top: 4px; max-width: 300px; line-height: 1.4; }
</style>
