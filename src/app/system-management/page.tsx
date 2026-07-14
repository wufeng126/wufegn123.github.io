'use client';

import dynamic from 'next/dynamic';
import { TabContainer, TabItem } from '@/components/tab-container';

const PermissionPage = dynamic(() => import('@/app/system/permission/page'), { ssr: false });
const DingTalkBindingPage = dynamic(() => import('@/app/system/dingtalk-binding/page'), { ssr: false });
const WpsConfigPage = dynamic(() => import('@/app/system/wps-config/page'), { ssr: false });
const NotificationsPage = dynamic(() => import('@/app/notifications/page'), { ssr: false });
const AIConfigPage = dynamic(() => import('@/app/system/ai-config/page'), { ssr: false });
const ApprovalConfigPage = dynamic(() => import('@/app/system/approval-config/page'), { ssr: false });
const AuditLogsPage = dynamic(() => import('@/app/system/audit-logs/page'), { ssr: false });
const AdminPage = dynamic(() => import('@/app/admin/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'permission', label: '用户与权限', href: '/system-management?tab=permission', content: PermissionPage, permission: 'system:permission_manage' },
  { key: 'dingtalk', label: '钉钉集成', href: '/system-management?tab=dingtalk', content: DingTalkBindingPage, permission: 'system:dingtalk_manage' },
  { key: 'wps-config', label: 'WPS 集成', href: '/system-management?tab=wps-config', content: WpsConfigPage, permission: 'system:manage' },
  { key: 'approval', label: '审批流程', href: '/system-management?tab=approval', content: ApprovalConfigPage, permission: 'system:manage' },
  { key: 'notifications', label: '消息通知', href: '/system-management?tab=notifications', content: NotificationsPage, permission: 'notifications:view' },
  { key: 'ai-config', label: 'AI 配置', href: '/system-management?tab=ai-config', content: AIConfigPage, permission: 'system:ai_manage' },
  { key: 'logs-backup', label: '日志与备份', href: '/system-management?tab=logs-backup', content: AuditLogsPage, permission: 'audit:view' },
  { key: 'admin', label: '后台设置', href: '/system-management?tab=admin', content: AdminPage, permission: 'system:manage' },
];

export default function SystemManagementPage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="permission" />
    </div>
  );
}
