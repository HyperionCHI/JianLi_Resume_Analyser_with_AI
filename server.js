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
