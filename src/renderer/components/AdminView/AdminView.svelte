<script lang="ts">
  import Skeleton from '../Skeleton.svelte'
  import EmptyState from '../EmptyState.svelte'

  let stats = $state<{
    totalUsers: number; activeUsersToday: number; activeUsersThisWeek: number; activeUsersThisMonth: number;
    newUsersThisDay: number; newUsersThisMonth: number;
    totalUsesToday: number; totalUsesThisMonth: number; totalUsesThisYear: number; totalUsesAllTime: number;
    totalInputSize: number; totalOutputSize: number;
    usesByService: { service: string; count: number }[];
    recentActivity: { id: number; user_id: number; username: string; service: string; mode: string | null; created_at: string }[];
    usersByDay: { day: string; count: number }[];
    usesByDay: { day: string; count: number }[];
  } | null>(null)

  let users: { id: number; username: string; display_name: string; is_admin: number; is_guest: number; created_at: string; last_login: string | null }[] | null = $state(null)
  let loading = $state(true)

  async function loadStats() {
    loading = true
    stats = await window.nanopack.getDashboardStats()
    users = await window.nanopack.getAllUsers()
    loading = false
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
  }

  function serviceIcon(svc: string): string {
    return { pack: '📦', unpack: '📂', repack: '🔄', upscale: '🔍' }[svc] || '📄'
  }

  $effect(() => { loadStats() })
</script>

<div class="flex-col gap-20">
  <div>
    <div style="font-size: 18px; font-weight: 700; color: var(--text); font-family: var(--font-mono);">Admin Dashboard</div>
    <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">System analytics and user management</div>
  </div>

  {#if loading || !stats}
    <div class="stat-grid">
      {#each Array(4) as _}
        <div class="stat-card"><Skeleton height="60px" /></div>
      {/each}
    </div>
    <div class="stat-grid">
      {#each Array(4) as _}
        <div class="stat-card"><Skeleton height="60px" /></div>
      {/each}
    </div>
    <div class="card"><Skeleton height="120px" /></div>
  {:else}
    <!-- Row 1: User metrics -->
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total Users</div><div class="stat-value">{stats.totalUsers}</div></div>
      <div class="stat-card"><div class="stat-label">Active Today</div><div class="stat-value accent">{stats.activeUsersToday}</div></div>
      <div class="stat-card"><div class="stat-label">Active This Week</div><div class="stat-value">{stats.activeUsersThisWeek}</div></div>
      <div class="stat-card"><div class="stat-label">Active This Month</div><div class="stat-value">{stats.activeUsersThisMonth}</div></div>
    </div>

    <!-- Row 2: New users + Usage -->
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">New Users Today</div><div class="stat-value accent">{stats.newUsersThisDay}</div></div>
      <div class="stat-card"><div class="stat-label">New Users This Month</div><div class="stat-value">{stats.newUsersThisMonth}</div></div>
      <div class="stat-card"><div class="stat-label">Operations Today</div><div class="stat-value accent">{stats.totalUsesToday}</div></div>
      <div class="stat-card"><div class="stat-label">Total Operations</div><div class="stat-value">{stats.totalUsesAllTime}</div></div>
    </div>

    <!-- Row 3: Data size -->
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total Input</div><div class="stat-value mono">{formatBytes(stats.totalInputSize)}</div></div>
      <div class="stat-card"><div class="stat-label">Total Output</div><div class="stat-value mono accent">{formatBytes(stats.totalOutputSize)}</div></div>
      <div class="stat-card"><div class="stat-label">Monthly Operations</div><div class="stat-value">{stats.totalUsesThisMonth}</div></div>
      <div class="stat-card"><div class="stat-label">Yearly Operations</div><div class="stat-value">{stats.totalUsesThisYear}</div></div>
    </div>

    <!-- Row 4: By service -->
    <div class="card"><div class="card-title">Operations by Service</div>
      {#if stats.usesByService.length === 0}
        <EmptyState icon="📊" title="No operations yet" description="Run a pack, unpack, or upscale to see data here." />
      {:else}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 12px;">
          {#each stats.usesByService as svc}
            <div style="padding: 12px; background: var(--bg); border-radius: var(--radius-md); text-align: center;">
              <div style="font-size: 24px;">{serviceIcon(svc.service)}</div>
              <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-top: 4px; text-transform: capitalize;">{svc.service}</div>
              <div class="mono" style="font-size: 18px; color: var(--accent);">{svc.count}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Row 5: Activity chart -->
    <div class="card"><div class="card-title">Usage — Last 30 Days</div>
      {#if stats.usesByDay.length === 0}
        <EmptyState icon="📈" title="No usage data yet" description="Usage will appear here as you use NanoPack." />
      {:else}
        {@const maxCount = Math.max(...stats.usesByDay.map(d => d.count), 1)}
        <div style="display: flex; align-items: flex-end; gap: 3px; height: 80px; padding-top: 12px;">
          {#each stats.usesByDay as day}
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
              <div
                style="width: 100%; background: var(--accent); border-radius: 2px 2px 0 0; height: {Math.max(4, (day.count / maxCount) * 64)}px; opacity: 0.7; transition: height var(--transition-fast);"
                title="{day.day}: {day.count} ops"
              ></div>
            </div>
          {/each}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-top: 4px;">
          <span>{stats.usesByDay[0]?.day?.slice(5) || ''}</span>
          <span>Today</span>
        </div>
      {/if}
    </div>

    <!-- Row 6: Recent activity -->
    <div class="card"><div class="card-title">Recent Activity</div>
      {#if stats.recentActivity.length === 0}
        <EmptyState icon="📋" title="No activity yet" description="Completed operations will appear here." />
      {:else}
        <div style="margin-top: 8px; max-height: 240px; overflow-y: auto;">
          {#each stats.recentActivity as act}
            <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px;">
              <span>{serviceIcon(act.service)}</span>
              <span style="color: var(--text); font-weight: 500;">{act.username}</span>
              <span style="color: var(--text-muted); text-transform: capitalize;">{act.service}</span>
              {#if act.mode}<span class="mono" style="color: var(--text-muted); font-size: 11px;">{act.mode}</span>{/if}
              <span style="margin-left: auto; color: var(--text-muted); font-size: 11px;">{act.created_at?.slice(0, 19)?.replace('T', ' ')}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Row 7: Users -->
    <div class="card"><div class="card-title">All Users</div>
      {#if !users || users.length === 0}
        <EmptyState icon="👤" title="No users" description="Register or create guest accounts to see them here." />
      {:else}
        <div style="margin-top: 8px; max-height: 200px; overflow-y: auto;">
          <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
            <thead>
              <tr style="color: var(--text-muted); text-align: left;">
                <th style="padding: 6px 8px; border-bottom: 1px solid var(--border);">Username</th>
                <th style="padding: 6px 8px; border-bottom: 1px solid var(--border);">Role</th>
                <th style="padding: 6px 8px; border-bottom: 1px solid var(--border);">Created</th>
                <th style="padding: 6px 8px; border-bottom: 1px solid var(--border);">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {#each users as u}
                <tr style="color: var(--text);">
                  <td style="padding: 6px 8px; border-bottom: 1px solid var(--border);">{u.display_name || u.username}</td>
                  <td style="padding: 6px 8px; border-bottom: 1px solid var(--border);">
                    {#if u.is_admin}<span style="color: var(--warning); font-weight: 600;">Admin</span>{:else if u.is_guest}<span style="color: var(--text-muted);">Guest</span>{:else}User{/if}
                  </td>
                  <td class="mono" style="padding: 6px 8px; border-bottom: 1px solid var(--border); color: var(--text-muted);">{u.created_at?.slice(0, 10)}</td>
                  <td class="mono" style="padding: 6px 8px; border-bottom: 1px solid var(--border); color: var(--text-muted);">{u.last_login?.slice(0, 10) || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
  }
  .stat-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--font-mono);
  }
  .stat-value.accent { color: var(--accent); }
  .stat-value.mono { font-size: 20px; }
  .gap-20 { gap: 20px; }
</style>
