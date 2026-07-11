'use client';

import { TabContainer, TabItem } from '@/components/tab-container';
import dynamic from 'next/dynamic';

const WorkerRosterPage = dynamic(() => import('@/app/workers/roster/page'), { ssr: false });
const CertificatesPage = dynamic(() => import('@/app/certificates/page'), { ssr: false });
const WorkerSalariesPage = dynamic(() => import('@/app/workers/salaries/page'), { ssr: false });
const SalaryPaymentsPage = dynamic(() => import('@/app/workers/payments/page'), { ssr: false });
const SalaryQueryPage = dynamic(() => import('@/app/workers/query/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'roster', label: '工人档案', href: '/hr-salary?tab=roster', content: WorkerRosterPage, permission: 'workers:view' },
  { key: 'certificates', label: '证件管理', href: '/hr-salary?tab=certificates', content: CertificatesPage, permission: 'certificates:view' },
  { key: 'salaries', label: '工资核算', href: '/hr-salary?tab=salaries', content: WorkerSalariesPage, permission: 'salaries:view' },
  { key: 'payments', label: '工资发放', href: '/hr-salary?tab=payments', content: SalaryPaymentsPage, permission: 'salaries:pay' },
  { key: 'query', label: '工资查询', href: '/hr-salary?tab=query', content: SalaryQueryPage, permission: 'salaries:query' },
];

export default function HRSalaryPage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="roster" />
    </div>
  );
}
