import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import crypto from 'crypto';
import path from 'path';
import { initDb, registerUser, loginUser, getUserCredits, deductCreditsAndCreateRecord, updateRecord, getRecord } from './database.js';
import { defaultMockResult } from './mockData.js';
import { OpenAI } from 'openai';

export const parsers = {
  pdf: (buffer) => pdfParse(buffer).then(p => p.text),
  docx: (buffer) => mammoth.extractRawText({ buffer }).then(p => p.value)
};

dotenv.config();

// 如果是在主应用模式下运行，则初始化真实数据库
if (process.env.NODE_ENV !== 'test') {
  initDb();
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('resume');

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
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
  req.session.user = { ...result, email };
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

function triggerBackgroundAnalysis(recordId) {
  console.log(`[Task 5 Trigger] Started background analysis for record: ${recordId}`);
  setTimeout(async () => {
    try {
      updateRecord(recordId, 'processing', null);

      const record = getRecord(recordId);
      if (!record) {
        console.error(`[Task 5 Error] Record not found: ${recordId}`);
        return;
      }

      const apiKey = process.env.QINIU_API_KEY;
      if (!apiKey) {
        console.log(`[Task 5 Fallback] QINIU_API_KEY not found. Using fallback mock data with 2 seconds delay.`);
        setTimeout(() => {
          try {
            updateRecord(recordId, 'completed', JSON.stringify(defaultMockResult));
            console.log(`[Task 5 Fallback] Mock analysis completed for record: ${recordId}`);
          } catch (err) {
            console.error(`[Task 5 Fallback Error] Failed to update mock result: ${err.message}`);
            updateRecord(recordId, 'failed', JSON.stringify({ error: err.message }));
          }
        }, 2000);
        return;
      }

      console.log(`[Task 5 LLM] Starting real LLM analysis for record: ${recordId} using Qiniu MaaS.`);
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://api.qnaigc.com/v1'
      });

      const resumeText = record.resume_text;
      const jds = record.job_description_json;

      const systemPrompt = `你是一个专业的简历分析与优化专家。
请根据用户提供的简历内容，以及待匹配的岗位 JD（Job Descriptions）进行深度分析。
你必须提供：
1. 整体匹配得分（overall_score, 0-100）。
2. 四个维度的能力得分（stats，包含 content_integrity, expression_clarity, experience_quality, keyword_coverage，每个 0-100）。
3. 30秒一句话总评（verdict_30s），客观概括优势与不足。
4. 岗位匹配度及优势/差距分析（jobs，针对每个 JD 提供匹配度 match_rate，以及优势 advantages 和差距 gaps，每个优势/差距包含 title 和 desc，并且注意：jobs 的每一项需要有一个 key，对应分析的岗位标识，如 pm, op 等）。
5. 针对简历中问题的量化建议与硬伤规避建议（issues），以 Before -> After 对比形式展示改进建议，每项包含 title, impact, before, after。
6. 优化后的简历片段草稿文本（optimized_resume_text）。

请注意：
- 必须遵循以下 JSON schema 进行返回，且返回的内容必须是纯 JSON，不要包含 any markdown 格式的标记（例如不要包裹 \`\`\`json ... \`\`\` 等）。
- 必须包含量化建议、硬伤规避、匹配逻辑。

JSON Schema 结构举例：
{
  "overall_score": 85,
  "stats": {
    "content_integrity": 95,
    "expression_clarity": 80,
    "experience_quality": 88,
    "keyword_coverage": 72
  },
  "verdict_30s": "一句话总评",
  "jobs": [
    {
      "key": "岗位标识(如pm)",
      "title": "岗位名称",
      "match_rate": 85,
      "advantages": [
        { "title": "优势标题", "desc": "具体描述" }
      ],
      "gaps": [
        { "title": "劣势标题", "desc": "具体描述" }
      ]
    }
  ],
  "issues": [
    {
      "title": "问题标题",
      "impact": "产生的影响",
      "before": "优化前的描述",
      "after": "优化后的描述"
    }
  ],
  "optimized_resume_text": "优化后的简历片段草稿文本"
}`;

      const userPrompt = `简历原文：
${resumeText}

岗位 JD 信息 (JSON 格式)：
${jds}`;

      const response = await openai.chat.completions.create({
        model: process.env.QINIU_MODEL || 'glan-metadata-analysis-v1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2
      });

      const aiResponse = response.choices[0].message.content.trim();
      
      try {
        JSON.parse(aiResponse);
        updateRecord(recordId, 'completed', aiResponse);
        console.log(`[Task 5 LLM] LLM analysis completed for record: ${recordId}`);
      } catch (parseErr) {
        console.error(`[Task 5 LLM Error] AI returned invalid JSON: ${aiResponse}`, parseErr);
        let cleanResponse = aiResponse;
        if (cleanResponse.startsWith('```')) {
          cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        }
        try {
          JSON.parse(cleanResponse);
          updateRecord(recordId, 'completed', cleanResponse);
          console.log(`[Task 5 LLM] LLM analysis completed (after extracting JSON) for record: ${recordId}`);
        } catch (e) {
          throw new Error(`AI 返回的内容不是合法的 JSON 格式。原始输出: ${aiResponse}`);
        }
      }
    } catch (err) {
      console.error(`[Task 5 Error] Background analysis failed for record: ${recordId}`, err);
      updateRecord(recordId, 'failed', JSON.stringify({ error: err.message }));
    }
  }, 50);
}

// 5. 简历上传与分析初始化路由
app.post('/api/analyze/upload', (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: '文件大小不能超过 5MB' });
      }
      return res.status(400).json({ success: false, message: `上传错误: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ success: false, message: '文件上传失败' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '未找到上传的简历文件' });
  }

  // 解析 JDs
  let jds = [];
  if (req.body.jds) {
    try {
      jds = JSON.parse(req.body.jds);
    } catch (e) {
      return res.status(400).json({ success: false, message: '无效的 job descriptions 格式' });
    }
  }
  if (!Array.isArray(jds)) {
    return res.status(400).json({ success: false, message: 'job descriptions 必须是数组' });
  }

  // 1. 先校验额度是否充足 (先不实际扣减)
  const requiredCredits = 10 + jds.length * 10;
  if (req.session.user) {
    const userId = req.session.user.userId;
    const currentCredits = getUserCredits(userId);
    if (currentCredits < requiredCredits) {
      return res.status(403).json({ success: false, message: '积分不足' });
    }
  } else {
    if (!req.session.free_attempts || req.session.free_attempts <= 0) {
      return res.status(403).json({ success: false, message: '免费额度已达上限' });
    }
  }

  // 2. 提取文本（PDF/Word/Text）
  let resumeText = '';
  const ext = path.extname(req.file.originalname).toLowerCase();
  try {
    if (ext === '.pdf') {
      resumeText = await parsers.pdf(req.file.buffer);
    } else if (ext === '.docx') {
      resumeText = await parsers.docx(req.file.buffer);
    } else {
      resumeText = req.file.buffer.toString('utf-8');
    }
  } catch (parseErr) {
    return res.status(400).json({ success: false, message: '解析文件失败: ' + parseErr.message });
  }

  // 校验解析出的文本是否为空
  if (!resumeText || !resumeText.trim()) {
    return res.status(400).json({ success: false, message: '解析出的简历文本为空' });
  }

  // 3. 文本解析成功后，执行实际扣减操作与创建记录（原子化）
  const recordId = crypto.randomUUID();
  const userId = req.session.user ? req.session.user.userId : null;
  const sessionId = req.sessionID;
  const filename = req.file.originalname;

  if (userId) {
    const result = deductCreditsAndCreateRecord(userId, requiredCredits, recordId, sessionId, filename, resumeText, JSON.stringify(jds));
    if (!result.success) {
      if (result.error === 'INSUFFICIENT_CREDITS') {
        return res.status(403).json({ success: false, message: '积分不足' });
      }
      return res.status(500).json({ success: false, message: '创建分析记录失败: ' + result.error });
    }
  } else {
    // 未登录用户
    req.session.free_attempts -= 1;
    const result = deductCreditsAndCreateRecord(null, 0, recordId, sessionId, filename, resumeText, JSON.stringify(jds));
    if (!result.success) {
      req.session.free_attempts += 1; // 恢复额度
      return res.status(500).json({ success: false, message: '创建分析记录失败: ' + result.error });
    }
  }

  // 4. 启动后台分析并返回
  triggerBackgroundAnalysis(recordId);

  return res.json({ success: true, recordId });
});

// 6. 简历分析状态查询路由
app.get('/api/analyze/status/:recordId', (req, res) => {
  const { recordId } = req.params;
  const record = getRecord(recordId);
  if (!record) {
    return res.status(404).json({ success: false, message: '未找到该分析记录' });
  }
  res.json({
    success: true,
    status: record.status,
    result: record.analysis_result_json ? JSON.parse(record.analysis_result_json) : null
  });
});

// 托管静态文件 (将 public 目录作为静态托管)
app.use(express.static('public'));

// 启动服务 (仅在非测试环境下监听端口)
if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

export default app;
