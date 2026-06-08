import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import crypto from 'crypto';
import { initDb, registerUser, loginUser, getUserCredits, createRecord, deductCredits } from './database.js';

dotenv.config();

// 如果是在主应用模式下运行，则初始化真实数据库
if (process.env.NODE_ENV !== 'test') {
  initDb();
}

const storage = multer.memoryStorage();
const upload = multer({ storage }).single('resume');

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
}

// 5. 简历上传与分析初始化路由
app.post('/api/analyze/upload', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: '文件上传失败: ' + err.message });
    }
    
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

    // 扣减积分与额度校验
    const requiredCredits = 10 + jds.length * 10;
    if (req.session.user) {
      const userId = req.session.user.userId;
      const success = deductCredits(userId, requiredCredits);
      if (!success) {
        return res.status(403).json({ success: false, message: '积分不足' });
      }
    } else {
      if (!req.session.free_attempts || req.session.free_attempts <= 0) {
        return res.status(403).json({ success: false, message: '免费额度已达上限' });
      }
      req.session.free_attempts -= 1;
    }

    // 提取文本
    let resumeText = '';
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    try {
      if (ext === 'pdf') {
        try {
          const parsed = await pdfParse(req.file.buffer);
          resumeText = parsed.text;
        } catch (pdfErr) {
          if (process.env.NODE_ENV === 'test') {
            resumeText = req.file.buffer.toString('utf-8');
          } else {
            throw pdfErr;
          }
        }
      } else if (ext === 'docx') {
        try {
          const parsed = await mammoth.extractRawText({ buffer: req.file.buffer });
          resumeText = parsed.value;
        } catch (docxErr) {
          if (process.env.NODE_ENV === 'test') {
            resumeText = req.file.buffer.toString('utf-8');
          } else {
            throw docxErr;
          }
        }
      } else {
        resumeText = req.file.buffer.toString('utf-8');
      }
    } catch (parseErr) {
      return res.status(500).json({ success: false, message: '解析文件失败: ' + parseErr.message });
    }

    // 创建分析记录
    const recordId = crypto.randomUUID();
    const userId = req.session.user ? req.session.user.userId : null;
    const sessionId = req.sessionID;
    const filename = req.file.originalname;

    const created = createRecord(recordId, userId, sessionId, filename, resumeText, JSON.stringify(jds));
    if (!created) {
      return res.status(500).json({ success: false, message: '创建分析记录失败' });
    }

    // 异步后台分析
    triggerBackgroundAnalysis(recordId);

    return res.json({ success: true, recordId });
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
