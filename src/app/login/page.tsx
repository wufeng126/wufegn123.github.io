'use client';

import { useState } from 'react';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';
import { saveToken, isDingTalkClient, resetRedirectCount } from '@/lib/auth-client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        // 重置跳转计数
        resetRedirectCount();

        // 钉钉客户端环境：通过 Authorization header + localStorage 携带 token
        if (isDingTalkClient() && token) {
          window.location.href = '/';
        } else {
          window.location.href = '/';
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)' }}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden">
        {/* 网格背景 */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(rgba(22, 93, 255, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(22, 93, 255, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
        {/* 光晕效果 */}
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #165DFF 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, #4080FF 0%, transparent 70%)' }}
        />
      </div>

      {/* 登录卡片 */}
      <div className="relative w-full max-w-md">
        {/* 卡片主体 */}
        <div
          className="rounded-2xl p-8 backdrop-blur-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Logo 和标题 */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
                boxShadow: '0 8px 32px rgba(22, 93, 255, 0.4)',
              }}
            >
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">建筑劳务管理系统</h1>
            <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Construction Labor Management System
            </p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 账号输入框 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/70">账号</label>
              <div className="relative">
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
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                />
              </div>
            </div>

            {/* 密码输入框 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/70">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 rounded-xl text-white placeholder-white/30 outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm text-center"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#FCA5A5',
                }}
              >
                {error}
              </div>
            )}

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl font-medium text-white transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
                boxShadow: '0 4px 15px rgba(22, 93, 255, 0.4)',
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

          {/* 底部信息 */}
          <div className="mt-8 pt-6 text-center" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
              © 2024 建筑劳务企业数据管理系统
            </p>
          </div>
        </div>

        {/* 卡片下方装饰线 */}
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1/2 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(22, 93, 255, 0.5), transparent)',
          }}
        />
      </div>
    </div>
  );
}
