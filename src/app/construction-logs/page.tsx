'use client';

import dynamic from 'next/dynamic';
import { TabContainer, type TabItem } from '@/components/tab-container';

const ConstructionDailyReportsPage = dynamic(() => import('@/app/construction-daily-reports/page'), { ssr: false });
const ConstructionLogsClient = dynamic(() => import('@/app/construction-logs/_components/construction-logs-client'), { ssr: false });
const ConstructionAttendancePage = dynamic(() => import('@/app/construction-attendance/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'daily-reports', label: '项目日报汇总', href: '/construction-logs?tab=daily-reports', content: ConstructionDailyReportsPage },
  { key: 'logs', aliases: ['risks'], label: '施工日志', href: '/construction-logs?tab=logs', content: ConstructionLogsClient, permission: 'construction_logs:view' },
  { key: 'attendance', label: '人员出勤统计', href: '/construction-logs?tab=attendance', content: ConstructionAttendancePage, permission: 'construction_attendance:view' },
];

export default function ConstructionManagementPage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="daily-reports" />
    </div>
  );
}
