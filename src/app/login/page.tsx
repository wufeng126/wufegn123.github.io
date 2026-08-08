'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-icon';
import { saveToken, isDingTalkClient, resetRedirectCount } from '@/lib/auth-client';

/**
 * 解析登录跳转目标：仅允许站内路径，防止 open redirect。
 * 支持带 query 的完整路径（如 /construction-logs?tab=daily-reports&date=2026-08-08）。
 */
function getLoginRedirectTarget(): string {
  if (typeof window === 'undefined') return '/';
  const redirect = new URLSearchParams(window.location.search).get('redirect') || '';
  if (!redirect) return '/';
  if (!redirect.startsWith('/')) return '/';
  if (redirect.startsWith('//')) return '/'; // 协议相对 URL 视为外部
  try {
    const parsed = new URL(redirect, window.location.origin);
    if (parsed.origin !== window.location.origin) return '/';
  } catch {
    return '/';
  }
  return redirect;
}

export default function LoginPage() {
  const [username, setUsername] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('lm_remember_user') || '';
  });
  const [password, setPassword] = useState('');
  const [remembered, setRemembered] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('lm_remember_user') !== null;
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 去除前后空格
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setError('请输入账号和密码');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: trimmedUsername,
          password: trimmedPassword,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 双存储：token 写入 localStorage（iframe 兜底）
        const token = data.data?.token;
        if (token) {
          saveToken(token);
        }
        // 记住我：仅记住用户名，不存密码
        if (remembered) {
          localStorage.setItem('lm_remember_user', trimmedUsername);
        } else {
          localStorage.removeItem('lm_remember_user');
        }
        // 重置跳转计数
        resetRedirectCount();

        // 跳转到登录前页面（保留 query 参数），无 redirect 时回首页
        const redirectTarget = getLoginRedirectTarget();
        // 钉钉客户端环境：通过 Authorization header + localStorage 携带 token
        if (isDingTalkClient() && token) {
          window.location.href = redirectTarget;
        } else {
          window.location.href = redirectTarget;
        }
      } else {
        // 登录失败只提示账号或密码错误，不暴露任何系统内部信息
        setError('账号或密码错误');
      }
    } catch {
      setError('登录失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>
      {/* 左侧品牌区（lg 及以上显示） */}
      <div
        className="hidden lg:flex lg:w-[46%] flex-col justify-between p-12"
        style={{ background: 'linear-gradient(165deg, #F0F2F5 0%, #E6EDF8 100%)', borderRight: '1px solid var(--border)' }}
      >
        <div>
          <div className="flex items-center gap-3">
            <BrandLogo size={42} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>建筑劳务管理</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-3)', letterSpacing: '0.6px', marginTop: 2 }}>
                CONSTRUCTION LABOR MGMT
              </div>
            </div>
          </div>
          <div style={{ marginTop: 64 }}>
            <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.45, letterSpacing: '-0.4px' }}>
              让每一笔劳务成本
              <br />
              清晰可见
            </div>
            <div style={{ marginTop: 14, fontSize: 14, color: 'var(--color-text-2)', lineHeight: 2 }}>
              工人成本 · 报量结算 · 甲方回款
              <br />
              全链路数字化管理
            </div>
            <div
              style={{
                marginTop: 28,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--color-primary)',
                background: 'var(--bg-active)',
                borderRadius: 999,
                padding: '6px 14px',
              }}
            >
              ● 数字会说话：产值蓝 · 成本橙 · 利润绿
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-4)' }}>
          © 2024 建筑劳务企业数据管理系统 · v2.4.1
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* 窄屏品牌（lg 以下） */}
          <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: 30 }}>
            <div
              style={{
                width: 56,
                height: 56,
                margin: '0 auto 14px',
              }}
            >
              <BrandLogo size={50} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>建筑劳务管理系统</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 6 }}>
              让每一笔劳务成本清晰可见
            </div>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>登录</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginTop: 6, marginBottom: 26 }}>
            请输入账号密码进入工作台
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 账号输入框 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--color-text-2)' }}>账号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入账号"
                disabled={isLoading}
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                className="w-full px-4 py-3 rounded-lg outline-none transition-all duration-200"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* 密码输入框 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--color-text-2)' }}>密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 rounded-lg outline-none transition-all duration-200"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--color-text-3)' }}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div
                className="px-4 py-3 rounded-lg text-sm text-center"
                style={{
                  background: '#FFF1F0',
                  border: '1px solid #FFCCC7',
                  color: 'var(--color-danger)',
                }}
              >
                {error}
              </div>
            )}

            {/* 记住我 */}
            <div className="flex items-center justify-between">
              <label
                className="flex items-center gap-2 text-sm cursor-pointer select-none"
                style={{ color: 'var(--color-text-2)' }}
              >
                <input
                  type="checkbox"
                  checked={remembered}
                  onChange={(e) => setRemembered(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                记住我
              </label>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-lg font-medium text-white transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: 'var(--color-primary)',
                boxShadow: '0 4px 15px rgba(22, 93, 255, 0.35)',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.75 : 1,
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  登录中...
                </>
              ) : (
                '登 录'
              )}
            </button>
          </form>

          <div className="lg:hidden" style={{ marginTop: 28, textAlign: 'center', fontSize: 12, color: 'var(--color-text-4)' }}>
            © 2024 建筑劳务企业数据管理系统
          </div>
        </div>
      </div>
    </div>
  );
}
