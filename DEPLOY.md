# 「见历」AI 简历分析与优化系统 — 部署文档

> 版本：v1.0.0 · 更新时间：2026-06-08

---

## 目录

1. [项目概览](#1-项目概览)
2. [系统架构](#2-系统架构)
3. [环境要求](#3-环境要求)
4. [本地开发部署](#4-本地开发部署)
5. [环境变量说明](#5-环境变量说明)
6. [API 接口文档](#6-api-接口文档)
7. [数据库设计](#7-数据库设计)
8. [积分计费规则](#8-积分计费规则)
9. [七牛云 MaaS 接入指南](#9-七牛云-maas-接入指南)
10. [运行测试](#10-运行测试)
11. [生产环境部署](#11-生产环境部署)
12. [常见问题排查](#12-常见问题排查)

---

## 1. 项目概览

「见历」是一款基于 AI 大语言模型的简历分析与优化 Web 应用，帮助求职者：

- **深度诊断**简历的内容完整度、表达清晰度、经历质量、关键词覆盖等四个维度
- **精准匹配**目标岗位 JD，提供匹配度评分、优势分析与差距识别
- **智能优化**给出 Before → After 对比式改写建议，并生成优化版简历草稿
- **一键下载** Markdown 格式分析报告与 TXT 格式优化版简历

### 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | 原生 HTML5 + CSS3 + Vanilla JavaScript（ES Modules） |
| 后端 | Node.js 18+ + Express 4 |
| 数据库 | SQLite 3（`better-sqlite3`，WAL 模式） |
| 认证 | `express-session`（服务端 Session，MemoryStore） |
| 文件解析 | `pdf-parse`（PDF）、`mammoth`（DOCX）、原生 Buffer（TXT/MD） |
| AI 集成 | 七牛云 MaaS（OpenAI 兼容接口）/ Mock 降级 |
| 文件上传 | `multer`（内存存储，限制 5MB） |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────┐
│                   浏览器（前端）                   │
│  landing.html → analysis.html → report.html      │
│  auth.js（认证状态管理 + 登录/注册 Modal）          │
└──────────────────┬──────────────────────────────┘
                   │ HTTP（Fetch API）
┌──────────────────▼──────────────────────────────┐
│               Express 服务（server.js）           │
│                                                   │
│  /api/auth/*     认证接口（注册/登录/登出/状态）    │
│  /api/analyze/*  分析接口（上传/状态查询/下载）     │
│  /public/*       静态文件托管                      │
└──────┬──────────────────────┬────────────────────┘
       │                      │
┌──────▼──────┐    ┌──────────▼──────────────────┐
│  database.js │    │   七牛云 MaaS / Mock 降级     │
│  SQLite WAL  │    │   api.qnaigc.com/v1          │
│              │    │   （OpenAI 兼容规范）          │
└─────────────┘    └─────────────────────────────┘
```

### 用户完整流程

```
访问首页
  ↓
上传简历（PDF / DOCX / TXT / MD，≤5MB）
  + 可选：填写目标岗位 JD（每增加一个 +10 积分）
  ↓
后端解析文件文本（Multer → pdf-parse / mammoth）
  + 原子事务：扣减积分 & 创建待分析记录
  ↓
后台异步触发 AI 分析（triggerBackgroundAnalysis）
  - 有 QINIU_API_KEY → 调用真实大模型接口
  - 无 QINIU_API_KEY → 2 秒后返回 Mock 数据
  ↓
前端每 2 秒轮询 /api/analyze/status/:id
  ↓
分析完成 → 存入 sessionStorage → 跳转报告页
  ↓
报告页动态渲染（评分、四维指标、JD 匹配、改进建议）
  ↓
可选：下载 Markdown 报告 / TXT 优化版简历
```

---

## 3. 环境要求

| 依赖 | 最低版本 | 说明 |
|---|---|---|
| Node.js | **18.0.0** | 需要原生 `fetch`、`node:test`、ES Module 支持 |
| npm | 8.0.0+ | 随 Node.js 附带 |
| 操作系统 | Windows / macOS / Linux | 均已验证 |
| 磁盘空间 | ≥ 200 MB | 含 `node_modules` |

> **注意**：`better-sqlite3` 包含原生 C++ 绑定，Node.js 版本必须与编译版本一致。如遇绑定错误，运行 `npm rebuild better-sqlite3`。

---

## 4. 本地开发部署

### 步骤 1：克隆或进入项目目录

```bash
# 若通过 git 克隆
git clone <repository-url> jianli-resume
cd jianli-resume

# 若已有项目目录
cd d:\Project\Resume   # Windows
```

### 步骤 2：安装依赖

```bash
npm install
```

### 步骤 3：配置环境变量

```bash
# 将示例文件复制为实际配置文件
cp .env.example .env    # macOS / Linux
copy .env.example .env  # Windows
```

然后编辑 `.env`，参考[第 5 节](#5-环境变量说明)填写各字段。

### 步骤 4：启动服务

```bash
npm start
```

服务启动后访问：**http://localhost:3000**

```
Server is running at http://localhost:3000
```

### 项目文件结构

```
Resume/
├── server.js            # Express 服务入口，所有 API 路由
├── database.js          # SQLite 数据库层（CRUD + 事务）
├── mockData.js          # AI 分析 Mock 降级数据
├── package.json         # 依赖与脚本配置
├── .env                 # 本地环境变量（不提交 Git）
├── .env.example         # 环境变量模板
├── .gitignore
├── database.db          # SQLite 数据库文件（运行时自动生成）
├── public/              # 前端静态资源（由 Express 托管）
│   ├── index.html       # 根路径重定向到 landing.html
│   ├── logo.png
│   ├── css/
│   │   └── styles.css   # 全局设计系统样式
│   ├── js/
│   │   └── auth.js      # 前端认证状态管理模块
│   └── screens/
│       ├── landing.html # 首页（上传 + 登录/注册 Modal）
│       ├── analysis.html# 分析等待页（轮询状态）
│       └── report.html  # 报告详情页（动态渲染）
└── tests/               # 集成测试套件
    ├── database.test.js
    ├── auth.test.js
    └── analyze.test.js
```

---

## 5. 环境变量说明

编辑 `.env` 文件，所有字段说明如下：

```dotenv
# 服务监听端口
# 默认值：3000
PORT=3000

# Session 加密密钥
# 生产环境必须替换为强随机字符串（至少 32 位）
# 生成示例：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=your_strong_random_session_secret_here

# 七牛云 MaaS API Key
# 留空时系统自动启用 Mock 降级模式（返回预设示例数据）
# 申请地址：https://portal.qiniu.com/
QINIU_API_KEY=your_qiniu_ai_api_key_here

# 七牛云 MaaS 使用的模型名称
# 可选值：deepseek-v3、glan-metadata-analysis-v1 等
# 默认值：deepseek-v3
QINIU_MODEL=deepseek-v3
```

### Mock 降级模式

当 `QINIU_API_KEY` 为空时，系统进入 **Mock 降级模式**：

- 上传简历后，后台等待约 2 秒模拟 AI 处理延时
- 返回预设的示例分析结果（总评分 85 分，包含产品经理和运营专家两个岗位的匹配分析）
- 非常适合本地开发调试、UI 验证，无需消耗 API 额度

---

## 6. API 接口文档

所有 API 路径前缀：`/api`，响应格式均为 JSON。

---

### 认证接口

#### `GET /api/auth/status` — 获取认证状态

查询当前 Session 的登录状态与可用积分。

**响应示例（未登录）：**
```json
{
  "loggedIn": false,
  "email": null,
  "credits": 0,
  "free_attempts": 3
}
```

**响应示例（已登录）：**
```json
{
  "loggedIn": true,
  "email": "user@example.com",
  "credits": 80,
  "free_attempts": 0
}
```

---

#### `POST /api/auth/register` — 注册新用户

**请求体：**
```json
{ "email": "user@example.com", "password": "your_password" }
```

**成功响应（200）：**
```json
{ "success": true, "credits": 100 }
```

**失败响应（400）：**
```json
{ "success": false, "message": "该邮箱已被注册" }
```

> 密码使用 PBKDF2（SHA-512，1000 次迭代，16 字节随机盐）哈希存储。

---

#### `POST /api/auth/login` — 用户登录

**请求体：**
```json
{ "email": "user@example.com", "password": "your_password" }
```

**成功响应（200）：**
```json
{ "success": true, "credits": 100 }
```

**失败响应（400）：**
```json
{ "success": false, "message": "邮箱或密码错误" }
```

---

#### `POST /api/auth/logout` — 退出登录

无请求体。销毁当前 Session。

**响应：**
```json
{ "success": true }
```

---

### 分析接口

#### `POST /api/analyze/upload` — 上传并触发分析

**请求格式：** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `resume` | File | ✅ | 简历文件（PDF / DOCX / TXT / MD，≤ 5MB） |
| `jds` | String (JSON Array) | ❌ | 目标岗位列表，格式见下 |

`jds` 字段格式：
```json
[
  { "title": "产品经理", "description": "负责产品规划..." },
  { "title": "运营专家", "description": "负责用户增长..." }
]
```

**成功响应（200）：**
```json
{ "success": true, "recordId": "550e8400-e29b-41d4-a716-446655440000" }
```

**失败响应：**

| 状态码 | 原因 |
|---|---|
| 400 | 未上传文件 / 文件格式无法解析 / 文件超过 5MB / jds 格式错误 |
| 403 | 登录用户积分不足 / 匿名用户免费次数耗尽 |

---

#### `GET /api/analyze/status/:recordId` — 查询分析状态

**路径参数：** `recordId` — 上传接口返回的记录 ID

**响应示例（分析中）：**
```json
{
  "success": true,
  "status": "processing",
  "result": null
}
```

**响应示例（已完成）：**
```json
{
  "success": true,
  "status": "completed",
  "result": {
    "overall_score": 85,
    "stats": {
      "content_integrity": 95,
      "expression_clarity": 80,
      "experience_quality": 88,
      "keyword_coverage": 72
    },
    "verdict_30s": "您的简历与该岗位高度匹配...",
    "jobs": [...],
    "issues": [...],
    "optimized_resume_text": "..."
  }
}
```

**状态值说明：**

| status | 含义 |
|---|---|
| `pending` | 已创建记录，排队中 |
| `processing` | 后台 AI 分析正在进行 |
| `completed` | 分析完成，`result` 字段包含完整结果 |
| `failed` | 分析失败，`result.error` 包含错误信息 |

---

#### `GET /api/analyze/download/report/:recordId` — 下载 Markdown 分析报告

分析完成后可调用，返回 Markdown 格式的完整分析报告文件。

**响应头：**
```
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="analysis-report-{recordId}.md"
```

---

#### `GET /api/analyze/download/docx/:recordId` — 下载优化版简历

分析完成后可调用，返回 AI 生成的优化版简历文本。

**响应头：**
```
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment; filename="optimized-resume-{recordId}.txt"
```

---

## 7. 数据库设计

数据库使用 SQLite，文件路径为项目根目录的 `database.db`，启用 WAL 模式与外键约束。

### `users` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | 用户 ID |
| `email` | TEXT UNIQUE NOT NULL | 邮箱（登录凭证） |
| `password` | TEXT NOT NULL | `{salt}:{pbkdf2_hash}` 格式存储 |
| `credits` | INTEGER DEFAULT 100 | 积分余额（注册赠送 100 点） |
| `free_attempts` | INTEGER DEFAULT 3 | 匿名免费次数（Session 级管理） |
| `created_at` | DATETIME | 注册时间 |

### `analysis_records` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | UUID，上传时生成 |
| `user_id` | INTEGER FK | 关联 `users.id`，匿名用户为 NULL |
| `session_id` | TEXT | Express Session ID |
| `resume_filename` | TEXT NOT NULL | 原始文件名 |
| `resume_text` | TEXT NOT NULL | 解析出的简历纯文本 |
| `job_description_json` | TEXT | JD 列表（JSON 字符串） |
| `analysis_result_json` | TEXT | AI 分析结果（JSON 字符串） |
| `status` | TEXT DEFAULT 'pending' | 分析状态 |
| `created_at` | DATETIME | 创建时间 |

---

## 8. 积分计费规则

| 用户类型 | 每次分析消耗 |
|---|---|
| 注册用户 | `10 点（基础）+ 10 点 × JD 数量` |
| 匿名用户 | 免费 3 次（Session 级，服务重启后重置） |

**示例：**
- 不填 JD → 消耗 **10 点**
- 填写 2 个岗位 JD → 消耗 **30 点**（10 + 20）

**积分安全机制：**
- 积分扣减与记录创建使用 SQLite **原子事务**，确保解析失败时不扣分
- 使用 `UPDATE ... WHERE credits >= amount` 原子语句防止超扣

---

## 9. 七牛云 MaaS 接入指南

### 获取 API Key

1. 登录 [七牛云控制台](https://portal.qiniu.com/)
2. 进入 **AI/ML 服务** → **MaaS 平台**
3. 创建应用并复制 API Key

### 配置模型

在 `.env` 中设置：

```dotenv
QINIU_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
QINIU_MODEL=deepseek-v3
```

七牛云 MaaS 支持的模型（部分）：

| 模型名称 | 特点 |
|---|---|
| `deepseek-v3` | 推荐，性价比高，中文效果好 |
| `glan-metadata-analysis-v1` | 专用分析模型 |

### 接口规范

系统使用 OpenAI SDK 兼容调用，接口地址为：
```
https://api.qnaigc.com/v1
```

启用 `response_format: { type: 'json_object' }` 强制 JSON 输出，并内置 Markdown 代码块自动清理逻辑作为兼容保障。

---

## 10. 运行测试

项目包含完整的集成测试套件，覆盖数据库、认证、上传解析、AI Mock、状态轮询和下载接口。

### 运行全套测试

**Windows（PowerShell）：**
```powershell
$env:NODE_ENV="test"; npm test
```

**macOS / Linux：**
```bash
NODE_ENV=test npm test
```

### 测试结果参考

```
▶ Database Module Test Suite
  ✔ Register & Login User
  ✔ Get and Deduct Credits
  ✔ Create & Update Analysis Record
▶ Auth APIs Test Suite
  ✔ GET /api/auth/status - Check default state
  ✔ POST /api/auth/register - Create new user
  ✔ POST /api/auth/login - Auth check with credentials
  ...
▶ Upload & Analyze APIs Test Suite
  ✔ POST /api/analyze/upload - Upload text resume successfully
  ✔ GET /api/analyze/status/:recordId - Mock fallback analysis integration
  ✔ GET /api/analyze/download/report/:recordId - ...
  ...
pass 21
fail 0
```

### 注意事项

- 测试使用独立的临时数据库文件（`test_*.db`），测试结束后自动清理
- 测试必须以 `--test-concurrency=1` 顺序执行，避免端口与数据库文件冲突
- 测试环境会绕过真实 AI 接口调用，自动使用 Mock 降级

---

## 11. 生产环境部署

### 方式一：直接部署（Linux VPS / 云服务器）

**1. 安装 Node.js 18+**

```bash
# 使用 nvm（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**2. 上传项目文件**

建议仅上传以下文件（排除 `node_modules` 和 `database.db`）：

```
server.js, database.js, mockData.js, package.json,
.env.example, public/ 目录, tests/ 目录
```

**3. 生产配置**

```bash
cp .env.example .env
# 编辑 .env，设置强密码 SESSION_SECRET 和真实 QINIU_API_KEY
npm install --production
```

**4. 使用 PM2 管理进程**

```bash
npm install -g pm2
pm2 start server.js --name jianli
pm2 save
pm2 startup    # 设置开机自启
```

**5. Nginx 反向代理（可选）**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 文件上传大小限制（与应用层 5MB 保持一致）
    client_max_body_size 10m;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### 方式二：Docker 部署

**创建 `Dockerfile`：**

```dockerfile
FROM node:18-alpine

# 安装 better-sqlite3 原生依赖所需的编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# 不复制本地 .env，通过 -e 或 --env-file 传入
RUN rm -f .env

EXPOSE 3000
CMD ["node", "server.js"]
```

**构建与运行：**

```bash
docker build -t jianli-resume .
docker run -d \
  -p 3000:3000 \
  -e SESSION_SECRET=your_strong_secret \
  -e QINIU_API_KEY=your_api_key \
  -e QINIU_MODEL=deepseek-v3 \
  -v /data/jianli:/app \
  --name jianli \
  jianli-resume
```

---

### 生产环境安全建议

| 配置项 | 建议 |
|---|---|
| `SESSION_SECRET` | 使用 32 位以上随机字符串，禁止使用默认值 |
| `HTTPS` | 配合 Nginx + Let's Encrypt 启用 TLS |
| Session Cookie | 生产环境 `secure: true` 已内置，需配合 HTTPS |
| 数据库备份 | 定期备份 `database.db`（SQLite WAL 模式支持热备份） |
| Session 存储 | 高并发场景下考虑替换 MemoryStore 为 `connect-redis` |
| 文件上传 | Multer 已限制 5MB，生产环境可进一步收紧 Nginx `client_max_body_size` |

---

## 12. 常见问题排查

### Q1：启动时报 `better-sqlite3` 绑定错误

```
Error: The module '...better_sqlite3.node' was compiled against a different Node.js version
```

**解决：**
```bash
npm rebuild better-sqlite3
```

---

### Q2：分析一直停留在"分析中"不完成

**可能原因：**
1. `QINIU_API_KEY` 配置了错误的值，真实请求失败
2. 网络无法访问 `api.qnaigc.com`

**排查步骤：**
- 将 `.env` 中的 `QINIU_API_KEY` 置空，验证 Mock 模式是否正常
- 检查服务器日志中是否有 `[Task 5 Error]` 相关报错

---

### Q3：上传 PDF 解析文本为空

`pdf-parse` 仅支持含文本层的 PDF（文字版 PDF）。纯图片扫描版 PDF 无法解析。

**提示：** 建议用户上传 DOCX 格式以获得最佳解析效果。

---

### Q4：Windows 下测试失败，提示数据库文件被锁定

```
SQLITE_BUSY: database is locked
```

**解决：** 以顺序模式运行测试（已在 `package.json` 中配置）：

```bash
$env:NODE_ENV="test"; node --test --test-concurrency=1 tests/*.test.js
```

---

### Q5：修改前端文件后浏览器未更新

浏览器可能缓存了旧文件，强制刷新：
- Windows / Linux：`Ctrl + Shift + R`
- macOS：`Cmd + Shift + R`

---

### Q6：注册后积分显示不更新

导航栏积分由 `public/js/auth.js` 的 `initAuth()` 在页面加载时从 `/api/auth/status` 实时拉取。若显示不正确，请检查浏览器控制台是否有网络错误。

---

## 附录：快速命令参考

```bash
# 安装依赖
npm install

# 启动开发服务
npm start

# 运行全套测试（Windows PowerShell）
$env:NODE_ENV="test"; npm test

# 运行全套测试（macOS / Linux）
NODE_ENV=test npm test

# 查看服务日志（PM2）
pm2 logs jianli

# 重启服务（PM2）
pm2 restart jianli

# 备份数据库（SQLite WAL 模式热备）
cp database.db database.db.backup
```
