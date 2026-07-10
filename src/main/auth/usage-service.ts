import { getDb } from '../database/schema'

export interface UsageLog {
  id: number
  user_id: number
  service: string
  mode: string | null
  input_size: number
  output_size: number
  files_count: number
  duration_ms: number
  created_at: string
}

export interface DashboardStats {
  totalUsers: number
  activeUsersToday: number
  activeUsersThisWeek: number
  activeUsersThisMonth: number
  newUsersThisDay: number
  newUsersThisMonth: number
  totalUsesToday: number
  totalUsesThisMonth: number
  totalUsesThisYear: number
  totalUsesAllTime: number
  totalInputSize: number
  totalOutputSize: number
  usesByService: { service: string; count: number }[]
  recentActivity: (UsageLog & { username: string })[]
  usersByDay: { day: string; count: number }[]
  usesByDay: { day: string; count: number }[]
}

function dbGet<T>(sql: string, ...params: unknown[]): T {
  return getDb().prepare(sql).get(...params) as T
}

function dbAll<T>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...params) as T[]
}

export function logUsage(
  userId: number,
  service: string,
  mode: string | null,
  inputSize: number,
  outputSize: number,
  filesCount: number,
  durationMs: number
): void {
  getDb().prepare(`
    INSERT INTO usage_log (user_id, service, mode, input_size, output_size, files_count, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(userId, service, mode, inputSize, outputSize, filesCount, durationMs)
}

export function logEvent(userId: number, eventType: string, metadata?: string): void {
  getDb().prepare(`
    INSERT INTO app_events (user_id, event_type, metadata, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userId, eventType, metadata || null)
}

export function getDashboardStats(): DashboardStats {
  const db = getDb()

  const totalUsers = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE is_guest = 0').c
  const activeUsersToday = dbGet<{ c: number }>('SELECT COUNT(DISTINCT user_id) as c FROM usage_log WHERE created_at >= datetime(\'now\', \'-1 day\')').c
  const activeUsersThisWeek = dbGet<{ c: number }>('SELECT COUNT(DISTINCT user_id) as c FROM usage_log WHERE created_at >= datetime(\'now\', \'-7 days\')').c
  const activeUsersThisMonth = dbGet<{ c: number }>('SELECT COUNT(DISTINCT user_id) as c FROM usage_log WHERE created_at >= datetime(\'now\', \'-30 days\')').c

  const newUsersThisDay = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE created_at >= datetime(\'now\', \'-1 day\') AND is_guest = 0').c
  const newUsersThisMonth = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE created_at >= datetime(\'now\', \'-30 days\') AND is_guest = 0').c

  const totalUsesToday = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM usage_log WHERE created_at >= datetime(\'now\', \'-1 day\')').c
  const totalUsesThisMonth = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM usage_log WHERE created_at >= datetime(\'now\', \'-30 days\')').c
  const totalUsesThisYear = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM usage_log WHERE created_at >= datetime(\'now\', \'-365 days\')').c
  const totalUsesAllTime = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM usage_log').c

  const totalInputSize = dbGet<{ s: number }>('SELECT COALESCE(SUM(input_size), 0) as s FROM usage_log').s
  const totalOutputSize = dbGet<{ s: number }>('SELECT COALESCE(SUM(output_size), 0) as s FROM usage_log').s

  const usesByService = dbAll<{ service: string; count: number }>(
    'SELECT service, COUNT(*) as count FROM usage_log GROUP BY service ORDER BY count DESC'
  )

  const recentActivity = dbAll<UsageLog & { username: string }>(
    `SELECT ul.*, u.username FROM usage_log ul
     JOIN users u ON u.id = ul.user_id
     ORDER BY ul.created_at DESC LIMIT 20`
  )

  const usersByDay = dbAll<{ day: string; count: number }>(
    `SELECT date(created_at) as day, COUNT(*) as count FROM users
     WHERE created_at >= datetime('now', '-30 days') AND is_guest = 0
     GROUP BY day ORDER BY day`
  )

  const usesByDay = dbAll<{ day: string; count: number }>(
    `SELECT date(created_at) as day, COUNT(*) as count FROM usage_log
     WHERE created_at >= datetime('now', '-30 days')
     GROUP BY day ORDER BY day`
  )

  return {
    totalUsers, activeUsersToday, activeUsersThisWeek, activeUsersThisMonth,
    newUsersThisDay, newUsersThisMonth,
    totalUsesToday, totalUsesThisMonth, totalUsesThisYear, totalUsesAllTime,
    totalInputSize, totalOutputSize,
    usesByService, recentActivity, usersByDay, usesByDay,
  }
}

export function getUserStats(userId: number): { totalUses: number; totalInput: number; totalOutput: number; usesByService: { service: string; count: number }[] } {
  const totalUses = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM usage_log WHERE user_id = ?', userId).c
  const totalInput = dbGet<{ s: number }>('SELECT COALESCE(SUM(input_size), 0) as s FROM usage_log WHERE user_id = ?', userId).s
  const totalOutput = dbGet<{ s: number }>('SELECT COALESCE(SUM(output_size), 0) as s FROM usage_log WHERE user_id = ?', userId).s
  const usesByService = dbAll<{ service: string; count: number }>(
    'SELECT service, COUNT(*) as count FROM usage_log WHERE user_id = ? GROUP BY service ORDER BY count DESC',
    userId
  )
  return { totalUses, totalInput, totalOutput, usesByService }
}
