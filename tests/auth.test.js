import test from 'node:test';
import assert from 'node:assert';
import { initDb, closeDb } from '../database.js';
import fs from 'fs';

test('Auth APIs Test Suite', async (t) => {
  const dbPath = './test_auth_database.db';
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  initDb(dbPath);

  // 动态引入启动测试 server
  process.env.PORT = '3001';
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test_secret';
  const { default: app } = await import('../server.js');
  const server = app.listen(3001);

  await t.test('GET /api/auth/status - Check default state', async () => {
    const res = await fetch('http://localhost:3001/api/auth/status');
    const data = await res.json();
    assert.strictEqual(data.loggedIn, false);
    assert.strictEqual(data.free_attempts, 3);
  });

  await t.test('POST /api/auth/register - Create new user', async () => {
    const res = await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'api_test@example.com', password: 'testpassword' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.credits, 100);
  });

  await t.test('POST /api/auth/login - Auth check with credentials', async () => {
    const res = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'api_test@example.com', password: 'testpassword' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.credits, 100);
  });

  server.close();
  closeDb();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});
