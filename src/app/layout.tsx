import type { Metadata } from 'next';
import SidebarLayout from '@/components/sidebar-layout';
import { Toaster } from '@/components/ui/toaster';
import { PermissionProvider } from '@/contexts/permission-context';
import { RouteGuard } from '@/components/route-guard';
import FetchInterceptor from '@/components/fetch-interceptor';
import './globals.css';

export const metadata: Metadata = {
  title: '建筑劳务管理系统',
  description: '建筑劳务企业数据管理系统 - 工人成本、报量管理、甲方报量、付款情况',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <FetchInterceptor />
        <PermissionProvider>
          <SidebarLayout>
            <RouteGuard>{children}</RouteGuard>
          </SidebarLayout>
          <Toaster />
        </PermissionProvider>
      </body>
    </html>
  );
}
