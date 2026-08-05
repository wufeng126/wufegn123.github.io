'use client';

import dynamic from 'next/dynamic';
import { TabContainer, type TabItem } from '@/components/tab-container';

const ConstructionDailyReportsPage = dynamic(() => import('@/app/construction-daily-reports/page'), { ssr: false });
const ConstructionLogsClient = dynamic(() => import('@/app/construction-logs/_components/construction-logs-client'), { ssr: false });
const ConstructionAttendancePage = dynamic(() => import('@/app/construction-attendance/page'), { ssr: false });
const ConstructionLogCalendar = dynamic(() => import('@/app/construction-logs/_components/construction-log-calendar'), { ssr: false });
const ProgressManagementPage = dynamic(() => import('@/app/progress-management/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'daily-reports', label: '项目日报汇总', href: '/construction-logs?tab=daily-reports', content: ConstructionDailyReportsPage },
  { key: 'logs', aliases: ['risks'], label: '施工日志', href: '/construction-logs?tab=logs', content: ConstructionLogsClient, permission: 'construction_logs:view' },
  { key: 'progress-management', label: '进度计划', href: '/construction-logs?tab=progress-management', content: ProgressManagementPage, permission: 'work_items:progress' },
  { key: 'calendar', label: '日历视图', href: '/construction-logs?tab=calendar', content: ConstructionLogCalendar, permission: 'construction_logs:view' },
  { key: 'attendance', label: '人员出勤统计', href: '/construction-logs?tab=attendance', content: ConstructionAttendancePage, permission: 'construction_attendance:view' },
];

export default function ConstructionManagementPage() {
  return (
    <div className="min-h-full bg-[#f5f7fb] p-4 md:p-6">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <TabContainer tabs={tabs} defaultTab="daily-reports" />
        </section>
      </div>
    </div>
  );
}
