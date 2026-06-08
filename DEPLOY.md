# 「见历」AI 简历分析与优化系统 部署与配置文档

版本：v1.0.0  
日期：2026-06-08  
适用范围：`Express` 后端服务、原生 `Vanilla JS` 前端、七牛云 MaaS 平台集成。

---

## 1. 当前部署边界

当前项目按以下边界部署：

- **核心功能**：支持求职者简历深度诊断（完整度、清晰度、经历质量、关键词）、岗位 JD 精准匹配、Before → After 改进建议以及优化版简历草稿生成。
- **静态资源托管**：前端采用原生 HTML5 + CSS3 + Vanilla JavaScript，由后端 Express 服务统一进行静态托管（`public` 目录）。
- **文件解析服务**：服务端集成 `pdf-parse` 与 `mammoth` 库，直接在内存中解析 PDF 和 DOCX 文本，无需额外配置独立的 OCR 或解析服务。
- **AI 简历分析**：对接七牛云 MaaS 平台（兼容 OpenAI SDK 规范），采用异步队列机制（由 `setTimeout` 模拟的轻量后台任务），支持 QINIU_API_KEY 未配置时的 Mock 数据降级。
- **积分与计费**：系统通过用户注册赠送积分、扣减积分来限制 AI 调用频次，尚未接入第三方商业支付接口。

---

## 2. 推荐生产拓扑

```text
浏览器（前端页面）
  |
  | HTTPS (443)
  v
JianLi.chaunceychi.fun
  |
  | Nginx 反向代理
  v
Express App:3005
  |
  |-- SQLite 3 (database.db)
  |-- 七牛云 MaaS (api.qnaigc.com/v1)
```

生产环境建议：

- 客户端仅能通过 `https://JianLi.chaunceychi.fun` 访问系统，不直接将应用监听的 `3005` 端口暴露到公网。
- 考虑到本服务器的 `3000` 和 `3222` 端口已被其他应用占用，项目默认的开发与部署端口统一调整为 **`3005`**。
- Nginx 负责 HTTPS 证书卸载、静态资源缓存和安全控制。
- 本地数据库采用 SQLite（WAL 模式），数据保存在服务器本地。

---

## 3. 服务器准备

### 3.1 基础要求

建议最低配置：

```text
CPU: 1 核 (推荐 2 核以上)
内存: 2 GB (推荐 4 GB)
系统盘: 20 GB 起
系统: Ubuntu 22.04 LTS 或 Windows Server 2022
Node.js: v18.0.0 或更高版本
```

> [!NOTE]
> `better-sqlite3` 包含原生 C++ 绑定。在部署时，Node.js 的运行版本必须与模块编译时的版本一致。如果遇到绑定错误，需在目标服务器上重新运行 `npm rebuild better-sqlite3`。

### 3.2 域名与备案

生产环境需要准备：

```text
访问域名: JianLi.chaunceychi.fun
备案: 中国内地服务器需要 ICP 备案
HTTPS 证书: 必须有效，建议使用 Let's Encrypt 证书
```

### 3.3 服务器安全组

公网入站建议只开放：

```text
22/tcp   SSH 服务 (仅限运维 IP)
80/tcp   HTTP 服务 (用于自动跳转 HTTPS)
443/tcp  HTTPS 服务 (用户访问入口)
```

不要向公网开放：

```text
3005/tcp  Express 内部监听端口
```

---

## 4. 后端部署

### 4.1 上传代码

在服务器上准备部署目录（例如 Linux 系统）：

```bash
mkdir -p /opt/JianLi
cd /opt/JianLi
```

将项目文件上传至该目录下。如果使用 Git，建议：

```bash
git clone https://github.com/<your-org>/JianLi.git /opt/JianLi
```

### 4.2 配置环境变量

在项目根目录下，复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
nano .env
```

配置内容如下：

```dotenv
# 服务监听端口
# 注意：3000 和 3222 端口在部署机器上已被占用，默认已配置为 3005
PORT=3005

# Session 加密密钥
# 生产环境必须替换为强随机字符串（至少 32 位）
SESSION_SECRET=your_strong_random_session_secret_here

# 七牛云 MaaS API Key
# 留空时系统自动启用 Mock 降级模式（返回预设示例数据）
QINIU_API_KEY=your_qiniu_ai_api_key_here

# 七牛云 MaaS 使用的模型名称
# 默认值：deepseek-v3
QINIU_MODEL=deepseek-v3
```

### 4.3 方式一：PM2 直接部署 (推荐 VPS 环境)

**1. 安装 Node.js 18+**

```bash
# 使用 nvm 安装 Node.js 18
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

**2. 安装项目依赖**

```bash
cd /opt/JianLi
npm install --production
```

**3. 安装并配置 PM2 进程管理器**

```bash
npm install -g pm2
pm2 start server.js --name JianLi
pm2 save
pm2 startup
```

**4. 验证服务启动**

```bash
pm2 status
curl http://127.0.0.1:3005/api/auth/status
```

### 4.4 方式二：Docker 容器化部署

**1. 编写 Dockerfile**

在项目根目录下，创建 [Dockerfile](file:///d:/Projects/JianLi/Dockerfile)：

```dockerfile
FROM node:18-alpine

# 安装 better-sqlite3 编译所需的依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# 移除本地 .env 依赖，运行时通过命令行参数或 Compose 传入
RUN rm -f .env

EXPOSE 3005
CMD ["node", "server.js"]
```

**2. 编写 docker-compose.yml**

在项目根目录下，创建 [docker-compose.yml](file:///d:/Projects/JianLi/docker-compose.yml)：

```yaml
version: '3.8'

services:
  jianli:
    build: .
    ports:
      - "3005:3005"
    environment:
      - PORT=3005
      - SESSION_SECRET=your_strong_random_session_secret_here
      - QINIU_API_KEY=your_qiniu_ai_api_key_here
      - QINIU_MODEL=deepseek-v3
    volumes:
      - jianli_data:/app
    restart: unless-stopped

volumes:
  jianli_data:
```

**3. 启动容器**

```bash
docker compose up -d --build
```

---

## 5. Nginx 与 HTTPS 配置

### 5.1 安装 Nginx

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 5.2 配置反向代理

编辑站点配置文件：

```bash
sudo nano /etc/nginx/sites-available/jianli
```

写入以下配置：

```nginx
server {
    listen 80;
    server_name JianLi.chaunceychi.fun;

    # 限制文件上传大小为 5MB (与 Multer 限制一致)
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用站点配置并重启 Nginx：

```bash
sudo ln -s /etc/nginx/sites-available/jianli /etc/nginx/sites-enabled/jianli
sudo nginx -t
sudo systemctl reload nginx
```

### 5.3 配置 HTTPS 证书

推荐使用 Certbot 获取 Let's Encrypt 免费证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d JianLi.chaunceychi.fun
```

---

## 6. API 接口说明

所有接口的请求前缀均为 `/api`，数据交互格式为 JSON。

### 6.1 认证类接口

#### `GET /api/auth/status`
- **功能**：查询当前 Session 的登录状态与可用积分。
- **响应 (已登录)**：
  ```json
  {
    "loggedIn": true,
    "email": "user@example.com",
    "credits": 80,
    "free_attempts": 0
  }
  ```

#### `POST /api/auth/register`
- **功能**：注册新用户（默认赠送 100 积分）。
- **请求体**：
  ```json
  { "email": "user@example.com", "password": "your_password" }
  ```
- **响应**：
  ```json
  { "success": true, "credits": 100 }
  ```

#### `POST /api/auth/login`
- **功能**：用户登录。
- **请求体**：
  ```json
  { "email": "user@example.com", "password": "your_password" }
  ```
- **响应**：
  ```json
  { "success": true, "credits": 80 }
  ```

#### `POST /api/auth/logout`
- **功能**：登出并销毁 Session。
- **响应**：
  ```json
  { "success": true }
  ```

---

### 6.2 分析类接口

#### `POST /api/analyze/upload`
- **功能**：上传简历文件并提交岗位 JD，触发后台 AI 异步分析。
- **格式**：`multipart/form-data`
- **参数**：
  - `resume` (File, 必填)：支持 .pdf, .docx, .txt, .md 文件，且大小不超过 5MB。
  - `jds` (String, 可选)：JSON 数组格式的岗位 JD，例如：
    ```json
    [
      { "title": "产品经理", "description": "负责产品规划..." }
    ]
    ```
- **响应**：
  ```json
  { "success": true, "recordId": "550e8400-e29b-41d4-a716-446655440000" }
  ```

#### `GET /api/analyze/status/:recordId`
- **功能**：查询指定记录的分析状态与结果。
- **状态说明**：
  - `pending`：排队中
  - `processing`：分析正在进行
  - `completed`：分析成功，`result` 字段携带分析详情 JSON
  - `failed`：分析失败
- **响应 (已完成)**：
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
      "verdict_30s": "简历匹配度高，具备丰富经验...",
      "jobs": [...],
      "issues": [...],
      "optimized_resume_text": "..."
    }
  }
  ```

#### `GET /api/analyze/download/report/:recordId`
- **功能**：下载 Markdown 格式的简历评估诊断报告。
- **文件响应**：`analysis-report-{recordId}.md`

#### `GET /api/analyze/download/docx/:recordId`
- **功能**：下载 TXT 格式的 AI 优化后简历草稿。
- **文件响应**：`optimized-resume-{recordId}.txt`

---

## 7. 数据库设计

系统内置 SQLite 数据库，主文件保存在根目录下的 `database.db`，开启 WAL (Write-Ahead Logging) 模式以提高并发读写性能。

### 7.1 `users` 用户表

| 字段名 | 类型 | 属性 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 用户唯一 ID |
| `email` | TEXT | UNIQUE NOT NULL | 登录邮箱 |
| `password` | TEXT | NOT NULL | 格式为 `{salt}:{pbkdf2_hash}` |
| `credits` | INTEGER | DEFAULT 100 | 积分余额 |
| `free_attempts`| INTEGER | DEFAULT 3 | 匿名用户免费试用次数限制 |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | 注册时间 |

### 7.2 `analysis_records` 分析记录表

| 字段名 | 类型 | 属性 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | 分析记录 UUID |
| `user_id` | INTEGER | FOREIGN KEY REFERENCES `users(id)` | 关联用户 ID (匿名用户为 NULL) |
| `session_id` | TEXT | - | 匿名用户绑定的 Session ID |
| `resume_filename`| TEXT| NOT NULL | 上传的简历文件名 |
| `resume_text` | TEXT | NOT NULL | 简历解析出的文本内容 |
| `job_description_json`| TEXT| - | 提交的岗位 JD (JSON 字符串) |
| `analysis_result_json`| TEXT| - | 大模型分析结果 (JSON 字符串) |
| `status` | TEXT | DEFAULT 'pending' | 分析状态 (pending/processing/completed/failed) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | 记录创建时间 |

---

## 8. 积分计费规则

为防止系统被恶意高频调用，系统采用积分制度限制大模型调用资源：

| 用户类型 | 每次调用扣减积分规则 | 默认积分/频次 |
| :--- | :--- | :--- |
| **注册用户** | `10 积分（基础简历诊断）+ 10 积分 × JD 数量` | 注册赠送 100 积分 |
| **匿名用户** | 免费试用 3 次（基于 Express Session） | Session 失效后重置 |

### 积分扣减保障机制

- 积分扣减与分析记录的创建包装在 SQLite 的 **原子事务** 中，文件解析失败或系统崩溃不会误扣减用户积分。
- 扣减积分时通过 `UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?` 约束，从数据库底层杜绝积分超扣漏洞。

---

## 9. 七牛云 MaaS 接入指南

系统集成七牛云大模型平台进行简历文本诊断与改写。

### 9.1 获取 API 密钥

1. 登录 [七牛云控制台](https://portal.qiniu.com/)。
2. 导航至 **MaaS 平台**。
3. 创建新应用并复制生成的 API Key，配置到服务器的 `.env` 中。

### 9.2 支持的模型列表

| 模型标识 | 场景建议 |
| :--- | :--- |
| `deepseek-v3` | (默认推荐) 通用性能强，中文处理极佳，性价比高 |
| `glan-metadata-analysis-v1` | 简历结构化深度提取专用模型 |

### 9.3 接入标准

接口遵循 OpenAI 标准格式进行封装，基准地址为：`https://api.qnaigc.com/v1`。
在调用大模型时，指定 `response_format: { type: 'json_object' }` 以实现确定性 JSON 报文输出，后台同时挂载有 JSON 净化容错模块，确保解析稳定性。

---

## 10. 运行测试

系统集成了一套完整的端到端自动化测试，覆盖数据库 CRUD 逻辑、身份鉴权、上传解析及 Mock 降级。

### 10.1 本地测试执行

测试运行在相互隔离的临时数据库中，测试完成后自动销毁。

**Windows (PowerShell)**:
```powershell
$env:NODE_ENV="test"; node --test --test-concurrency=1 tests/database.test.js tests/auth.test.js tests/analyze.test.js
```

**Linux / macOS**:
```bash
NODE_ENV=test node --test --test-concurrency=1 tests/database.test.js tests/auth.test.js tests/analyze.test.js
```

> [!WARNING]
> 测试运行时需要保证测试并发数 `--test-concurrency=1`，以防 SQLite 临时文件产生并发锁争抢。测试默认分别占用 `3001` 与 `3002` 端口，避免了与主端口的冲突。

---

## 11. 上线前检查清单

### 11.1 服务器与网络环境

- [ ] 域名解析配置正确，HTTPS 证书在有效期内。
- [ ] 无法从外网直接访问服务器的 `3005` 端口（安全组策略生效）。
- [ ] 反向代理能够正常代理 `/` 及 `/api/*`。
- [ ] Nginx 配置文件上传大小限制已调至 `5m`。

### 11.2 应用与数据库

- [ ] 已经完成了 `npm install` 且无原生模块编译报错。
- [ ] `.env` 文件中的 `SESSION_SECRET` 已变更为 32 位强随机字符串。
- [ ] 启动端口已显式设定为 `3005`，避免了 `3000` 和 `3222` 端口的占用冲突。
- [ ] 如果对接了真实的七牛云，检查 `QINIU_API_KEY` 是否有效。
- [ ] 数据库文件 `database.db` 的读写权限限制为仅 Node.js 运行用户可读写。

---

## 12. 运维命令

### 12.1 服务监控

```bash
# 查看 PM2 运行状态
pm2 status JianLi

# 查看实时日志
pm2 logs JianLi
```

### 12.2 数据备份 (SQLite WAL)

由于 SQLite 支持热备份，可直接复制数据库文件：

```bash
# 每日定时任务备份示例
cp /opt/JianLi/database.db /opt/JianLi/backups/database-$(date +%F).db
```

### 12.3 服务热重启

```bash
pm2 reload JianLi
```

---

## 13. 常见问题排查

### Q1: 启动时报 `better-sqlite3.node was compiled against a different Node.js version`
**原因**：Node.js 版本更新或在不同环境中移动了 `node_modules`。  
**解决**：在部署路径下执行 `npm rebuild better-sqlite3`。

### Q2: 上传简历后，分析状态长久处于 `processing` 且不更新
**排查**：
1. 检查服务器 `.env` 中的 `QINIU_API_KEY` 是否填写正确且额度充足。
2. 查看 PM2 日志中是否有 `[Task 5 Error]` 开头的网络超时日志，确保服务器能连通七牛云 API 地址。

### Q3: 解析 PDF 时报告为空或出错
**原因**：上传的 PDF 简历为纯扫描图片 PDF。  
**解决**：系统通过 `pdf-parse` 读取字符层，不支持 OCR。建议用户上传电子版 PDF、DOCX 或 Markdown 简历文件。

### Q4: Windows 环境下测试报错 `SQLITE_BUSY: database is locked`
**原因**：SQLite 不支持多进程高并发写冲突。  
**解决**：运行测试时必须附带 `--test-concurrency=1` 参数以保证串行化执行。

---

## 14. 上线前必须补齐项

1. **Session 存储适配**：当前系统默认使用 `MemoryStore`（内存存储）保存 Session。在生产环境中，若使用多进程（如 PM2 cluster 模式）部署，必须将 Session 存储替换为 Redis（使用 `connect-redis`）以保持会话共享。
2. **七牛云 Key 正式申请**：切勿将测试 Key 部署于正式服务器上。
3. **UGC 敏感词过滤**：由于简历与岗位描述允许自由文本录入，正式上线前需挂载安全文本净化拦截，以防政治、色情、暴力等违规内容流入大模型。

---

## 15. 参考链接

- 七牛云 MaaS 平台官方文档: [https://developer.qiniu.com/](https://developer.qiniu.com/)
- Node.js 官方文档: [https://nodejs.org/docs/](https://nodejs.org/docs/)
- PM2 官方文档: [https://pm2.keymetrics.io/](https://pm2.keymetrics.io/)
- Nginx 反向代理配置最佳实践: [https://nginx.org/en/docs/](https://nginx.org/en/docs/)
