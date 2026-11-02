import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isProd = process.env.NODE_ENV === 'production';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site', '*.sxshhy.top', 'sxshhy.top'],
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },

  // 页面 HTML 与接口响应不缓存，避免发布新构建后旧 HTML 引用已失效的 JS chunk。
  // _next/static 中的带 hash 静态资源仍保持 Next.js 默认缓存策略。
  async headers() {
    // 安全响应头：防点击劫持 / MIME 嗅探 / 泄露来源页 / 强制 HTTPS（生产）
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
      ...(isProd
        ? [
            { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
            {
              key: 'Content-Security-Policy',
              value: [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob: https:",
                "font-src 'self' data:",
                "connect-src 'self' https: wss:",
                "frame-ancestors 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "object-src 'none'",
              ].join('; '),
            },
          ]
        : []),
    ];
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  
  // 生产环境移除开发工具
  devIndicators: isProd ? false : undefined,
  
  // 生产环境关闭 React DevTools
  reactProductionProfiling: false,

  // 不向浏览器暴露源码映射
  productionBrowserSourceMaps: false,
  
  // 图片域名白名单
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
  
  // 生产环境优化
  ...(isProd && {
    poweredByHeader: false,
    compress: true,
  }),
};

export default nextConfig;
