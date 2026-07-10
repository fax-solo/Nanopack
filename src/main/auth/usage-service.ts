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
  recentActivity: UsageLog[]
  usersByDay: { day: string; count: number }[]
  usesByDay: { day: string; count: number }[]
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
  const db = getDb()
  db.prepare(`
    INSERT INTO usage_log (user_id, service, mode, input_size, output_size, files_count, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(userId, service, mode, inputSize, outputSize, filesCount, durationMs)
}

export function logEvent(userId: number, eventType: string, metadata?: string): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO app_events (user_id, event_type, metadata, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userId, eventType, metadata || null)
}

export function getDashboardStats(): DashboardStats {
  const db = getDb()

  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_guest = 0').get() as { c: number }).c
  const activeUsersToday = (db.prepare(`
    SELECT COUNT(DISTINCT user_id) as c FROM usage_log
    WHERE created_at >= datetime('now', '-1 day')
  `).get() as { c: number }).c
  const activeUsersThisWeek = (db.prepare(`
    SELECT COUNT(DISTINCT user_id) as c FROM usage_log
    WHERE created_at >= datetime('now', '-7 days')
  `).get() as { c: number }).c
  const activeUsersThisMonth = (db.prepare(`
    SELECT COUNT(DISTINCT user_id) as c FROM usage_log
    WHERE created_at >= datetime('now', '-30 days')
  `).get() as { c: number }).c

  const newUsersThisDay = (db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE created_at >= datetime('now', '-1 day') AND is_guest = 0
  `).get() as { c: number }).c
  const newUsersThisMonth = (db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE created_at >= datetime('now', '-30 days') AND is_guest = 0
  `).get() as { c: number }).c

  const totalUsesToday = (db.prepare(`
    SELECT COUNT(*) as c FROM usage_log
    WHERE created_at >= datetime('now', '-1 day')
  `).get() as { c: number }).c
  const totalUsesThisMonth = (db.prepare(`
    SELECT COUNT(*) as c FROM usage_log
    WHERE created_at >= datetime('now', '-30 days')
  `).get() as { c: number }).c
  const totalUsesThisYear = (db.prepare(`
    SELECT COUNT(*) as c FROM usage_log
    WHERE created_at >= datetime('now', '-365 days')
  `).get() as { c: number }).c
  const totalUsesAllTime = (db.prepare('SELECT COUNT(*) as c FROM usage_log').get() as { c: number }).c

  const totalInputSize = (db.prepare('SELECT COALESCE(SUM(input_size), 0) as s FROM usage_log').get() as { s: number }).s
  const totalOutputSize = (db.prepare('SELECT COALESCE(SUM(output_size), 0) as s FROM usage_log').get() as { s: number }).s

  const usesByService = db.prepare(`
    SELECT service, COUNT(*) as count FROM usage_log
    GROUP BY service ORDER BY count DESC
  `).all() as { service: string; count: number }[]

  const recentActivity = db.prepare(`
    SELECT ul.*, u.username FROM usage_log ul
    JOIN users u ON u.id = ul.user_id
    ORDER BY ul.created_at DESC LIMIT 20
  `).all() as (UsageLog & { username: string })[]

  const usersByDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count FROM users
    WHERE created_at >= datetime('now', '-30 days') AND is_guest = 0
    GROUP BY day ORDER BY day
  `).all() as { day: string; count: number }[]

  const usesByDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count FROM usage_log
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY day ORDER BY day
  `).all() as { day: string; count: number }[]

  return {
    totalUsers, activeUsersToday, activeUsersThisWeek, activeUsersThisMonth,
    newUsersThisDay, newUsersThisMonth,
    totalUsesToday, totalUsesThisMonth, totalUsesThisYear, totalUsesAllTime,
    totalInputSize, totalOutputSize,
    usesByService, recentActivity, usersByDay, usesByDay,
  }
}

export function getUserStats(userId: number): { totalUses: number; totalInput: number; totalOutput: number; usesByService: { service: string; count: number }[] } {
  const db = getDb()
  const totalUses = (db.prepare('SELECT COUNT(*) as c FROM usage_log WHERE user_id = ?').get(userId) as { c: number }).c
  const totalInput = (db.prepare('SELECT COALESCE(SUM(input_size), 0) as s FROM usage_log WHERE user_id = ?').get(userId) as { s: number }).s
  const totalOutput = (db.prepare('SELECT COALESCE(SUM(output_size), 0) as s FROM usage_log WHERE user_id = ?').get(userId) as { s: number }).s
  const usesByService = db.prepare(`
    SELECT service, COUNT(*) as count FROM usage_log
    WHERE user_id = ? GROUP BY service ORDER BY count DESC
  `).all(userId) as { service: string; count: number }[]
  return { totalUses, totalInput, totalOutput, usesByService }
}
