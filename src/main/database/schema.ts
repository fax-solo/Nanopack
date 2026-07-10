import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
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

function hashPassword(password: string): string {
  const crypto = require('crypto')
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const check = require('crypto').createHash('sha256').update(salt + password).digest('hex')
  return check === hash
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

  const adminExists = database.prepare('SELECT id FROM users WHERE username = ?').get('admin')
  if (!adminExists) {
    const pw = hashPassword('admin')
    database.prepare(`
      INSERT INTO users (username, password_hash, display_name, is_admin, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run('admin', pw, 'Solo Admin')
  }
}

export function hashPw(password: string): string {
  return hashPassword(password)
}
