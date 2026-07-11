'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Smartphone, ArrowRight } from 'lucide-react';
import { saveToken, isDingTalkClient, resetRedirectCount } from '@/lib/auth-client';

type LoginState = 'detecting' | 'logging_in' | 'success' | 'error' | 'not_dingtalk';

// 调试日志面板组件
function DebugPanel({ logs }: { logs: string[] }) {
  if (logs.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      maxHeight: '40vh', overflow: 'auto',
      background: '#1a1a2e', color: '#e0e0e0',
      fontSize: '11px', fontFamily: 'monospace',
      padding: '8px', zIndex: 9999,
      borderTop: '2px solid #e94560',
    }}>
      <div style={{ color: '#e94560', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>
        调试日志（部署后可见）
      </div>
      {logs.map((log, i) => (
        <div key={i} style={{ padding: '1px 0', borderBottom: '1px solid #333', wordBreak: 'break-all' }}>
          {log}
        </div>
      ))}
    </div>
  );
}

export default function DingTalkPage() {
  const router = useRouter();
  const [loginState, setLoginState] = useState<LoginState>('detecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [dingtalkUserName, setDingtalkUserName] = useState('');
  const debugLogs = useRef<string[]>([]);
  const [debugPanel, setDebugPanel] = useState<string[]>([]);

  const addDebugLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${msg}`;
    debugLogs.current.push(logEntry);
    setDebugPanel([...debugLogs.current]);
    console.log(msg);
  }, []);

  /**
   * 检测是否在钉钉客户端环境内
   * 钉钉客户端的 UA 包含 "DingTalk" 标识
   */
  const isDingTalkEnv = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('dingtalk');
  }, []);

  /**
   * 加载钉钉 JSAPI
   * 钉钉 H5 微应用需要引入 dingtalk.js 来调用 JSAPI
   */
  const loadDingTalkJSAPI = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('非浏览器环境'));
        return;
      }

      // 已加载
      if ((window as any).dd) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://g.alicdn.com/dingding/dingtalk-jsapi/3.0.25/dingtalk.open.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('钉钉 JSAPI 加载失败'));
      document.head.appendChild(script);
    });
  }, []);

  /**
   * 执行钉钉免登流程
   */
  const doDingTalkLogin = useCallback(async () => {
    try {
      setLoginState('logging_in');
      addDebugLog('=== 免登流程开始 ===');
      addDebugLog(`UA: ${navigator.userAgent.substring(0, 80)}`);
      addDebugLog(`URL: ${window.location.href}`);
      addDebugLog(`isDingTalkClient: ${isDingTalkClient()}`);

      // 1. 获取钉钉公开配置（corpId）
      let corpId = '';
      try {
        addDebugLog('步骤1: 获取 public-config...');
        const configRes = await fetch('/api/dingtalk/public-config', { credentials: 'include' });
        addDebugLog(`public-config 状态: ${configRes.status}`);
        const configData = await configRes.json();
        addDebugLog(`configured: ${configData.data?.configured}, corpId: ${configData.data?.corpId?.substring(0, 10)}`);
        if (configData.success && configData.data?.configured) {
          corpId = configData.data.corpId || '';
          if (!corpId) {
            throw new Error('钉钉企业 CorpId 未配置');
          }
        } else {
          throw new Error('钉钉企业内部应用未配置');
        }
      } catch (e: any) {
        addDebugLog(`ERROR: 获取配置失败: ${e.message}`);
        throw new Error(e.message || '获取钉钉配置失败');
      }

      // 2. 加载钉钉 JSAPI
      addDebugLog('步骤2: 加载 JSAPI...');
      await loadDingTalkJSAPI();

      const dd = (window as any).dd;
      if (!dd || !dd.runtime) {
        addDebugLog(`ERROR: dd=${!!dd}, runtime=${!!dd?.runtime}`);
        throw new Error('钉钉 JSAPI 不可用');
      }
      addDebugLog('JSAPI 加载成功');

      // 3. 获取 authCode
      addDebugLog(`步骤3: 请求 authCode, corpId: ${corpId.substring(0, 10)}...`);
      const authCode = await new Promise<string>((resolve, reject) => {
        dd.runtime.permission.requestAuthCode({
          corpId,
          onSuccess: (result: { code: string }) => {
            addDebugLog(`authCode 成功: ${result.code?.substring(0, 10)}...`);
            resolve(result.code);
          },
          onFail: (err: any) => {
            addDebugLog(`ERROR: authCode 失败: ${JSON.stringify(err)}`);
            reject(new Error(err.errorMessage || '获取授权码失败'));
          },
        });
      });

      if (!authCode) {
        throw new Error('授权码为空');
      }

      // 4. 发送 authCode 到后端免登接口
      addDebugLog('步骤4: 调用免登API...');
      const response = await fetch('/api/auth/dingtalk/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ authCode }),
      });

      const data = await response.json();
      addDebugLog(`登录API: status=${response.status}, success=${data.success}`);

      if (!response.ok || !data.success) {
        if (data.code === 'USER_NOT_FOUND' && data.data?.dingtalkUser) {
          setDingtalkUserName(data.data.dingtalkUser.name);
          setErrorMsg(data.error || '未找到关联的系统账号');
          setLoginState('error');
          addDebugLog(`ERROR: 未找到关联账号`);
          return;
        }
        addDebugLog(`ERROR: ${data.error}`);
        throw new Error(data.error || '免登失败');
      }

      // 5. 免登成功
      addDebugLog(`免登成功: ${data.data?.user?.username}`);
      setLoginState('success');

      const token = data.data?.token;
      addDebugLog(`token: ${!!token}, 长度: ${token?.length || 0}`);
      if (token) {
        saveToken(token);
        addDebugLog('token 已存入 localStorage');
      }
      resetRedirectCount();

      // 短暂延迟让用户看到成功状态
      setTimeout(() => {
        // 钉钉客户端环境：始终通过 URL 携带 token
        const targetUrl = `/?token=${encodeURIComponent(token || '')}`;
        addDebugLog(`跳转到: ${targetUrl.substring(0, 50)}...`);
        window.location.href = targetUrl;
      }, 800);

    } catch (err: any) {
      addDebugLog(`ERROR: ${err.message}`);
      setErrorMsg(err.message || '钉钉登录失败');
      setLoginState('error');
    }
  }, [addDebugLog, loadDingTalkJSAPI]);

  /**
   * 页面加载后检测环境并自动发起免登
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDingTalkEnv()) {
        doDingTalkLogin();
      } else {
        setLoginState('not_dingtalk');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isDingTalkEnv, doDingTalkLogin]);

  // ===== 渲染 =====

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 卡片容器 */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* 顶部蓝色条 */}
          <div className="h-2 bg-[#165DFF]" />

          <div className="px-8 py-10">
            {/* Logo + 标题 */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-[#165DFF] flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">建筑劳务管理系统</h1>
                <p className="text-xs text-gray-500">钉钉工作台入口</p>
              </div>
            </div>

            {/* 检测中 */}
            {loginState === 'detecting' && (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 text-[#165DFF] animate-spin mx-auto mb-4" />
                <p className="text-sm text-gray-600">正在检测运行环境...</p>
              </div>
            )}

            {/* 免登中 */}
            {loginState === 'logging_in' && (
              <div className="text-center py-8">
                <div className="relative mx-auto mb-6 w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-[#165DFF]/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#165DFF] animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-[#165DFF]" />
                  </div>
                </div>
                <p className="text-base font-medium text-gray-900 mb-2">正在通过钉钉登录</p>
                <p className="text-sm text-gray-500">请稍候，正在获取授权信息...</p>
              </div>
            )}

            {/* 免登成功 */}
            {loginState === 'success' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-base font-medium text-gray-900 mb-2">登录成功</p>
                <p className="text-sm text-gray-500">正在跳转到系统首页...</p>
              </div>
            )}

            {/* 免登失败 */}
            {loginState === 'error' && (
              <div className="py-6">
                <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg mb-4">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-800">免登失败</p>
                    <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
                    {dingtalkUserName && (
                      <p className="text-xs text-red-600 mt-2">
                        钉钉用户：{dingtalkUserName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={doDingTalkLogin}
                    className="w-full h-10 rounded-lg bg-[#165DFF] text-white text-sm font-medium
                      hover:bg-[#0E42D2] transition-colors"
                  >
                    重试免登
                  </button>
                  <button
                    onClick={() => router.push('/login')}
                    className="w-full h-10 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium
                      hover:bg-gray-50 transition-colors"
                  >
                    使用账号密码登录
                  </button>
                </div>
              </div>
            )}

            {/* 非钉钉环境 */}
            {loginState === 'not_dingtalk' && (
              <div className="py-6">
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg mb-6">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">请在钉钉工作台中打开</p>
                    <p className="text-sm text-amber-700 mt-1">
                      当前不在钉钉客户端环境内，免登功能仅在钉钉工作台中使用。
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-xs text-gray-500 mb-2">使用方式：</p>
                  <ol className="text-xs text-gray-600 space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#165DFF] text-white text-[10px] flex-shrink-0 mt-0.5">1</span>
                      在钉钉工作台找到本应用
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#165DFF] text-white text-[10px] flex-shrink-0 mt-0.5">2</span>
                      点击进入即可自动登录
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#165DFF] text-white text-[10px] flex-shrink-0 mt-0.5">3</span>
                      无需输入账号密码
                    </li>
                  </ol>
                </div>

                <button
                  onClick={() => router.push('/login')}
                  className="w-full h-10 rounded-lg bg-[#165DFF] text-white text-sm font-medium
                    hover:bg-[#0E42D2] transition-colors flex items-center justify-center gap-2"
                >
                  前往账号密码登录
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs text-gray-400 mt-6">
          建筑劳务管理系统 &middot; 钉钉 H5 微应用
        </p>
      </div>

      {/* 调试日志面板 - 部署后可见 */}
      <DebugPanel logs={debugPanel} />
    </div>
  );
}
