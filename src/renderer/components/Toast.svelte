<script lang="ts">
  import { getToasts, dismissToast } from '../lib/toast.svelte'

  let toasts = $derived(getToasts())
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" role="alert">
        <span class="toast-icon">
          {#if toast.type === 'success'}✓
          {:else if toast.type === 'error'}✕
          {:else}ℹ{/if}
        </span>
        <span class="toast-msg">{toast.message}</span>
        <button class="toast-close" onclick={() => dismissToast(toast.id)} aria-label="Dismiss">✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: var(--radius-lg);
    font-size: 13px;
    font-weight: 500;
    color: #fff;
    pointer-events: auto;
    animation: toast-in 0.25s ease-out;
    max-width: 380px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }
  .toast-success { background: #1a8a5c; }
  .toast-error { background: #c94d3a; }
  .toast-info { background: #2a6e9a; }
  .toast-icon { font-weight: 700; font-size: 15px; flex-shrink: 0; }
  .toast-msg { flex: 1; line-height: 1.4; }
  .toast-close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
  }
  .toast-close:hover { color: #fff; }
  @keyframes toast-in {
    from { opacity: 0; transform: translateX(40px); }
    to { opacity: 1; transform: translateX(0); }
  }
</style>
