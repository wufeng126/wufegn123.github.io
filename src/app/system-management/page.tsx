'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BellRing,
  Bot,
  ChevronRight,
  DatabaseZap,
  FileClock,
  GitBranch,
  KeyRound,
  Link2,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermission } from '@/contexts/permission-context';

const PermissionPage = dynamic(() => import('@/app/system/permission/page'), { ssr: false });
const DingTalkBindingPage = dynamic(() => import('@/app/system/dingtalk-binding/page'), { ssr: false });
const WpsConfigPage = dynamic(() => import('@/app/system/wps-config/page'), { ssr: false });
const NotificationsPage = dynamic(() => import('@/app/notifications/page'), { ssr: false });
const AIConfigPage = dynamic(() => import('@/app/system/ai-config/page'), { ssr: false });
const ApprovalConfigPage = dynamic(() => import('@/app/system/approval-config/page'), { ssr: false });
const AuditLogsPage = dynamic(() => import('@/app/system/audit-logs/page'), { ssr: false });
const AdminPage = dynamic(() => import('@/app/admin/page'), { ssr: false });

type SystemManagementItem = {
  key: string;
  label: string;
  description: string;
  permission: string;
  content: React.ComponentType;
};

type SystemManagementGroup = {
  key: string;
  title: string;
  summary: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SystemManagementItem[];
};

const TAB_ALIASES: Record<string, string> = {
  'logs-backup': 'audit-logs',
};

const managementGroups: SystemManagementGroup[] = [
  {
    key: 'access',
    title: '用户与权限',
    summary: '用户、角色、权限与项目身份绑定',
    icon: ShieldCheck,
    items: [
      {
        key: 'permission',
        label: '用户与权限',
        description: '维护用户、角色、权限配置、项目权限和项目身份绑定',
        permission: 'system:permission_manage',
        content: PermissionPage,
      },
      {
        key: 'admin',
        label: '后台账号',
        description: '处理管理员账号、基础后台设置和待分配账号入口',
        permission: 'system:manage',
        content: AdminPage,
      },
    ],
  },
  {
    key: 'organization',
    title: '组织与账号集成',
    summary: '钉钉基础配置、通讯录同步与免登录检查',
    icon: Link2,
    items: [
      {
        key: 'dingtalk',
        label: '钉钉集成',
        description: '配置钉钉账号绑定、免登录、通讯录同步和待分配账号处理',
        permission: 'system:dingtalk_manage',
        content: DingTalkBindingPage,
      },
    ],
  },
  {
    key: 'workflow',
    title: '业务流程配置',
    summary: '月度分析、签证办理、风险提醒等流程规则',
    icon: GitBranch,
    items: [
      {
        key: 'approval',
        label: '业务流程配置',
        description: '维护流程节点、负责人、撤回规则和超时提醒规则',
        permission: 'system:manage',
        content: ApprovalConfigPage,
      },
    ],
  },
  {
    key: 'notification',
    title: '通知与待办',
    summary: '系统内通知、待办统计与后续钉钉推送开关',
    icon: BellRing,
    items: [
      {
        key: 'notifications',
        label: '通知与待办',
        description: '查看通知规则、待办统计以及业务提醒类型',
        permission: 'notifications:view',
        content: NotificationsPage,
      },
    ],
  },
  {
    key: 'external-data',
    title: '外部数据集成',
    summary: 'WPS 花名册同步、字段映射和项目绑定',
    icon: DatabaseZap,
    items: [
      {
        key: 'wps-config',
        label: 'WPS 花名册同步',
        description: '配置项目名称绑定、同步日志、字段映射和过滤规则',
        permission: 'system:manage',
        content: WpsConfigPage,
      },
    ],
  },
  {
    key: 'operations',
    title: '系统运维',
    summary: 'AI、知识库同步、操作日志和初始化检查',
    icon: KeyRound,
    items: [
      {
        key: 'ai-config',
        label: 'AI 配置',
        description: '配置 AI 能力、模型参数和知识库同步相关设置',
        permission: 'system:ai_manage',
        content: AIConfigPage,
      },
      {
        key: 'audit-logs',
        label: '操作日志',
        description: '查看关键操作记录、异常记录和系统运行痕迹',
        permission: 'audit:view',
        content: AuditLogsPage,
      },
    ],
  },
];

export default function SystemManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isLoading } = usePermission();

  const visibleGroups = useMemo(
    () =>
      managementGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => hasPermission(item.permission)),
        }))
        .filter((group) => group.items.length > 0),
    [hasPermission],
  );

  const visibleItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  );

  const requestedTab = searchParams.get('tab') ?? '';
  const normalizedTab = TAB_ALIASES[requestedTab] ?? requestedTab;
  const fallbackKey = visibleItems[0]?.key ?? '';
  const activeKey = visibleItems.some((item) => item.key === normalizedTab) ? normalizedTab : fallbackKey;
  const activeItem = visibleItems.find((item) => item.key === activeKey);
  const activeGroup = visibleGroups.find((group) => group.items.some((item) => item.key === activeKey));
  const ActiveContent = activeItem?.content;

  useEffect(() => {
    if (!isLoading && fallbackKey && normalizedTab !== activeKey) {
      router.replace(`/system-management?tab=${activeKey}`, { scroll: false });
    }
  }, [activeKey, fallbackKey, isLoading, normalizedTab, router]);

  const handleItemClick = (key: string) => {
    router.push(`/system-management?tab=${key}`, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        正在读取系统配置权限...
      </div>
    );
  }

  if (!ActiveContent || visibleGroups.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <UsersRound className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">暂无可访问的系统配置</h2>
        <p className="mt-2 text-sm text-slate-500">请联系管理员分配对应的系统管理权限。</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50/70">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-3 py-4 sm:px-5 lg:flex-row lg:px-6">
        <aside className="shrink-0 lg:w-80">
          <div className="sticky top-4 space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                <Bot className="h-4 w-4" />
                系统管理
              </div>
              <h1 className="mt-2 text-xl font-semibold text-slate-950">配置中心</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                按账号、流程、通知、集成和运维归拢入口，先把配置找得到、分得清。
              </p>
            </div>

            <nav className="space-y-4">
              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                const isGroupActive = group.key === activeGroup?.key;

                return (
                  <section key={group.key} className="space-y-2">
                    <div
                      className={cn(
                        'flex items-start gap-2 rounded-md px-2 py-1.5',
                        isGroupActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600',
                      )}
                    >
                      <GroupIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{group.title}</div>
                        <div className="mt-0.5 text-xs leading-5 text-slate-500">{group.summary}</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const isActive = item.key === activeKey;

                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => handleItemClick(item.key)}
                            className={cn(
                              'group flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors',
                              isActive
                                ? 'border-blue-200 bg-blue-50 text-blue-900 shadow-sm'
                                : 'border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">{item.label}</span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</span>
                            </span>
                            <ChevronRight
                              className={cn(
                                'ml-3 h-4 w-4 shrink-0 transition-transform',
                                isActive ? 'translate-x-0.5 text-blue-600' : 'text-slate-300 group-hover:text-slate-500',
                              )}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <FileClock className="h-3.5 w-3.5" />
                  {activeGroup?.title}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{activeItem.label}</h2>
                <p className="mt-1 text-sm text-slate-500">{activeItem.description}</p>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <ActiveContent />
          </div>
        </main>
      </div>
    </div>
  );
}
