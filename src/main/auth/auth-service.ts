import { getDb, verifyPassword, hashPw, initDatabase } from '../database/schema'
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

export function registerUser(username: string, password: string, displayName?: string): AuthResult {
  const db = getDb()

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    return { success: false, error: 'Username already exists' }
  }

  if (username.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters' }
  }
  if (password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters' }
  }

  const pwHash = hashPw(password)
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(username, pwHash, displayName || username)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User
  const token = createSession(user.id)

  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id)
  db.prepare(`INSERT INTO app_events (user_id, event_type) VALUES (?, 'register')`).run(user.id)

  return { success: true, user, token }
}

export function loginUser(username: string, password: string): AuthResult {
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_guest = 0').get(username) as User | undefined

  if (!user) {
    return { success: false, error: 'Invalid username or password' }
  }

  const storedHash = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string }
  if (!verifyPassword(password, storedHash.password_hash)) {
    return { success: false, error: 'Invalid username or password' }
  }

  const token = createSession(user.id)
  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id)
  db.prepare(`INSERT INTO app_events (user_id, event_type) VALUES (?, 'login')`).run(user.id)

  return { success: true, user, token }
}

export function createGuestUser(): AuthResult {
  const db = getDb()

  const guestCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_guest = 1').get() as { c: number }
  const guestName = `Guest_${guestCount.c + 1}_${Math.random().toString(36).slice(2, 6)}`

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, is_guest, created_at)
    VALUES (?, '', ?, 1, datetime('now'))
  `).run(guestName, guestName)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User
  const token = createSession(user.id)

  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id)
  db.prepare(`INSERT INTO app_events (user_id, event_type) VALUES (?, 'guest_login')`).run(user.id)

  return { success: true, user, token }
}

export function validateSession(token: string): User | null {
  const db = getDb()
  const session = db.prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as User | undefined
  return session || null
}

export function logoutSession(token: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function getAllUsers(): User[] {
  const db = getDb()
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[]
}

export function getUserById(id: number): User | null {
  const db = getDb()
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | null
}
