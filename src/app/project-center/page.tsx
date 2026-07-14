'use client';

import { TabContainer, TabItem } from '@/components/tab-container';
import dynamic from 'next/dynamic';

const ProjectsPage = dynamic(() => import('@/app/projects/page'), { ssr: false });
const QuantityReportingPage = dynamic(() => import('@/app/quantity-reporting/page'), { ssr: false });
const VisasPage = dynamic(() => import('@/app/visas/page'), { ssr: false });
const ClientReportsPage = dynamic(() => import('@/app/client-reports/page'), { ssr: false });
const ClientPaymentsPage = dynamic(() => import('@/app/client-payments/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'projects', label: '项目信息', href: '/project-center?tab=projects', content: ProjectsPage, permission: 'projects:view' },
  { key: 'quantity-reporting', aliases: ['work-items'], label: '报量管理', href: '/project-center?tab=quantity-reporting', content: QuantityReportingPage, permission: 'work_items:view' },
  { key: 'visas', label: '签证', href: '/project-center?tab=visas', content: VisasPage, permission: 'visas:view' },
  { key: 'client-reports', label: '产值结算', href: '/project-center?tab=client-reports', content: ClientReportsPage, permission: 'client_reports:view' },
  { key: 'client-payments', label: '甲方回款', href: '/project-center?tab=client-payments', content: ClientPaymentsPage, permission: 'client_payments:view' },
];

export default function ProjectCenterPage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="projects" />
    </div>
  );
}
