'use client';

import { TabContainer, TabItem } from '@/components/tab-container';
import dynamic from 'next/dynamic';

const WorkbenchPage = dynamic(() => import('@/components/workspace/workbench-content'), { ssr: false });
const MonthlyReportPage = dynamic(() => import('@/app/reports/monthly/page'), { ssr: false });
const AIAssistantPage = dynamic(() => import('@/app/ai-assistant/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'dashboard', label: '工作台', href: '/workspace?tab=dashboard', content: WorkbenchPage },
  { key: 'monthly-report', label: '月度经营月报', href: '/workspace?tab=monthly-report', content: MonthlyReportPage, permission: 'reports:monthly_view' },
  { key: 'ai-assistant', label: 'AI 劳务助手', href: '/workspace?tab=ai-assistant', content: AIAssistantPage, permission: 'ai:chat' },
];

export default function WorkspacePage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="dashboard" />
    </div>
  );
}
