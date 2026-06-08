import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { initDb, registerUser, loginUser, getUserCredits, deductCredits, createRecord, updateRecord, getRecord, getHistory, closeDb } from '../database.js';

test('Database Module Test Suite', async (t) => {
  // 准备一个临时数据库测试环境
  const dbPath = './test_database.db';
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  
  initDb(dbPath);

  await t.test('Register & Login User', () => {
    const regRes = registerUser('test@example.com', 'pwd123');
    assert.ok(regRes.userId);
    assert.strictEqual(regRes.credits, 100);

    // 异常用例：邮箱重复注册
    const regResDup = registerUser('test@example.com', 'pwd123');
    assert.strictEqual(regResDup, null);

    const loginRes = loginUser('test@example.com', 'pwd123');
    assert.ok(loginRes.userId);
    
    const failedLogin = loginUser('test@example.com', 'wrong_pwd');
    assert.strictEqual(failedLogin, null);
  });

  await t.test('Get and Deduct Credits', () => {
    const initialCredits = getUserCredits(1);
    assert.strictEqual(initialCredits, 100);

    // 异常用例：查询不存在用户的积分
    const nonExistCredits = getUserCredits(9999);
    assert.strictEqual(nonExistCredits, 0);

    const success = deductCredits(1, 20);
    assert.strictEqual(success, true);
    assert.strictEqual(getUserCredits(1), 80);

    const fail = deductCredits(1, 100); // 余额不足
    assert.strictEqual(fail, false);
    assert.strictEqual(getUserCredits(1), 80);

    // 异常用例：向不存在的用户扣减积分
    const nonExistDeduct = deductCredits(9999, 10);
    assert.strictEqual(nonExistDeduct, false);
  });

  await t.test('Create & Update Analysis Record', () => {
    createRecord('rec_123', 1, null, 'resume.pdf', 'resume content text', JSON.stringify([{ title: 'PM' }]));
    const record = getRecord('rec_123');
    assert.strictEqual(record.resume_filename, 'resume.pdf');
    assert.strictEqual(record.status, 'pending');

    updateRecord('rec_123', 'completed', JSON.stringify({ overall_score: 90 }));
    const updated = getRecord('rec_123');
    assert.strictEqual(updated.status, 'completed');
    assert.ok(updated.analysis_result_json.includes('overall_score'));
  });

  await t.test('Get History', async () => {
    // 延时以确保第二条记录的 CURRENT_TIMESTAMP 不同（SQLite 中 CURRENT_TIMESTAMP 精确到秒）
    await new Promise((resolve) => setTimeout(resolve, 1100));
    createRecord('rec_456', 1, null, 'resume2.pdf', 'resume content 2 text', JSON.stringify([{ title: 'Dev' }]));
    
    const history = getHistory(1);
    assert.strictEqual(history.length, 2);
    // 第一条是最新插入的记录（按时间倒序）
    assert.strictEqual(history[0].id, 'rec_456');
    assert.strictEqual(history[1].id, 'rec_123');
  });

  // 清理测试数据库
  closeDb();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});
