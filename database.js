import Database from 'better-sqlite3';
import crypto from 'crypto';

let db;
const statements = {};

export function initDb(dbPath = './database.db') {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 创建用户表
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      credits INTEGER DEFAULT 100,
      free_attempts INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 创建分析记录表
  db.prepare(`
    CREATE TABLE IF NOT EXISTS analysis_records (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      session_id TEXT,
      resume_filename TEXT NOT NULL,
      resume_text TEXT NOT NULL,
      job_description_json TEXT,
      analysis_result_json TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();

  // 预编译语句缓存
  statements.registerUser = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
  statements.getUserByEmail = db.prepare('SELECT id, email, password, credits FROM users WHERE email = ?');
  statements.getUserCredits = db.prepare('SELECT credits FROM users WHERE id = ?');
  statements.deductCredits = db.prepare('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?');
  statements.createRecord = db.prepare(`
    INSERT INTO analysis_records (id, user_id, session_id, resume_filename, resume_text, job_description_json, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  statements.updateRecord = db.prepare('UPDATE analysis_records SET status = ?, analysis_result_json = ? WHERE id = ?');
  statements.getRecord = db.prepare('SELECT * FROM analysis_records WHERE id = ?');
  statements.getHistory = db.prepare('SELECT id, resume_filename, status, created_at FROM analysis_records WHERE user_id = ? ORDER BY created_at DESC');
}

export function registerUser(email, password) {
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    const dbPasswordValue = `${salt}:${hash}`;
    const info = statements.registerUser.run(email, dbPasswordValue);
    return { userId: info.lastInsertRowid, credits: 100 };
  } catch (err) {
    return null;
  }
}

export function loginUser(email, password) {
  try {
    const user = statements.getUserByEmail.get(email);
    if (!user) return null;

    const parts = user.password.split(':');
    if (parts.length !== 2) return null;
    const [salt, hash] = parts;
    const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    if (checkHash === hash) {
      return { userId: user.id, email: user.email, credits: user.credits };
    }
    return null;
  } catch (err) {
    return null;
  }
}

export function getUserCredits(userId) {
  try {
    const user = statements.getUserCredits.get(userId);
    return user ? user.credits : 0;
  } catch (err) {
    return 0;
  }
}

export function deductCredits(userId, amount) {
  try {
    const info = statements.deductCredits.run(amount, userId, amount);
    return info.changes > 0;
  } catch (err) {
    return false;
  }
}

export function createRecord(id, userId, sessionId, filename, text, jdsJson) {
  try {
    statements.createRecord.run(id, userId, sessionId, filename, text, jdsJson);
    return true;
  } catch (err) {
    return false;
  }
}

export function updateRecord(id, status, resultJson) {
  try {
    statements.updateRecord.run(status, resultJson, id);
    return true;
  } catch (err) {
    return false;
  }
}

export function getRecord(id) {
  try {
    return statements.getRecord.get(id);
  } catch (err) {
    return null;
  }
}

export function getHistory(userId) {
  try {
    return statements.getHistory.all(userId);
  } catch (err) {
    return [];
  }
}

export function closeDb() {
  try {
    if (db) {
      db.close();
      db = null;
    }
    for (const key in statements) {
      delete statements[key];
    }
  } catch (err) {
    // ignore
  }
}
