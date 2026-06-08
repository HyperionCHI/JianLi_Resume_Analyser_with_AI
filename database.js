import Database from 'better-sqlite3';

let db;

export function initDb(dbPath = './database.db') {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

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
}

export function registerUser(email, password) {
  try {
    const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    const info = stmt.run(email, password);
    return { userId: info.lastInsertRowid, credits: 100 };
  } catch (err) {
    return null;
  }
}

export function loginUser(email, password) {
  const stmt = db.prepare('SELECT id, email, credits FROM users WHERE email = ? AND password = ?');
  const user = stmt.get(email, password);
  return user ? { userId: user.id, email: user.email, credits: user.credits } : null;
}

export function getUserCredits(userId) {
  const stmt = db.prepare('SELECT credits FROM users WHERE id = ?');
  const user = stmt.get(userId);
  return user ? user.credits : 0;
}

export function deductCredits(userId, amount) {
  const checkStmt = db.prepare('SELECT credits FROM users WHERE id = ?');
  const user = checkStmt.get(userId);
  if (!user || user.credits < amount) return false;

  const updateStmt = db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?');
  updateStmt.run(amount, userId);
  return true;
}

export function createRecord(id, userId, sessionId, filename, text, jdsJson) {
  const stmt = db.prepare(`
    INSERT INTO analysis_records (id, user_id, session_id, resume_filename, resume_text, job_description_json, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  stmt.run(id, userId, sessionId, filename, text, jdsJson);
}

export function updateRecord(id, status, resultJson) {
  const stmt = db.prepare('UPDATE analysis_records SET status = ?, analysis_result_json = ? WHERE id = ?');
  stmt.run(status, resultJson, id);
}

export function getRecord(id) {
  const stmt = db.prepare('SELECT * FROM analysis_records WHERE id = ?');
  return stmt.get(id);
}

export function getHistory(userId) {
  const stmt = db.prepare('SELECT id, resume_filename, status, created_at FROM analysis_records WHERE user_id = ? ORDER BY created_at DESC');
  return stmt.all(userId);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

