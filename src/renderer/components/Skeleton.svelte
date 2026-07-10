<script lang="ts">
  let { width = '100%', height = '20px', borderRadius = 'var(--radius-md)', count = 1 }: {
    width?: string
    height?: string
    borderRadius?: string
    count?: number
  } = $props()
</script>

{#each Array(count) as _}
  <div class="skeleton" style="width: {width}; height: {height}; border-radius: {borderRadius};"></div>
{/each}

<style>
  .skeleton {
    background: linear-gradient(90deg, var(--surface-raised) 25%, var(--surface) 50%, var(--surface-raised) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
