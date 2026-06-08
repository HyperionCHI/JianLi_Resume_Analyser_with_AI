/**
 * auth.js - 认证状态管理与 UI 动态更新模块
 * 负责:
 * 1. 页面加载时查询后端 /api/auth/status 并更新 UI
 * 2. 提供登录/注册弹窗（Modal）的显示、隐藏、表单提交逻辑
 * 3. 提供注销逻辑
 */

// 更新导航栏 UI 以反映当前认证状态
export async function initAuth(options = {}) {
  const { onStatusLoaded } = options;
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    updateNavUI(data);
    if (typeof onStatusLoaded === 'function') {
      onStatusLoaded(data);
    }
    return data;
  } catch (err) {
    console.error('[Auth] Failed to load auth status:', err);
    return null;
  }
}

// 根据认证状态更新导航栏内容
function updateNavUI(status) {
  const navAuthArea = document.getElementById('nav-auth-area');
  if (!navAuthArea) return;

  if (status.loggedIn) {
    navAuthArea.innerHTML = `
      <span class="credits-tag" id="credits-display">⚡ ${status.credits} 点积分</span>
      <span class="text-muted" style="font-size: 0.9rem;">${escapeHtml(status.email)}</span>
      <button class="btn btn-outline" id="logout-btn" onclick="handleLogout()">退出登录</button>
    `;
  } else {
    navAuthArea.innerHTML = `
      <span class="text-muted" style="font-size: 0.9rem;" id="free-attempts-display">免费额度：剩余 ${status.free_attempts} 次</span>
      <button class="btn btn-outline" id="login-btn" onclick="showAuthModal('login')">登录</button>
      <button class="btn btn-primary" id="register-btn" onclick="showAuthModal('register')">注册</button>
    `;
  }
}

// 显示 auth modal
export function showAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const modalTitle = document.getElementById('modal-title');

  if (mode === 'login') {
    modalTitle.textContent = '登录';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    modalTitle.textContent = '注册';
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  }
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

// 隐藏 auth modal
export function hideAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// 处理登录提交
export async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  
  if (!email || !password) {
    errorEl.textContent = '请填写邮箱和密码';
    return;
  }
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      hideAuthModal();
      await initAuth();
      showToast(`欢迎回来！当前积分：${data.credits}`);
    } else {
      errorEl.textContent = data.message || '登录失败';
    }
  } catch (err) {
    errorEl.textContent = '网络错误，请稍后重试';
  }
}

// 处理注册提交
export async function handleRegister() {
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const errorEl = document.getElementById('register-error');

  if (!email || !password) {
    errorEl.textContent = '请填写邮箱和密码';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = '密码长度不能少于 6 位';
    return;
  }
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      hideAuthModal();
      await initAuth();
      showToast(`🎉 注册成功！赠送 ${data.credits} 点积分，开始体验吧！`);
    } else {
      errorEl.textContent = data.message || '注册失败';
    }
  } catch (err) {
    errorEl.textContent = '网络错误，请稍后重试';
  }
}

// 处理退出登录
export async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    await initAuth();
    showToast('已退出登录');
  } catch (err) {
    console.error('[Auth] Logout failed:', err);
  }
}

// 显示 Toast 提示
function showToast(message) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.style.cssText = `
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      background: #1a1a1a; color: white; padding: 12px 24px;
      border-radius: 8px; font-size: 0.9rem; z-index: 9999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 3000);
}

// HTML 转义防 XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 将常用函数挂载到 window 供 HTML inline handlers 使用
window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
