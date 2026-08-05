'use client';

import { PageHeader } from '@/components/business/page-layout';
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
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <PageHeader
            title="施工管理"
            description="日报汇总、施工日志、进度计划和人员出勤统一在这里处理。"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">项目日报汇总</span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">施工日志</span>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">进度计划</span>
            <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">人员出勤统计</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <TabContainer tabs={tabs} defaultTab="daily-reports" />
        </section>
      </div>
    </div>
  );
}
