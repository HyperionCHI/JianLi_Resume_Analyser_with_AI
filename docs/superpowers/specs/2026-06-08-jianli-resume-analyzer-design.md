# 「见历」AI 简历分析与优化系统 - 技术设计文档 (Spec)

## 1. 项目简介与功能目标
「见历」是一款面向求职者的 AI 简历分析与优化工具。用户可以上传简历、输入目标岗位的 JD。系统提供两种分析模式：
1. **常规分析**（无 JD 时）：分析简历结构、完整度、表达清晰度、给出修改建议及改写草稿。
2. **岗位匹配分析**（有 JD 时）：计算简历与目标岗位的匹配度百分比、提炼匹配优势、诊断缺失技能、提供针对该岗位的改写示例。

---

## 2. 系统架构与目录结构
本系统采用 **前后端分离 + 客户端 Vanilla JS 动态渲染** 的设计方案，使原本的 HTML 原型页面无缝接入真实的后台服务，同时确保原型设计的视觉样式完全不受破坏。

```text
d:\Project\Resume\ (根目录)
├── package.json          # 后端 Node.js 依赖 (Express, sqlite3, multer, pdf-parse, mammoth, dotenv, openai)
├── .env                  # 环境配置文件 (存放端口、七牛云 API KEY、默认大模型等)
├── server.js             # Express 服务入口文件 (处理上传、分析及用户相关接口)
├── database.js           # SQLite 数据库连接与初始化逻辑
├── database.db           # SQLite 数据库文件 (自动生成)
├── docs/                 # 开发设计文档
│   └── superpowers/specs/2026-06-08-jianli-resume-analyzer-design.md
├── public/               # 静态资源根目录 (Express 自动托管此文件夹)
│   ├── css/
│   │   └── styles.css    # 核心样式文件
│   ├── screens/          # 静态 HTML 界面
│   │   ├── landing.html  # 首页（简历上传、岗位输入、登录、积分提示）
│   │   ├── analysis.html # 分析等待页（步骤进度展示）
│   │   └── report.html   # 分析结果报告页（评分展示、多岗位切换、下载）
│   ├── js/
│   │   ├── auth.js       # 处理登录/注册模态框、免费额度与积分显示
│   │   └── app.js        # 处理文件上传、分析状态轮询、报告数据的动态绑定渲染
│   └── logo.png         # Logo 图片
```

---

## 3. 数据库设计 (SQLite)
数据库采用轻量级的 SQLite，包含 `users` 和 `analysis_records` 两张表，用于对用户积分进行扣减、管理以及保存分析历史记录。

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  credits INTEGER DEFAULT 100,            -- 注册后赠送 100 积分
  free_attempts INTEGER DEFAULT 3,        -- 未登录时的免费分析额度 (3次)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 简历分析记录表
CREATE TABLE IF NOT EXISTS analysis_records (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id INTEGER,                        -- 登录用户 ID (可为空)
  session_id TEXT,                        -- 未登录用户的临时会话 ID
  resume_filename TEXT NOT NULL,          -- 上传的文件名称
  resume_text TEXT NOT NULL,              -- 解析出的简历文本内容
  job_description_json TEXT,              -- 存储的岗位信息 JSON (标题与 JD)
  analysis_result_json TEXT,              -- AI 返回的结构化分析 JSON 报告
  status TEXT DEFAULT 'pending',          -- pending, processing, completed, failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 4. API 接口设计

### 4.1 认证模块 (Auth)
* **`POST /api/auth/register`**: 用户注册
  * 参数: `email`, `password`
  * 逻辑: 插入新用户，密码进行安全哈希，自动赋予 100 积分，并在会话中标记登录。
* **`POST /api/auth/login`**: 用户登录
  * 参数: `email`, `password`
  * 逻辑: 校验用户密码，建立会话。
* **`POST /api/auth/logout`**: 退出登录
* **`GET /api/auth/status`**: 获取当前用户的登录状态与可用余额。返回 JSON:
  ```json
  {
    "loggedIn": true,
    "email": "user@example.com",
    "credits": 100,
    "free_attempts": 3
  }
  ```

### 4.2 分析模块 (Analyze)
* **`POST /api/analyze/upload`**: 简历上传与启动异步分析
  * 请求类型: `multipart/form-data`
  * 参数: 
    * `resume` (file): PDF/DOCX/TXT 文件
    * `jds` (string): JSON 字符串，例如 `[{"title": "产品经理", "jd": "..."}]`
  * 逻辑:
    1. 判断用户权限与积分是否足够：
       * 已登录：计算扣减分值 (基础 10 点 + 每多一个岗位 JD 10 点)。不足则返回 403。
       * 未登录：校验免费剩余次数。不足则提示登录。
    2. 使用 `pdf-parse` (针对 PDF) 或 `mammoth` (针对 DOCX) 在内存中将上传的文件解析为纯文本 `resume_text`。如果是文本文件则直接读取。
    3. 插入 `analysis_records`，初始状态为 `pending`。
    4. 若为已登录用户，相应扣减积分；若为未登录用户，相应扣减其免费次数。
    5. 启动异步分析任务（不阻塞当前请求），调用七牛云大模型服务，并向客户端返回创建成功的 `recordId`。
* **`GET /api/analyze/status/:recordId`**: 轮询分析结果
  * 逻辑: 返回该记录的状态。状态为 `completed` 时，一并返回由七牛云大模型生成的结构化 `analysis_result_json`。
* **`GET /api/analyze/history`**: 获取用户的分析报告历史列表。

### 4.3 下载模块 (Download)
* **`GET /api/analyze/download/report/:recordId`**: 下载排版美观的简历分析 PDF 或 Markdown 报告。
* **`GET /api/analyze/download/docx/:recordId`**: 下载 AI 优化改写后的 Word (.docx) 格式简历。

---

## 5. AI 分析流程与 Prompt 设计

### 5.1 接入七牛云 API
* **接口基础域名**: `https://api.qnaigc.com/v1/chat/completions` (兼容 OpenAI 规范)
* **调用模型**: 默认使用 `deepseek-v3` 或 `qwen-max` 等大模型。
* **密钥配置**: 从 `.env` 文件的 `QINIU_API_KEY` 获取。
* **优雅降级 (Mock Fallback)**: 假如未配置 `QINIU_API_KEY`，系统将自动读取预设的 Mock 分析数据写入数据库，防止系统报错中断，方便无 Key 的本地开发和演示。

### 5.2 Prompt 构建规则
系统在分析时读取 `resume-optimizer/SKILL.md` 的核心原则：
* **量化成果**：将平淡的职责描述改写为 STAR 公式结构 (情境-任务-行动-结果) 以及“动作 + 产物 + 结果”表达式。
* **规避雷区 (Red Flags)**：审查并标记频繁跳槽、技术失真、项目单薄等问题。
* **强制 JSON 输出**：在 System Prompt 中定义严格的 JSON Schema 格式。

大模型输出的 JSON 结构需要完全对齐原型设计卡片：
```json
{
  "overall_score": 85,
  "stats": {
    "content_integrity": 95,
    "expression_clarity": 80,
    "experience_quality": 88,
    "keyword_coverage": 72
  },
  "verdict_30s": "您的简历与该岗位的核心要求高度匹配，但在项目量化结果和特定工具使用上仍有优化空间。",
  "jobs": [
    {
      "key": "pm",
      "title": "产品经理",
      "match_rate": 85,
      "advantages": [
        { "title": "行业背景契合", "desc": "您在电商行业的 3 年经验与该岗位高度契合。" },
        { "title": "核心技能覆盖", "desc": "简历中明确提到了产品规划、数据分析、原型设计等关键能力。" }
      ],
      "gaps": [
        { "title": "缺少 SQL 描述", "desc": "JD 要求熟练使用 SQL，您的简历中未体现数据查询与分析能力。" },
        { "title": "敏捷开发流程", "desc": "建议补充您在 Scrum/Agile 团队中的敏捷协作和迭代管理经验。" }
      ]
    }
  ],
  "issues": [
    {
      "title": "项目成果描述缺乏量化指标",
      "impact": "在“XX项目”描述中，您提到了“提升了用户体验”，建议使用具体数字体现，如“核心转化率提升 15%”。",
      "before": "负责产品优化，提升了用户活跃度。",
      "after": "负责核心功能迭代，通过 A/B 测试优化路径，带动日活 (DAU) 增长 12%，次日留存提升 5%。"
    }
  ],
  "optimized_resume_text": "...优化后的完整简历文本..."
}
```

---

## 6. 前端集成与动态渲染逻辑
1. **首页 (`landing.html`)**：
   * 页面加载时请求 `/api/auth/status`，判断是否登录。
   * 展示登录/注册模态框，并通过 JS 提交数据实现异步登录。
   * 实时统计当前填写的岗位卡片数量，按“基础 10 点 + 每岗位 10 点”动态计算本次分析需消耗的积分并在底部显示。
   * 上传文件后，通过 AJAX FormData 提交简历文件和岗位 JD。上传成功后存储返回的 `recordId` 并跳转到 `analysis.html?id=recordId`。
2. **分析等待页 (`analysis.html`)**：
   * 从 URL 获取 `id` 参数。
   * 使用 `setInterval` 向 `/api/analyze/status/:id` 发送 GET 请求轮询状态。
   * 动态控制页面中的步骤条（正在解析 -> 分析结构 -> 提取关键词 -> 匹配岗位 -> 生成建议）。每一阶段更新 UI 的对勾样式。
   * 分析完成 (`completed`) 后，将结果写入当前 Session 缓存并重定向至 `report.html?id=recordId`。
3. **分析结果页 (`report.html`)**：
   * 轮询完成后，从 `/api/analyze/status/:id` 获取详细的 JSON 报告。
   * 将 JSON 数据动态写入 DOM 节点：渲染评分圆环、渲染四项百分比条。
   * 根据 `jobs` 列表渲染目标岗位侧边栏 Tab 按钮。点击不同岗位时，通过事件绑定切换显示该岗位下的“优势”和“缺失能力”卡片。
   * 循环渲染问题诊断与修改对比面板。
   * 点击“下载分析报告”或“下载 AI 优化简历”按钮时，请求对应的下载 API。
