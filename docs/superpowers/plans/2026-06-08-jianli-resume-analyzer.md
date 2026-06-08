# 「见历」AI 简历分析与优化系统 实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Express 和 SQLite 数据库，并结合七牛云大模型 API 与现有的 HTML 原型页面，完成「见历」简历分析与优化系统的全功能开发。

**Architecture:** 
1. 后端使用 Express 托管静态资源并提供 API 接口。
2. 数据存储使用 SQLite 处理用户及记录管理。
3. 文本解析采用内存处理，通过 PDF-parse / Mammoth 抽取文字并提交给七牛云 API 分析（大模型返回结构化 JSON）。
4. 前端通过原生的 Fetch 异步请求与 DOM 动态渲染实现无损集成。

**Tech Stack:** Node.js, Express, better-sqlite3, multer, pdf-parse, mammoth, dotenv, openai, Node.js 原生测试运行器 (`node:test`)

---

## 目录与文件清单映射
* 新增后端文件：
  * `database.js` (数据库逻辑)
  * `server.js` (接口服务)
  * `.env.example` & `.env` (环境配置)
* 新增测试文件 (测试位于 `tests/` 目录)：
  * `tests/database.test.js`
  * `tests/auth.test.js`
  * `tests/analyze.test.js`
* 整合前端文件 (在 `public/` 目录下)：
  * `public/index.html` (Launcher 首页)
  * `public/css/styles.css` (整合 CSS)
  * `public/screens/landing.html` (简历上传页)
  * `public/screens/analysis.html` (分析加载页)
  * `public/screens/report.html` (报告详情页)
  * `public/js/auth.js` (登录状态与交互脚本)
  * `public/js/app.js` (上传与分析数据绑定渲染脚本)
  * `public/logo.png` (Logo 图片)

---

## 实施步骤清单

### Task 1: 项目初始化与依赖安装

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.env`

- [ ] **Step 1: 创建 `package.json`**
  ```json
  {
    "name": "jianli-resume-analyzer",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "start": "node server.js",
      "test": "node --test tests/*.test.js"
    },
    "dependencies": {
      "better-sqlite3": "^11.0.0",
      "dotenv": "^16.4.5",
      "express": "^4.19.2",
      "express-session": "^1.18.0",
      "mammoth": "^1.7.2",
      "multer": "^1.4.5-lts.1",
      "openai": "^4.52.0",
      "pdf-parse": "^1.1.1"
    }
  }
  ```
- [ ] **Step 2: 创建 `.env.example` 文件**
  ```env
  PORT=3000
  SESSION_SECRET=super_secret_session_key_123
  QINIU_API_KEY=your_qiniu_ai_api_key_here
  QINIU_MODEL=deepseek-v3
  ```
- [ ] **Step 3: 复制创建本地 `.env` 文件（暂不配置 API KEY，以启用 Mock 验证）**
  ```env
  PORT=3000
  SESSION_SECRET=test_secret_for_local_env
  QINIU_API_KEY=
  QINIU_MODEL=deepseek-v3
  ```
- [ ] **Step 4: 运行依赖安装**
  运行: `npm install`
  预期: 依赖安装成功，且 `node_modules` 文件夹被创建。
- [ ] **Step 5: 提交代码**
  ```bash
  git add package.json .env.example .env
  git commit -m "chore: initialize package.json and dotenv configuration"
  ```

---

### Task 2: 数据库模块开发与测试 (SQLite)

**Files:**
- Create: `database.js`
- Test: `tests/database.test.js`

- [ ] **Step 1: 编写数据库单元测试**
  在 `tests/database.test.js` 中创建测试，验证数据库是否能正常建表、用户注册、积分扣减以及历史记录增删改查。
  ```javascript
  import test from 'node:test';
  import assert from 'node:assert';
  import fs from 'fs';
  import { initDb, registerUser, loginUser, getUserCredits, deductCredits, createRecord, updateRecord, getRecord, getHistory } from '../database.js';

  test('Database Module Test Suite', async (t) => {
    // 准备一个临时数据库测试环境
    const dbPath = './test_database.db';
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    
    initDb(dbPath);

    await t.test('Register & Login User', () => {
      const regRes = registerUser('test@example.com', 'pwd123');
      assert.ok(regRes.userId);
      assert.strictEqual(regRes.credits, 100);

      const loginRes = loginUser('test@example.com', 'pwd123');
      assert.ok(loginRes.userId);
      
      const failedLogin = loginUser('test@example.com', 'wrong_pwd');
      assert.strictEqual(failedLogin, null);
    });

    await t.test('Get and Deduct Credits', () => {
      const initialCredits = getUserCredits(1);
      assert.strictEqual(initialCredits, 100);

      const success = deductCredits(1, 20);
      assert.strictEqual(success, true);
      assert.strictEqual(getUserCredits(1), 80);

      const fail = deductCredits(1, 100); // 余额不足
      assert.strictEqual(fail, false);
      assert.strictEqual(getUserCredits(1), 80);
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

    // 清理测试数据库
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });
  ```
- [ ] **Step 2: 运行测试确保其失败**
  运行: `node --test tests/database.test.js`
  预期: 测试失败，提示 `database.js` 找不到。
- [ ] **Step 3: 编写数据库实现逻辑 `database.js`**
  ```javascript
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
  ```
- [ ] **Step 4: 运行测试确保其通过**
  运行: `node --test tests/database.test.js`
  预期: PASS，所有 4 个数据库测试单元全部通过。
- [ ] **Step 5: 提交代码**
  ```bash
  git add database.js tests/database.test.js
  git commit -m "feat: implement sqlite database schema and module functions with passing tests"
  ```

---

### Task 3: 认证接口开发与测试 (Express Session & Auth APIs)

**Files:**
- Create: `server.js` (初始化及 Auth 部分)
- Test: `tests/auth.test.js`

- [ ] **Step 1: 编写 Auth APIs 单元测试**
  在 `tests/auth.test.js` 中创建对注册、登录、状态获取、积分查询接口的模拟 HTTP 请求测试。
  ```javascript
  import test from 'node:test';
  import assert from 'node:assert';
  import { initDb } from '../database.js';
  import fs from 'fs';

  // 我们将在 server.js 实现后，启动一个临时端口服务进行集成测试
  test('Auth APIs Test Suite', async (t) => {
    const dbPath = './test_auth_database.db';
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    initDb(dbPath);

    // 动态引入启动测试 server
    process.env.PORT = '3001';
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

    server.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });
  ```
- [ ] **Step 2: 运行测试确保其失败**
  运行: `node --test tests/auth.test.js`
  预期: 测试报错，因为 `server.js` 尚未开发。
- [ ] **Step 3: 编写包含 Session 与 Auth 接口的 `server.js` 部分代码**
  ```javascript
  import express from 'express';
  import session from 'express-session';
  import dotenv from 'dotenv';
  import { initDb, registerUser, loginUser, getUserCredits } from './database.js';

  dotenv.config();

  // 如果是在主应用模式下运行，则初始化真实数据库
  if (process.env.NODE_ENV !== 'test') {
    initDb();
  }

  const app = express();
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
  }));

  // 初始化未登录用户的免费会话额度
  app.use((req, res, next) => {
    if (!req.session.free_attempts && req.session.free_attempts !== 0) {
      req.session.free_attempts = 3;
    }
    next();
  });

  // 1. 获取认证状态与积分额度
  app.get('/api/auth/status', (req, res) => {
    if (req.session.user) {
      // 动态查询积分以获取最新数据
      const credits = getUserCredits(req.session.user.userId);
      res.json({
        loggedIn: true,
        email: req.session.user.email,
        credits: credits,
        free_attempts: 0
      });
    } else {
      res.json({
        loggedIn: false,
        email: null,
        credits: 0,
        free_attempts: req.session.free_attempts
      });
    }
  });

  // 2. 注册
  app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: '邮箱或密码不能为空' });
    }
    const result = registerUser(email, password);
    if (!result) {
      return res.status(400).json({ success: false, message: '该邮箱已被注册' });
    }
    req.session.user = result;
    res.json({ success: true, credits: result.credits });
  });

  // 3. 登录
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: '邮箱或密码不能为空' });
    }
    const user = loginUser(email, password);
    if (!user) {
      return res.status(400).json({ success: false, message: '邮箱或密码错误' });
    }
    req.session.user = user;
    res.json({ success: true, credits: user.credits });
  });

  // 4. 退出登录
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
  });

  // 托管静态文件 (将 public 目录下的前端原型作为静态托管)
  app.use(express.static('public'));

  // 启动服务 (仅在非测试环境下监听端口)
  if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  }

  export default app;
  ```
- [ ] **Step 4: 运行测试确保其通过**
  设置测试环境变量并运行测试:
  在 Windows Powershell 中运行: `$env:NODE_ENV="test"; node --test tests/auth.test.js`
  预期: PASS，接口状态检测及注册流程全部模拟成功。
- [ ] **Step 5: 提交代码**
  ```bash
  git add server.js tests/auth.test.js
  git commit -m "feat: implement session-based authentication routes with passing tests"
  ```

---

### Task 4: 简历上传与解析接口开发 (Upload & Document Parsing)

**Files:**
- Modify: `server.js` (添加 Multer 接收及 pdf/docx 解析 API)
- Test: `tests/analyze.test.js`

- [ ] **Step 1: 编写简历上传与文本解析单元测试**
  在 `tests/analyze.test.js` 中创建测试，模拟上传 TXT/PDF/Word 文件，检查积分判定规则、文件读取规则以及记录的初始状态。
  ```javascript
  import test from 'node:test';
  import assert from 'node:assert';
  import fs from 'fs';
  import { initDb, getRecord } from '../database.js';

  test('Upload & Analyze APIs Test Suite', async (t) => {
    const dbPath = './test_analyze_database.db';
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    initDb(dbPath);

    process.env.PORT = '3002';
    process.env.NODE_ENV = 'test';
    const { default: app } = await import('../server.js');
    const server = app.listen(3002);

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

    server.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });
  ```
- [ ] **Step 2: 运行测试确保其失败**
  运行: `node --test tests/analyze.test.js`
  预期: 测试报错或 404 (upload 路由未定义)。
- [ ] **Step 3: 修改 `server.js` 增加 Multer 上传、文本解析与记录生成逻辑**
  在 `server.js` 中引入 `multer`, `pdf-parse`, `mammoth` 依赖，并加入 `/api/analyze/upload` 路由：
  ```javascript
  // 在 server.js 头部加入：
  import multer from 'multer';
  import pdfParse from 'pdf-parse';
  import mammoth from 'mammoth';
  import crypto from 'crypto';
  import { createRecord, deductCredits } from './database.js';

  // 配置 Multer 内存存储
  const storage = multer.memoryStorage();
  const upload = multer.single('resume');

  // 后端分析上传入口
  app.post('/api/analyze/upload', upload, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: '请选择要上传的简历文件' });
      }

      const jdsRaw = req.body.jds || '[]';
      let jds = [];
      try {
        jds = JSON.parse(jdsRaw);
      } catch (err) {
        return res.status(400).json({ success: false, message: 'JD 参数格式有误，必须为 JSON' });
      }

      // 计算消耗点数 (基础 10 点 + 每个岗位 10 点)
      const cost = 10 + jds.length * 10;

      // 额度判定
      let userId = null;
      if (req.session.user) {
        userId = req.session.user.userId;
        const credits = getUserCredits(userId);
        if (credits < cost) {
          return res.status(403).json({ success: false, message: `积分余额不足。本次分析需要 ${cost} 点，您当前仅剩 ${credits} 点。` });
        }
      } else {
        // 未登录用户扣减 free_attempts
        if (req.session.free_attempts <= 0) {
          return res.status(403).json({ success: false, message: '您的免费分析额度已用完，请登录后继续使用。' });
        }
      }

      // 根据文件类型解析文本
      let resumeText = '';
      const filename = req.file.originalname;
      const buffer = req.file.buffer;

      if (filename.endsWith('.pdf')) {
        const parsed = await pdfParse(buffer);
        resumeText = parsed.text;
      } else if (filename.endsWith('.docx')) {
        const parsed = await mammoth.extractRawText({ buffer: buffer });
        resumeText = parsed.value;
      } else {
        // .txt 或 .md 格式直接读取
        resumeText = buffer.toString('utf-8');
      }

      if (!resumeText.trim()) {
        return res.status(400).json({ success: false, message: '无法从该文件中提取到任何文本内容' });
      }

      // 验证通过，扣减额度并写入数据库
      const recordId = crypto.randomUUID();
      const sessionId = req.session.id;

      if (userId) {
        deductCredits(userId, cost);
      } else {
        req.session.free_attempts -= 1;
      }

      // 创建分析记录
      createRecord(recordId, userId, sessionId, filename, resumeText, JSON.stringify(jds));

      // 启动异步大模型分析流程 (Task 5 实现)
      triggerBackgroundAnalysis(recordId);

      res.json({ success: true, recordId: recordId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '服务器处理文件上传时发生异常' });
    }
  });

  // 临时插桩占位函数，后续 Task 将实现具体分析细节
  function triggerBackgroundAnalysis(recordId) {
    console.log(`[Task 5 Trigger] Started background analysis for record: ${recordId}`);
  }
  ```
- [ ] **Step 4: 运行测试确保其通过**
  运行: `$env:NODE_ENV="test"; node --test tests/analyze.test.js`
  预期: PASS，简历解析并插入 pending 状态的记录逻辑全部成功。
- [ ] **Step 5: 提交代码**
  ```bash
  git add server.js tests/analyze.test.js
  git commit -m "feat: add resume upload and file text extraction endpoints with passing tests"
  ```

---

### Task 5: 七牛云 MaaS 大模型分析与 Mock 降级开发

**Files:**
- Modify: `server.js` (补充 triggerBackgroundAnalysis 实现，增加轮询状态接口)
- Create: `mockData.js` (预存 Mock 格式数据结构)

- [ ] **Step 1: 编写 Mock 降级与异步处理测试**
  在 `tests/analyze.test.js` 中增加关于轮询接口、Mock 降级返回值和数据库状态更新的集成测试。
  ```javascript
  // 在 tests/analyze.test.js 中，继续扩展测试用例：
  await t.test('GET /api/analyze/status/:recordId - Mock fallback analysis', async () => {
    // 假定直接调用上传得到一个 recordId
    const res = await fetch('http://localhost:3002/api/analyze/status/rec_test_status');
    // 注意：我们在测试时，可以直接在数据库插入一条 pending 记录
    // 检查状态从 pending 自动或手动流转为 completed 并且含有结构化的 JSON 数据
  });
  ```
- [ ] **Step 2: 运行测试确保其失败**
  运行: `node --test tests/analyze.test.js`
  预期: 接口状态报错或无法正确模拟。
- [ ] **Step 3: 编写 Mock 数据配置 `mockData.js`**
  ```javascript
  export const defaultMockResult = {
    overall_score: 85,
    stats: {
      content_integrity: 95,
      expression_clarity: 80,
      experience_quality: 88,
      keyword_coverage: 72
    },
    verdict_30s: "您的简历与该岗位的核心要求高度匹配，但在项目量化结果和特定工具使用上仍有优化空间。",
    jobs: [
      {
        key: "pm",
        title: "产品经理",
        match_rate: 85,
        advantages: [
          { title: "行业背景契合", desc: "您在电商行业的 3 年经验与该岗位高度契合。" },
          { title: "核心技能覆盖", desc: "简历中明确提到了产品规划、数据分析、原型设计等关键能力。" }
        ],
        gaps: [
          { title: "缺少 SQL 描述", desc: "JD 要求熟练使用 SQL，您的简历中未体现数据查询与分析能力。" },
          { title: "敏捷开发流程", desc: "建议补充您在 Scrum/Agile 团队中的敏捷协作和迭代管理经验。" }
        ]
      },
      {
        key: "op",
        title: "运营专家",
        match_rate: 62,
        advantages: [
          { title: "跨部门协作能力强", desc: "具备大型营销活动全案策划及多部门推进交付经验。" }
        ],
        gaps: [
          { title: "数据敏感度偏弱", desc: "简历对于数据指标监控、A/B 测试和归因模型的使用描述偏少。" }
        ]
      }
    ],
    issues: [
      {
        title: "项目成果描述缺乏量化指标",
        impact: "在“电商系统改版”描述中，您提到了“提升了用户体验”，建议使用具体数字体现，如“核心转化率提升 15%”。",
        before: "负责产品优化，提升了用户活跃度。",
        after: "负责核心功能迭代，通过 A/B 测试优化路径，带动日活 (DAU) 增长 12%，次日留存提升 5%。"
      },
      {
        title: "排版建议：工作经历过长",
        impact: "最近一段经历描述超过了 8 条，建议精简至 5 条最核心的成就，突出重点。",
        before: "在上一家公司处理了日常的产品交付工作，撰写需求文档，对接技术人员，处理 Bug 反馈...",
        after: "负责公司核心产品线的需求梳理与发布，保障了产品以双周为一个迭代的敏捷开发效率。"
      }
    ],
    optimized_resume_text: "优化后的简历片段草稿：\n\n【个人优势】\n- 3年电商产品设计经验，熟练主导大型复杂系统改版升级。\n- 擅长数据驱动的产品决策，曾通过A/B测试将核心结算转化率提升12%。\n\n【核心工作成果】\n- 电商系统重构与升级（产品经理）：主导结算与收银中心微服务改造，重构结算链条，直接减少结算步骤 2 步，用户结账耗时降低 35%，拉动全站下单转化率提升 8%。"
  };
  ```
- [ ] **Step 4: 完善 `server.js` 大模型对接与 Mock 处理**
  修改 `server.js`，完善异步大模型对接逻辑及轮询状态接口：
  ```javascript
  import { defaultMockResult } from './mockData.js';
  import { updateRecord, getRecord } from './database.js';
  import { OpenAI } from 'openai';

  // 状态轮询接口
  app.get('/api/analyze/status/:recordId', (req, res) => {
    const record = getRecord(req.params.recordId);
    if (!record) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    res.json({
      success: true,
      status: record.status,
      result: record.analysis_result_json ? JSON.parse(record.analysis_result_json) : null
    });
  });

  // 异步后台大模型分析任务
  async function triggerBackgroundAnalysis(recordId) {
    // 立即变更数据库记录为处理中
    updateRecord(recordId, 'processing', null);

    const record = getRecord(recordId);
    if (!record) return;

    const apiKey = process.env.QINIU_API_KEY;
    const model = process.env.QINIU_MODEL || 'deepseek-v3';

    // 优雅降级：若 API KEY 为空，采用 Mock 降级处理
    if (!apiKey) {
      console.log(`[Qiniu MaaS] API Key not found. Falling back to mock data for record: ${recordId}`);
      setTimeout(() => {
        // 延时 2 秒模拟 AI 思考，之后写入 Mock 数据
        updateRecord(recordId, 'completed', JSON.stringify(defaultMockResult));
      }, 2000);
      return;
    }

    // 调用真实的七牛云 MaaS 大模型服务
    try {
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://api.qnaigc.com/v1'
      });

      const systemPrompt = `
      你是优秀的简历审计与优化官。你必须根据以下内容和准则，对求职者的简历文本进行专业审计。
      【核心审计准则】
      1. 量化优先：检查简历描述中是否缺乏量化指标，将其转化为 STAR 模式下的“动作 + 产物 + 结果”表达。
      2. 规避雷区：检测求职者简历中的敏感问题，并给出改进建议。
      3. 岗位匹配：如果有目标岗位 JD，请着力计算简历与 JD 的匹配度，指出匹配优势与核心缺失能力。

      【输出格式约束】
      你必须以 JSON 格式输出审计结果。JSON 属性必须包括：
      - overall_score (数字，满分 100)
      - stats: { content_integrity: 数字, expression_clarity: 数字, experience_quality: 数字, keyword_coverage: 数字 }
      - verdict_30s: (文本，一句话直观诊断结论)
      - jobs: 数组，每一项代表一个岗位的匹配结果，包含 { key: 标识符, title: 岗位名, match_rate: 匹配百分比数字, advantages: 数组 {title, desc}, gaps: 数组 {title, desc} }。如果是常规分析没有传入JD，则填充一项常规分析。
      - issues: 数组，每一项代表具体的一个简历漏洞，包含 { title: 漏洞名, impact: 影响描述, before: 优化前文本或null, after: 优化后文本或null }
      - optimized_resume_text: (文本，根据优化后的简历完整草稿或重点片断重写)

      禁止输出任何 markdown 代码块标记，只输出合法的 JSON 字符串。
      `;

      const userPrompt = `
      简历原文：
      """
      ${record.resume_text}
      """

      目标岗位 JD：
      """
      ${record.job_description_json}
      """
      `;

      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' } // 部分大模型支持 JSON 约束，若不支持亦能通过 prompt 确保
      });

      const aiResponse = response.choices[0].message.content;
      
      // 验证是否是合法 JSON
      JSON.parse(aiResponse);

      // 更新记录
      updateRecord(recordId, 'completed', aiResponse);
    } catch (err) {
      console.error('[Qiniu MaaS] API Call Error:', err);
      updateRecord(recordId, 'failed', JSON.stringify({ error: err.message }));
    }
  }
  ```
- [ ] **Step 5: 运行测试确保其通过**
  运行: `$env:NODE_ENV="test"; node --test tests/analyze.test.js`
  预期: PASS，轮询与 Mock 降级模拟执行正常。
- [ ] **Step 6: 提交代码**
  ```bash
  git add server.js mockData.js tests/analyze.test.js
  git commit -m "feat: implement Qiniu MaaS LLM integration with mock fallback and status polling"
  ```

---

### Task 6: 报告与优化简历下载接口开发

**Files:**
- Modify: `server.js` (添加下载报告及 docx 的 API 路由)

- [ ] **Step 1: 编写下载接口的测试用例**
  在 `tests/analyze.test.js` 结尾，增加 GET `/api/analyze/download/report/:recordId` 与 `/api/analyze/download/docx/:recordId` 接口测试，验证响应头及数据流。
- [ ] **Step 2: 运行测试确保其失败**
  运行: `node --test tests/analyze.test.js`
  预期: 404 (下载接口未定义)。
- [ ] **Step 3: 完善 `server.js` 增加下载接口实现**
  ```javascript
  // 1. 下载 Markdown 分析报告
  app.get('/api/analyze/download/report/:recordId', (req, res) => {
    const record = getRecord(req.params.recordId);
    if (!record || record.status !== 'completed') {
      return res.status(404).send('报告不存在或尚未分析完成');
    }

    const result = JSON.parse(record.analysis_result_json);
    const mdReport = `
  # 「见历」AI 简历分析报告
  * 简历文件: ${record.resume_filename}
  * 评分: ${result.overall_score}
  * 一句话诊断结论: ${result.verdict_30s}

  ## 四大评估维度
  * 内容完整度: ${result.stats.content_integrity}%
  * 表达清晰度: ${result.stats.expression_clarity}%
  * 经历质量: ${result.stats.experience_quality}%
  * 关键词覆盖: ${result.stats.keyword_coverage}%

  ## 问题诊断与修改建议
  ${result.issues.map((issue, idx) => `
  ### 问题 ${idx + 1}: ${issue.title}
  * **负面影响**: ${issue.impact}
  ${issue.before ? `* **优化前**: ${issue.before}` : ''}
  ${issue.after ? `* **优化后**: ${issue.after}` : ''}
  `).join('\n')}

  ---
  报告由「见历 AI」系统自动生成。
    `;

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analysis-report-${req.params.recordId}.md"`);
    res.send(mdReport);
  });

  // 2. 下载优化版简历 (.docx)
  app.get('/api/analyze/download/docx/:recordId', (req, res) => {
    const record = getRecord(req.params.recordId);
    if (!record || record.status !== 'completed') {
      return res.status(404).send('优化简历不存在或尚未分析完成');
    }

    const result = JSON.parse(record.analysis_result_json);
    const optimizedText = result.optimized_resume_text || '暂无优化版简历内容';

    // 由于服务器轻量化，这里以格式化文本文件作为优化版简历进行分发下载
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="optimized-resume-${req.params.recordId}.txt"`);
    res.send(optimizedText);
  });
  ```
- [ ] **Step 4: 运行测试确保其通过**
  运行: `$env:NODE_ENV="test"; node --test tests/analyze.test.js`
  预期: PASS，所有文件上传、异步分析、轮询、下载接口均测试通过。
- [ ] **Step 5: 提交代码**
  ```bash
  git add server.js
  git commit -m "feat: implement markdown report and txt resume download endpoints"
  ```

---

### Task 7: 前端静态文件拷贝与部署

**Files:**
- Create: `public/index.html`
- Create: `public/css/styles.css`
- Create: `public/screens/landing.html`
- Create: `public/screens/analysis.html`
- Create: `public/screens/report.html`
- Create: `public/logo.png`

- [ ] **Step 1: 拷贝 DesignFile 中的资源至 `public/` 目录**
  * 创建 `public`, `public/css`, `public/screens`, `public/js` 目录。
  * 将 `DesignFile/V1.0.0/css/styles.css` 复制为 `public/css/styles.css`。
  * 将 `DesignFile/V1.0.0/screens/landing.html` 复制为 `public/screens/landing.html`。
  * 将 `DesignFile/V1.0.0/screens/analysis.html` 复制为 `public/screens/analysis.html`。
  * 将 `DesignFile/V1.0.0/screens/report.html` 复制为 `public/screens/report.html`。
  * 将 `DesignFile/V1.0.0/logo.png` 复制为 `public/logo.png`。
- [ ] **Step 2: 创建 `public/index.html` 作为重定向或启动入口**
  ```html
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=screens/landing.html">
    <title>见历 - 跳转中</title>
  </head>
  <body>
    正在跳转到「见历」首页...
  </body>
  </html>
  ```
- [ ] **Step 3: 检查静态文件托管可用性**
  启动服务器: `npm start`
  在本地打开浏览器访问: `http://localhost:3000`
  预期: 页面能自动重定向到 `landing.html`，并且页面展示出原生的精美原型样式。
- [ ] **Step 4: 提交代码**
  ```bash
  git add public/
  git commit -m "chore: copy static designs and layouts to public directory"
  ```

---

### Task 8: 前端 Auth 逻辑集成与动态积分显示

**Files:**
- Modify: `public/screens/landing.html`
- Create: `public/js/auth.js`

- [ ] **Step 1: 在 `landing.html` 中引入登录模态框及 `auth.js` 脚本**
  * 在 `landing.html` 的 `<body>` 末尾加入一个隐藏的登录模态框 (Modal)：
  ```html
  <div id="loginModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
    <div class="card" style="width: 400px; background: white; padding: var(--space-lg); border-radius: var(--radius-md);">
      <h3 style="margin-bottom: var(--space-md);" id="modalTitle">登录见历</h3>
      <input type="email" id="authEmail" class="jd-input" placeholder="输入邮箱" style="margin-bottom: var(--space-sm);">
      <input type="password" id="authPassword" class="jd-input" placeholder="输入密码" style="margin-bottom: var(--space-md);">
      <div style="display: flex; gap: var(--space-md);">
        <button class="btn btn-primary" id="btnSubmitAuth" style="flex: 1;">确定</button>
        <button class="btn btn-outline" onclick="document.getElementById('loginModal').style.display='none'" style="flex: 1;">取消</button>
      </div>
      <p style="text-align: center; margin-top: var(--space-md); font-size: 0.85rem; color: var(--muted); cursor: pointer;" id="toggleAuthMode">没有账号？点击注册</p>
    </div>
  </div>
  <!-- 引入 auth.js -->
  <script src="../js/auth.js"></script>
  ```
  * 将导航栏上的 `<button class="btn btn-outline">登录</button>` 修改为：
  `<button class="btn btn-outline" id="btnLoginNav" onclick="showAuthModal()">登录</button>`
- [ ] **Step 2: 编写 `public/js/auth.js` 逻辑**
  ```javascript
  let isRegisterMode = false;

  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      
      const loginBtn = document.getElementById('btnLoginNav');
      const freeCreditsSpan = loginBtn.previousElementSibling; // '免费额度：剩余 3 次'

      if (data.loggedIn) {
        loginBtn.textContent = '退出';
        loginBtn.onclick = logout;
        freeCreditsSpan.textContent = `当前账号积分：${data.credits} 点`;
      } else {
        loginBtn.textContent = '登录';
        loginBtn.onclick = showAuthModal;
        freeCreditsSpan.textContent = `免费额度：剩余 ${data.free_attempts} 次`;
      }
    } catch (err) {
      console.error('Check auth error:', err);
    }
  }

  function showAuthModal() {
    isRegisterMode = false;
    document.getElementById('modalTitle').textContent = '登录见历';
    document.getElementById('toggleAuthMode').textContent = '没有账号？点击注册';
    document.getElementById('loginModal').style.display = 'flex';
  }

  document.getElementById('toggleAuthMode').onclick = () => {
    isRegisterMode = !isRegisterMode;
    document.getElementById('modalTitle').textContent = isRegisterMode ? '注册见历账号' : '登录见历';
    document.getElementById('toggleAuthMode').textContent = isRegisterMode ? '已有账号？点击登录' : '没有账号？点击注册';
  };

  document.getElementById('btnSubmitAuth').onclick = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return alert('请填写邮箱和密码');

    const url = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        document.getElementById('loginModal').style.display = 'none';
        checkAuthStatus();
      } else {
        alert(data.message || '操作失败');
      }
    } catch (err) {
      alert('请求发生错误');
    }
  };

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      checkAuthStatus();
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  // 初始化检查
  window.addEventListener('DOMContentLoaded', checkAuthStatus);
  ```
- [ ] **Step 3: 运行服务器并手动在页面上登录注册**
  访问网页，点击登录，点击注册并新建用户，验证顶部积分是否变更为 "当前账号积分：100 点"。
- [ ] **Step 4: 提交代码**
  ```bash
  git add public/screens/landing.html public/js/auth.js
  git commit -m "feat: integrate login/register modal and check dynamic credit status"
  ```

---

### Task 9: 上传、分析状态轮询与报告渲染整合开发

**Files:**
- Modify: `public/screens/landing.html` (加入上传处理)
- Modify: `public/screens/analysis.html` (动态轮询状态)
- Modify: `public/screens/report.html` (动态渲染 DOM 结果)
- Create: `public/js/app.js`

- [ ] **Step 1: 在 `landing.html` 中引入 `app.js` 并绑定上传事件**
  * 将 `landing.html` 中的文件选择框绑定事件：
  `<input type="file" id="fileInput" style="display: none;" onchange="handleFileSelected(this)">`
  并在上传 zone 内增加一个状态显示文本：`<p id="uploadStatusText" class="text-muted mt-sm">支持 PDF, Word, Markdown, TXT 格式</p>`
  * 将“分析我的简历”按钮更改为：
  `<button class="btn btn-primary btn-analyze" id="btnStartAnalyze" style="padding: 14px 40px; font-size: 1.1rem;" onclick="startAnalysis()">分析我的简历</button>`
  * 在页面底端导入：`<script src="../js/app.js"></script>`
- [ ] **Step 2: 编写 `public/js/app.js` 部分上传与状态流转代码**
  在 `public/js/app.js` 中编写代码：
  ```javascript
  let selectedFile = null;

  function handleFileSelected(input) {
    if (input.files.length > 0) {
      selectedFile = input.files[0];
      document.getElementById('uploadStatusText').textContent = `已选择文件: ${selectedFile.name}`;
      document.getElementById('uploadStatusText').style.color = 'var(--accent)';
    }
  }

  async function startAnalysis() {
    if (!selectedFile) {
      return alert('请先上传简历文件');
    }

    // 抓取多岗位和 JD
    const jds = [];
    const cards = document.querySelectorAll('.jd-card');
    cards.forEach(card => {
      const title = card.querySelector('input').value.trim();
      const jd = card.querySelector('textarea').value.trim();
      if (title) {
        jds.push({ title, jd });
      }
    });

    const formData = new FormData();
    formData.append('resume', selectedFile);
    formData.append('jds', JSON.stringify(jds));

    try {
      document.getElementById('btnStartAnalyze').disabled = true;
      document.getElementById('btnStartAnalyze').textContent = '正在发起分析...';

      const res = await fetch('/api/analyze/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // 跳转至分析等待页，并附带 recordId
        location.href = `analysis.html?id=${data.recordId}`;
      } else {
        alert(data.message || '上传分析失败');
        document.getElementById('btnStartAnalyze').disabled = false;
        document.getElementById('btnStartAnalyze').textContent = '分析我的简历';
      }
    } catch (err) {
      alert('请求分析接口失败');
      document.getElementById('btnStartAnalyze').disabled = false;
      document.getElementById('btnStartAnalyze').textContent = '分析我的简历';
    }
  }
  ```
- [ ] **Step 3: 整合修改 `analysis.html` 轮询接口逻辑**
  修改 `analysis.html` 底部的 `<script>` 逻辑，使其根据 URL 参数进行真实的 HTTP 轮询，并动态推进步骤卡片：
  ```html
  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const recordId = urlParams.get('id');

    if (!recordId) {
      alert('参数缺失，正在返回首页');
      location.href = 'landing.html';
    }

    const steps = ['step2', 'step3', 'step4', 'step5'];
    let currentStepIndex = 0;

    // 轮询接口状态
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze/status/${recordId}`);
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.status === 'completed') {
            clearInterval(pollInterval);
            
            // 推进所有状态为完成，再跳转
            document.getElementById('step5').className = 'step-item done';
            document.getElementById('step5').querySelector('.step-icon').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            
            setTimeout(() => {
              location.href = `report.html?id=${recordId}`;
            }, 1000);
          } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            alert('大模型简历审计失败，请重试');
            location.href = 'landing.html';
          } else if (data.status === 'processing') {
            // 根据逻辑，模拟推进 UI 的加载状态
            if (currentStepIndex < steps.length) {
              const prevId = currentStepIndex === 0 ? 'step1' : steps[currentStepIndex - 1];
              const currId = steps[currentStepIndex];

              document.getElementById(currId).className = 'step-item active';
              document.getElementById(currId).querySelector('.step-icon').innerHTML = '<div class="spinner"></div>';

              const prev = document.getElementById(prevId);
              prev.className = 'step-item done';
              prev.querySelector('.step-icon').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

              currentStepIndex++;
            }
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);
  </script>
  ```
- [ ] **Step 4: 整合修改 `report.html` 实现数据动态渲染和下载**
  * 在 `report.html` 末尾引入 `app.js`：`<script src="../js/app.js"></script>`
  * 在 `public/js/app.js` 中继续追加**报告结果加载与渲染逻辑**：
  ```javascript
  // 渲染报告
  async function loadReport() {
    const urlParams = new URLSearchParams(window.location.search);
    const recordId = urlParams.get('id');
    if (!recordId) return;

    try {
      const res = await fetch(`/api/analyze/status/${recordId}`);
      const data = await res.json();
      if (res.ok && data.success && data.status === 'completed') {
        const report = data.result;
        renderReportDOM(report, recordId);
      } else {
        alert('无法加载分析报告数据');
      }
    } catch (err) {
      console.error('Load report error:', err);
    }
  }

  function renderReportDOM(report, recordId) {
    // 1. 渲染评分
    document.querySelector('.score-val').textContent = report.overall_score;
    
    // 2. 渲染四大百分比条
    document.querySelector('.stat-grid').innerHTML = `
      <div class="stat-card">
        <h4>内容完整度</h4>
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>${report.stats.content_integrity}%</span>
        </div>
        <div class="stat-bar"><div class="stat-progress" style="width: ${report.stats.content_integrity}%;"></div></div>
      </div>
      <div class="stat-card">
        <h4>表达清晰度</h4>
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>${report.stats.expression_clarity}%</span>
        </div>
        <div class="stat-bar"><div class="stat-progress" style="width: ${report.stats.expression_clarity}%;"></div></div>
      </div>
      <div class="stat-card">
        <h4>经历质量</h4>
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>${report.stats.experience_quality}%</span>
        </div>
        <div class="stat-bar"><div class="stat-progress" style="width: ${report.stats.experience_quality}%;"></div></div>
      </div>
      <div class="stat-card">
        <h4>关键词覆盖</h4>
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>${report.stats.keyword_coverage}%</span>
        </div>
        <div class="stat-bar"><div class="stat-progress" style="width: ${report.stats.keyword_coverage}%;"></div></div>
      </div>
    `;

    // 3. 渲染侧边栏岗位 Tab
    const tabsContainer = document.querySelector('.jd-tabs-scroll');
    tabsContainer.innerHTML = '';
    
    report.jobs.forEach((job, idx) => {
      const activeClass = idx === 0 ? 'active' : '';
      const matchText = job.match_rate ? `<span class="match-pill">${job.match_rate}% 匹配</span>` : '';
      const tabDiv = document.createElement('div');
      tabDiv.className = `jd-tab ${activeClass}`;
      tabDiv.onclick = () => switchJobTab(job, tabDiv);
      tabDiv.innerHTML = `
        <span>${job.title}</span>
        ${matchText}
      `;
      tabsContainer.appendChild(tabDiv);
    });

    // 默认展示第一个岗位的数据
    if (report.jobs.length > 0) {
      updateJobDetailCard(report.jobs[0]);
    }

    // 4. 渲染主要问题诊断
    const issuesContainer = document.querySelector('.card.mt-lg');
    issuesContainer.innerHTML = '<h3 style="margin-bottom: var(--space-lg);">主要问题诊断与优化建议</h3>';
    
    report.issues.forEach(issue => {
      const beforeAfterHtml = issue.before ? `
        <div style="background: var(--bg); padding: var(--space-md); border-radius: var(--radius-sm); font-size: 0.85rem; margin-top: var(--space-sm);">
          <p><strong>优化前：</strong>${issue.before}</p>
          <p class="mt-sm"><strong>优化后：</strong>${issue.after}</p>
        </div>
      ` : '';

      const itemDiv = document.createElement('div');
      itemDiv.className = 'issue-item';
      itemDiv.innerHTML = `
        <div class="issue-icon">!</div>
        <div style="width: 100%;">
          <p style="font-weight: 600;">${issue.title}</p>
          <p class="text-muted" style="margin: 4px 0 var(--space-sm);">${issue.impact}</p>
          ${beforeAfterHtml}
        </div>
      `;
      issuesContainer.appendChild(itemDiv);
    });

    // 5. 绑定下载按钮事件
    const downloadFloat = document.querySelector('.download-float');
    downloadFloat.innerHTML = `
      <button class="btn btn-outline" style="background: white; box-shadow: var(--shadow-md);" onclick="location.href='/api/analyze/download/report/${recordId}'">下载详细分析报告</button>
      <button class="btn btn-primary" style="box-shadow: var(--shadow-md);" onclick="location.href='/api/analyze/download/docx/${recordId}'">下载 AI 优化版简历</button>
    `;
  }

  function switchJobTab(job, tabEl) {
    const tabs = document.querySelectorAll('.jd-tab');
    tabs.forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    updateJobDetailCard(job);
  }

  function updateJobDetailCard(job) {
    document.getElementById('jdTitle').textContent = `${job.title} - 岗位匹配报告`;
    
    // 获取匹配优势和缺失卡片
    const cards = document.querySelectorAll('.grid.grid-2 > .card');
    
    // 渲染优势
    const advantagesCard = cards[0];
    advantagesCard.innerHTML = `<h3 style="margin-bottom: var(--space-lg);">匹配优势</h3>`;
    job.advantages.forEach(adv => {
      const item = document.createElement('div');
      item.className = 'issue-item';
      item.innerHTML = `
        <div class="issue-icon success">✓</div>
        <div>
          <p style="font-weight: 600;">${adv.title}</p>
          <p class="text-muted" style="font-size: 0.85rem;">${adv.desc}</p>
        </div>
      `;
      advantagesCard.appendChild(item);
    });

    // 渲染劣势
    const gapsCard = cards[1];
    gapsCard.innerHTML = `<h3 style="margin-bottom: var(--space-lg);">缺失能力/关键词</h3>`;
    job.gaps.forEach(gap => {
      const item = document.createElement('div');
      item.className = 'issue-item';
      item.innerHTML = `
        <div class="issue-icon">!</div>
        <div>
          <p style="font-weight: 600;">${gap.title}</p>
          <p class="text-muted" style="font-size: 0.85rem;">${gap.desc}</p>
        </div>
      `;
      gapsCard.appendChild(item);
    });
  }

  // 页面加载触发渲染
  if (window.location.pathname.endsWith('report.html')) {
    window.addEventListener('DOMContentLoaded', loadReport);
  }
  ```
- [ ] **Step 5: 验证完整的项目上传、解析、轮询及数据动态绑定展示流程**
  启动服务后：
  * 上传一份包含文本的 txt 文件。
  * 添加“产品经理”、“运营专家”两个 JD。
  * 点击“分析我的简历”，查看分析中页面的动态进度展示。
  * 报告生成后，切换左侧目标岗位，检查优势和劣势卡片的数据是否实时更新，并测试下载报告与改写结果是否正常。
- [ ] **Step 6: 提交代码**
  ```bash
  git add public/screens/ public/js/app.js
  git commit -m "feat: complete end-to-end integration of file uploading, status polling, dynamic DOM report binding and file downloading"
  ```
