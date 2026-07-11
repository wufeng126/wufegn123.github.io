import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site', '*.sxshhy.top', 'sxshhy.top'],
  
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
