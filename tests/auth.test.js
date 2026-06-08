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

  await t.test('Full Session Lifecycle - Register, Status, Logout', async () => {
    // 1. 注册新用户
    const regRes = await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'persistent_test@example.com', password: 'testpassword' })
    });
    const regData = await regRes.json();
    assert.strictEqual(regRes.status, 200);
    assert.strictEqual(regData.success, true);
    
    // 提取 Cookie
    const cookie = regRes.headers.get('set-cookie');
    assert.ok(cookie, 'Should return set-cookie header');

    // 2. 带上 cookie 访问状态接口，验证登录会话保持
    const statusRes = await fetch('http://localhost:3001/api/auth/status', {
      headers: { 'Cookie': cookie }
    });
    const statusData = await statusRes.json();
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusData.loggedIn, true);
    assert.strictEqual(statusData.email, 'persistent_test@example.com');
    assert.strictEqual(statusData.credits, 100);

    // 3. 携带 cookie 进行登录（验证登录已注册账号）
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': cookie
      },
      body: JSON.stringify({ email: 'persistent_test@example.com', password: 'testpassword' })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginData.success, true);

    // 4. 注销登录
    const logoutRes = await fetch('http://localhost:3001/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(logoutRes.status, 200);

    // 5. 再次查询状态，验证已经退出
    const postLogoutRes = await fetch('http://localhost:3001/api/auth/status', {
      headers: { 'Cookie': cookie }
    });
    const postLogoutData = await postLogoutRes.json();
    assert.strictEqual(postLogoutData.loggedIn, false);
  });

  server.close();
  closeDb();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});
