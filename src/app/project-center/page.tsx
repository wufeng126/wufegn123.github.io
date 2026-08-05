'use client';

import { PageHeader } from '@/components/business/page-layout';
import { TabContainer, TabItem } from '@/components/tab-container';
import dynamic from 'next/dynamic';

const ProjectsPage = dynamic(() => import('@/app/projects/page'), { ssr: false });
const QuantityReportingPage = dynamic(() => import('@/app/quantity-reporting/page'), { ssr: false });
const VisasPage = dynamic(() => import('@/app/visas/page'), { ssr: false });
const ClientReportsPage = dynamic(() => import('@/app/client-reports/page'), { ssr: false });
const ClientPaymentsPage = dynamic(() => import('@/app/client-payments/page'), { ssr: false });
const EvidenceChainPage = dynamic(() => import('@/app/evidence-chain/page'), { ssr: false });
const ProgressManagementPage = dynamic(() => import('@/app/progress-management/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'projects', label: '项目信息', href: '/project-center?tab=projects', content: ProjectsPage, permission: 'projects:view' },
  { key: 'quantity-reporting', aliases: ['work-items'], label: '报量管理', href: '/project-center?tab=quantity-reporting', content: QuantityReportingPage, permission: 'work_items:view' },
  { key: 'progress-management', label: '进度计划', href: '/project-center?tab=progress-management', content: ProgressManagementPage, permission: 'work_items:progress' },
  { key: 'visas', label: '签证', href: '/project-center?tab=visas', content: VisasPage, permission: 'visas:view' },
  { key: 'evidence-chain', label: '结算证据链', href: '/project-center?tab=evidence-chain', content: EvidenceChainPage, permission: 'evidence_chain:view' },
  { key: 'client-reports', label: '产值结算', href: '/project-center?tab=client-reports', content: ClientReportsPage, permission: 'client_reports:view' },
  { key: 'client-payments', label: '甲方回款', href: '/project-center?tab=client-payments', content: ClientPaymentsPage, permission: 'client_payments:view' },
];

export default function ProjectCenterPage() {
  return (
    <div className="min-h-full bg-[#f5f7fb] p-4 md:p-6">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <PageHeader
            title="项目管理"
            description="项目档案、报量、签证、结算和回款统一从这里进入。"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">项目档案</span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">报量管理</span>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">进度计划</span>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">签证</span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">结算 / 回款</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <TabContainer tabs={tabs} defaultTab="projects" />
        </section>
      </div>
    </div>
  );
}
