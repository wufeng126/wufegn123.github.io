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
  
  // 生产环境移除开发工具
  devIndicators: isProd ? false : undefined,
  
  // 生产环境关闭 React DevTools
  reactProductionProfiling: false,
  
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
