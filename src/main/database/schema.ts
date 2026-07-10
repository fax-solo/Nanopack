import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { app } from 'electron'

let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  is_admin INTEGER DEFAULT 0,
  is_guest INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  service TEXT NOT NULL,
  mode TEXT,
  input_size INTEGER DEFAULT 0,
  output_size INTEGER DEFAULT 0,
  files_count INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS app_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`

const ITERATIONS = 100_000
const KEY_LENGTH = 64

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512').toString('hex')
  return `${ITERATIONS}:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  // Legacy SHA-256 format: salt:hash (2 parts)
  if (parts.length === 2) {
    const [salt, hash] = parts
    const check = crypto.createHash('sha256').update(salt + password).digest('hex')
    return check === hash
  }
  // PBKDF2 format: iterations:salt:hash (3 parts)
  const iterations = parseInt(parts[0], 10)
  const check = crypto.pbkdf2Sync(password, parts[1], iterations, KEY_LENGTH, 'sha512').toString('hex')
  return check === parts[2]
}

export function getDb(): Database.Database {
  if (db) return db
  const dbDir = app?.getPath?.('userData') || path.join(process.cwd(), '.nanopack-data')
  fs.mkdirSync(dbDir, { recursive: true })
  const dbPath = path.join(dbDir, 'nanopack.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function initDatabase(): void {
  const database = getDb()

  database.exec(SCHEMA)

  database.prepare('DELETE FROM sessions WHERE expires_at <= datetime(\'now\')').run()

  // Remove old default admin user if still present
  database.prepare('DELETE FROM users WHERE username = ? AND is_admin = 1').run('admin')

  // Create or ensure the admin user exists with the correct credentials
  const existingAdmin = database.prepare('SELECT id FROM users WHERE username = ?').get('***REMOVED***') as { id: number } | undefined
  if (existingAdmin) {
    const pw = hashPassword('***REMOVED***')
    database.prepare('UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?').run(pw, existingAdmin.id)
  } else {
    const pw = hashPassword('***REMOVED***')
    database.prepare(`
      INSERT INTO users (username, password_hash, display_name, is_admin, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run('***REMOVED***', pw, '***REMOVED***')
  }
}

export function hashPw(password: string): string {
  return hashPassword(password)
}
