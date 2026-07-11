'use client';

// 全局 fetch 拦截器 — 模块级同步初始化
// 确保在任何 React 组件（包括子组件）的 useEffect 执行前，拦截器就已生效
// 解决钉钉 webview 等环境中 cookie 不被发送的问题
import { setupFetchInterceptor } from '@/lib/fetch-interceptor';

// 模块导入时立即执行（仅客户端）
if (typeof window !== 'undefined') {
  setupFetchInterceptor();
}

// 保留组件形式以防其他地方引用，但实际拦截器已在模块加载时激活
export default function FetchInterceptor() {
  return null;
}
