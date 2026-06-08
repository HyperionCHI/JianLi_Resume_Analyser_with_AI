import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { initDb, closeDb, getRecord } from '../database.js';

test('Upload & Analyze APIs Test Suite', async (t) => {
  const dbPath = './test_analyze_database.db';
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  initDb(dbPath);

  process.env.PORT = '3002';
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test_secret';
  const { default: app, parsers } = await import('../server.js');
  const server = app.listen(3002);

  // Mock parsers for testing
  parsers.pdf = async (buf) => buf.toString('utf-8');
  parsers.docx = async (buf) => buf.toString('utf-8');

  await t.test('POST /api/analyze/upload - Upload text resume successfully', async () => {
    // 模拟 multipart/form-data 上传一个简易的 txt 简历
    const boundary = '----TestBoundary';
    const fileContent = 'Name: John Doe\nSkill: Product Manager\nExperience: 3 years';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM', jd: 'Manage products' }]),
      `--${boundary}--`
    ].join('\r\n');

    const res = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.recordId);

    // 验证数据库中简历文本内容是否正常解析
    const record = getRecord(data.recordId);
    assert.strictEqual(record.resume_text, fileContent);
    assert.strictEqual(record.status, 'pending');
  });

  // 1. 未登录用户免费额度校验
  await t.test('POST /api/analyze/upload - Unauthenticated user free attempts flow', async () => {
    const boundary = '----TestBoundary';
    const fileContent = 'Free Attempt 1';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM', jd: 'Manage products' }]),
      `--${boundary}--`
    ].join('\r\n');

    let cookie = '';
    
    // Attempt 1
    const res1 = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.ok(data1.recordId);
    
    const setCookie = res1.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }

    // Attempt 2
    const res2 = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Cookie': cookie
      },
      body: body
    });
    assert.strictEqual(res2.status, 200);

    // Attempt 3
    const res3 = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Cookie': cookie
      },
      body: body
    });
    assert.strictEqual(res3.status, 200);

    // Attempt 4 -> Should fail with 403 (No free attempts)
    const res4 = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Cookie': cookie
      },
      body: body
    });
    assert.strictEqual(res4.status, 403);
    const data4 = await res4.json();
    assert.match(data4.message, /额度不足|次数已达上限|无免费额度|免费额度已达上限/i);
  });

  // 2. 已登录用户积分扣减规则校验
  await t.test('POST /api/analyze/upload - Authenticated user credits deduction', async () => {
    const email = 'user_analyze_test@test.com';
    const password = 'Password123';
    
    const regRes = await fetch('http://localhost:3002/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    assert.strictEqual(regRes.status, 200);
    
    const cookie = regRes.headers.get('set-cookie').split(';')[0];

    // 默认积分是 100，扣减 10 + 2 * 10 = 30 积分，剩余 70
    const boundary = '----TestBoundary';
    const fileContent = 'Logged In User Resume';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM1', jd: 'JD1' }, { title: 'PM2', jd: 'JD2' }]),
      `--${boundary}--`
    ].join('\r\n');

    const uploadRes = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Cookie': cookie
      },
      body: body
    });
    
    assert.strictEqual(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.ok(uploadData.recordId);

    const statusRes = await fetch('http://localhost:3002/api/auth/status', {
      method: 'GET',
      headers: { 'Cookie': cookie }
    });
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.credits, 70);

    const record = getRecord(uploadData.recordId);
    assert.strictEqual(record.resume_text, fileContent);
    assert.strictEqual(record.status, 'pending');
  });

  // 3. 已登录用户积分不足时拦截 403 校验
  await t.test('POST /api/analyze/upload - Authenticated user insufficient credits', async () => {
    const email = 'user_analyze_test@test.com';
    const password = 'Password123';
    
    const loginRes = await fetch('http://localhost:3002/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    assert.strictEqual(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    // 发送 7 个 JDs，扣减 10 + 7 * 10 = 80 积分，大于剩下的 70 积分
    const boundary = '----TestBoundary';
    const fileContent = 'Logged In User Resume';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([
        { title: 'PM1', jd: 'JD1' },
        { title: 'PM2', jd: 'JD2' },
        { title: 'PM3', jd: 'JD3' },
        { title: 'PM4', jd: 'JD4' },
        { title: 'PM5', jd: 'JD5' },
        { title: 'PM6', jd: 'JD6' },
        { title: 'PM7', jd: 'JD7' }
      ]),
      `--${boundary}--`
    ].join('\r\n');

    const uploadRes = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Cookie': cookie
      },
      body: body
    });

    assert.strictEqual(uploadRes.status, 403);
    const uploadData = await uploadRes.json();
    assert.match(uploadData.message, /积分不足/i);

    const statusRes = await fetch('http://localhost:3002/api/auth/status', {
      method: 'GET',
      headers: { 'Cookie': cookie }
    });
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.credits, 70);
  });

  // 4. 文件上传解析规则测试
  await t.test('POST /api/analyze/upload - Upload pdf and docx resume fallback', async () => {
    const boundary = '----TestBoundary';
    const pdfContent = 'PDF Resume Content';
    const bodyPdf = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.pdf"',
      'Content-Type: application/pdf',
      '',
      pdfContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM', jd: 'Manage products' }]),
      `--${boundary}--`
    ].join('\r\n');

    const resPdf = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: bodyPdf
    });
    const dataPdf = await resPdf.json();
    assert.strictEqual(resPdf.status, 200);
    const recordPdf = getRecord(dataPdf.recordId);
    assert.strictEqual(recordPdf.resume_text, pdfContent);

    const docxContent = 'DOCX Resume Content';
    const bodyDocx = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.docx"',
      'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '',
      docxContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM', jd: 'Manage products' }]),
      `--${boundary}--`
    ].join('\r\n');

    const resDocx = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: bodyDocx
    });
    const dataDocx = await resDocx.json();
    assert.strictEqual(resDocx.status, 200);
    const recordDocx = getRecord(dataDocx.recordId);
    assert.strictEqual(recordDocx.resume_text, docxContent);
  });

  // 5. 损坏/空简历上传测试（不扣减积分）
  await t.test('POST /api/analyze/upload - Failed parse or empty resume should not deduct credits', async () => {
    const email = 'user_analyze_test@test.com';
    const password = 'Password123';
    
    const loginRes = await fetch('http://localhost:3002/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    assert.strictEqual(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const initialStatusRes = await fetch('http://localhost:3002/api/auth/status', {
      method: 'GET',
      headers: { 'Cookie': cookie }
    });
    const initialStatusData = await initialStatusRes.json();
    const initialCredits = initialStatusData.credits;

    const boundary = '----TestBoundary';
    const bodyEmpty = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      '',
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM', jd: 'Manage products' }]),
      `--${boundary}--`
    ].join('\r\n');

    const resEmpty = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Cookie': cookie },
      body: bodyEmpty
    });

    assert.strictEqual(resEmpty.status, 400);
    const dataEmpty = await resEmpty.json();
    assert.match(dataEmpty.message, /为空|失败/i);

    const finalStatusRes = await fetch('http://localhost:3002/api/auth/status', {
      method: 'GET',
      headers: { 'Cookie': cookie }
    });
    const finalStatusData = await finalStatusRes.json();
    assert.strictEqual(finalStatusData.credits, initialCredits);
  });

  // 6. 文件大小超限测试 (LIMIT_FILE_SIZE)
  await t.test('POST /api/analyze/upload - Upload file exceeding 5MB limit should fail', async () => {
    const boundary = '----TestBoundary';
    const largeContent = 'a'.repeat(5 * 1024 * 1024 + 1024);
    const bodyLarge = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      largeContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM', jd: 'Manage products' }]),
      `--${boundary}--`
    ].join('\r\n');

    const resLarge = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: bodyLarge
    });
    
    assert.strictEqual(resLarge.status, 400);
    const dataLarge = await resLarge.json();
    assert.match(dataLarge.message, /超过 5MB/i);
  });

  // 7. jds 格式非数组校验测试
  await t.test('POST /api/analyze/upload - Upload with non-array jds should fail', async () => {
    const boundary = '----TestBoundary';
    const bodyInvalidJds = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      'Resume content',
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify({ title: 'PM', jd: 'Manage products' }),
      `--${boundary}--`
    ].join('\r\n');

    const resInvalid = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: bodyInvalidJds
    });

    assert.strictEqual(resInvalid.status, 400);
    const dataInvalid = await resInvalid.json();
    assert.match(dataInvalid.message, /必须是数组/i);
  });

  await t.test('GET /api/analyze/status/:recordId - Mock fallback analysis integration', async () => {
    // 模拟注册并登录一个测试用户，或者以匿名用户上传文件
    const boundary = '----TestBoundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="resume"; filename="resume.txt"',
      'Content-Type: text/plain',
      '',
      'Resume content for John Doe',
      `--${boundary}`,
      'Content-Disposition: form-data; name="jds"',
      '',
      JSON.stringify([{ title: 'PM', jd: 'Manage products' }]),
      `--${boundary}--`
    ].join('\r\n');

    const uploadRes = await fetch('http://localhost:3002/api/analyze/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body
    });
    const uploadData = await uploadRes.json();
    assert.strictEqual(uploadRes.status, 200);
    const recordId = uploadData.recordId;

    // 轮询直到状态为 completed (测试环境下由于没配 QINIU_API_KEY，应降级触发 2 秒延时的 mock)
    let completed = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const statusRes = await fetch(`http://localhost:3002/api/analyze/status/${recordId}`);
      const statusData = await statusRes.json();
      assert.strictEqual(statusRes.status, 200);
      if (statusData.status === 'completed') {
        completed = true;
        assert.strictEqual(statusData.result.overall_score, 85);
        assert.strictEqual(statusData.result.stats.content_integrity, 95);
        break;
      }
    }
    assert.ok(completed, 'Analysis should complete with mock fallback');
  });

  server.close();
  closeDb();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});
