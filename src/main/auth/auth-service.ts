import { getDb, verifyPassword, hashPw } from '../database/schema'
import crypto from 'crypto'

export interface User {
  id: number
  username: string
  display_name: string
  is_admin: number
  is_guest: number
  created_at: string
  last_login: string | null
}

export interface AuthResult {
  success: boolean
  user?: User
  token?: string
  error?: string
}

// ── Rate limiter ─────────────────────────────────────────────────────
const LOGIN_BLOCK_WINDOW = 60_000
const LOGIN_MAX_ATTEMPTS = 5
const attemptCache = new Map<string, { count: number; blockedUntil: number }>()

function checkRateLimit(key: string): string | null {
  const now = Date.now()
  const entry = attemptCache.get(key)
  if (entry && entry.blockedUntil > now) {
    const remaining = Math.ceil((entry.blockedUntil - now) / 1000)
    return `Too many attempts. Try again in ${remaining}s.`
  }
  if (entry && entry.blockedUntil <= now) attemptCache.delete(key)
  return null
}

function recordAttempt(key: string): void {
  const now = Date.now()
  const entry = attemptCache.get(key)
  if (entry) {
    entry.count++
    if (entry.count >= LOGIN_MAX_ATTEMPTS) entry.blockedUntil = now + LOGIN_BLOCK_WINDOW
  } else {
    attemptCache.set(key, { count: 1, blockedUntil: 0 })
  }
}

function resetAttempts(key: string): void {
  attemptCache.delete(key)
}

// ── Sanitize ─────────────────────────────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_ -]+$/

function sanitizeUsername(username: string): string | null {
  const trimmed = username.trim().toLowerCase()
  if (trimmed.length < 3) return null
  if (!USERNAME_RE.test(trimmed)) return null
  return trimmed
}

// ── Session helpers ──────────────────────────────────────────────────
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function createSession(userId: number): string {
  const db = getDb()
  const token = generateToken()
  db.prepare(`
    INSERT INTO sessions (user_id, token, created_at, expires_at)
    VALUES (?, ?, datetime('now'), datetime('now', '+7 days'))
  `).run(userId, token)
  return token
}

function dbGet<T>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined
}

function dbAll<T>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...params) as T[]
}

// ── Auth functions ───────────────────────────────────────────────────
export function registerUser(username: string, password: string, displayName?: string): AuthResult {
  const sanitized = sanitizeUsername(username)
  if (!sanitized) {
    return { success: false, error: 'Username must be 3+ characters: letters, numbers, underscores, hyphens.' }
  }
  if (password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters.' }
  }

  const rateErr = checkRateLimit(`register:${sanitized}`)
  if (rateErr) return { success: false, error: rateErr }

  const db = getDb()

  const existing = dbGet<{ id: number }>('SELECT id FROM users WHERE username = ?', sanitized)
  if (existing) {
    return { success: false, error: 'Username already exists' }
  }

  const pwHash = hashPw(password)
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(sanitized, pwHash, displayName?.trim() || sanitized)

  const user = dbGet<User>('SELECT * FROM users WHERE id = ?', result.lastInsertRowid)
  if (!user) return { success: false, error: 'Failed to create user' }

  const token = createSession(user.id)
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id)
  db.prepare(`INSERT INTO app_events (user_id, event_type) VALUES (?, 'register')`).run(user.id)

  return { success: true, user, token }
}

export function loginUser(username: string, password: string): AuthResult {
  const sanitized = sanitizeUsername(username)
  if (!sanitized) {
    return { success: false, error: 'Invalid username or password' }
  }

  const rateErr = checkRateLimit(`login:${sanitized}`)
  if (rateErr) return { success: false, error: rateErr }

  const db = getDb()
  const user = dbGet<User>('SELECT * FROM users WHERE username = ? AND is_guest = 0', sanitized)

  if (!user) {
    recordAttempt(`login:${sanitized}`)
    return { success: false, error: 'Invalid username or password' }
  }

  const storedHash = dbGet<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id)
  if (!storedHash || !verifyPassword(password, storedHash.password_hash)) {
    recordAttempt(`login:${sanitized}`)
    return { success: false, error: 'Invalid username or password' }
  }

  resetAttempts(`login:${sanitized}`)
  const token = createSession(user.id)
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id)
  db.prepare(`INSERT INTO app_events (user_id, event_type) VALUES (?, 'login')`).run(user.id)

  return { success: true, user, token }
}

export function createGuestUser(): AuthResult {
  const db = getDb()

  const row = dbGet<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE is_guest = 1')
  const guestCount = row?.c ?? 0
  const guestName = `Guest_${guestCount + 1}_${Math.random().toString(36).slice(2, 6)}`

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, is_guest, created_at)
    VALUES (?, '', ?, 1, datetime('now'))
  `).run(guestName, guestName)

  const user = dbGet<User>('SELECT * FROM users WHERE id = ?', result.lastInsertRowid)
  if (!user) return { success: false, error: 'Failed to create guest' }

  const token = createSession(user.id)
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id)
  db.prepare(`INSERT INTO app_events (user_id, event_type) VALUES (?, 'guest_login')`).run(user.id)

  return { success: true, user, token }
}

export function validateSession(token: string): User | null {
  const user = dbGet<User>(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `, token)
  return user || null
}

export function logoutSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function getAllUsers(): User[] {
  return dbAll<User>('SELECT * FROM users ORDER BY created_at DESC')
}

export function getUserById(id: number): User | null {
  return dbGet<User>('SELECT * FROM users WHERE id = ?', id) ?? null
}
