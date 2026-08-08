'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePermission } from '@/contexts/permission-context';
import type { WorkbenchTodoKey } from '@/lib/notification-routing';
import { NOTIFICATIONS_UPDATED_EVENT } from '@/lib/notification-client';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessageSquareText,
} from 'lucide-react';
import { BrandIconContainer, type BrandIconName } from '@/components/ui/brand-icon';

type TodoKey = WorkbenchTodoKey;
type RoleKey = 'site' | 'budget' | 'manager' | 'boss';
type Tone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate' | 'teal';

type TodoItem = {
  key: TodoKey;
  label: string;
  desc: string;
  action: string;
  count: number;
  unit: string;
  href: string;
  notificationTypes?: string[];
  dingtalkChannels?: string[];
};

type TodoResponse = {
  total: number;
  items: TodoItem[];
  scope?: {
    projectIds: number[] | null;
    currentMonth: string;
  };
};

type QuickEntry = {
  title: string;
  desc: string;
  href: string;
  icon: BrandIconName;
  tone: Tone;
};

type RoleWorkbench = {
  key: RoleKey;
  identity: string;
  title: string;
  subtitle: string;
  primary: QuickEntry;
  quickEntries: QuickEntry[];
  todoKeys: TodoKey[];
  todoTitle: string;
  todoDesc: string;
  noticeTitle: string;
  noticeDesc: string;
};

const fallbackTodos: TodoItem[] = [
  {
    key: 'constructionLogsPending',
    label: '施工日志待确认',
    desc: '照片识别、评论提醒或日志风险已生成，需要相关负责人核对确认',
    action: '去确认',
    count: 0,
    unit: '条',
    href: '/construction-logs?tab=risks&status=pending',
  },
  {
    key: 'monthlyReportsPending',
    label: '月度分析待处理',
    desc: '预算员看待填报项目；项目经理和老板看流转到本人名下的确认事项',
    action: '去处理',
    count: 0,
    unit: '项',
    href: '/reports/monthly?todo=pending',
  },
  {
    key: 'visasPending',
    label: '签证待办理',
    desc: '当前权限项目中仍处于待办理、待签字或待确认状态的签证',
    action: '去办理',
    count: 0,
    unit: '个',
    href: '/visas?status=待办理',
  },
  {
    key: 'knowledgePending',
    label: '经验待整理',
    desc: '月度分析、签证结算和经营复盘中，需要沉淀为公司经验的内容',
    action: '去整理',
    count: 0,
    unit: '条',
    href: '/knowledge?status=pending',
  },
  {
    key: 'businessNotificationsPending',
    label: '经营消息待查看',
    desc: '供应商结算、付款、回款、工资等与经营数据相关的自动提醒',
    action: '去查看',
    count: 0,
    unit: '条',
    href: '/notifications',
  },
];

const roleWorkbenches: Record<RoleKey, RoleWorkbench> = {
  site: {
    key: 'site',
    identity: '现场人员 · 手机优先',
    title: '今天只保留现场高频操作',
    subtitle: '进入工作台后直接拍照、提交施工日志、查看自己的日志和工资，不展示复杂台账。',
    primary: {
      title: '提交施工日志',
      desc: '填写施工内容、出勤人员、工时和现场附件，完成当天日志提交。',
      href: '/construction-logs/new',
      icon: 'crane',
      tone: 'blue',
    },
    quickEntries: [
      { title: '拍照识别日志', desc: '拍照上传或识别手写日志后再核对提交', href: '/construction-logs/scan', icon: 'crane', tone: 'emerald' },
      { title: '查看我的日志', desc: '只看本人提交和待确认记录', href: '/construction-logs?tab=logs&mine=1', icon: 'doc', tone: 'slate' },
      { title: '项目日报汇总', desc: '查看公司项目昨日情况摘要', href: '/construction-logs?tab=daily-reports', icon: 'doc', tone: 'teal' },
      { title: '工资查询', desc: '查询个人工资核算和发放记录', href: '/workers/query', icon: 'money', tone: 'violet' },
    ],
    todoKeys: ['constructionLogsPending'],
    todoTitle: '我的现场提醒',
    todoDesc: '只显示本人施工日志、评论和现场提交相关提醒。',
    noticeTitle: '钉钉业务摘要',
    noticeDesc: '根据本人施工日志待办实时生成，不展示示例数据。',
  },
  budget: {
    key: 'budget',
    identity: '预算员 · 项目经营推进',
    title: '先处理影响结算和成本的钱事',
    subtitle: '把报量、签证、结算证据链、月度分析、工资异常和施工日志入口收敛到第一屏。',
    primary: {
      title: '提交施工日志',
      desc: '填写自己负责项目的现场记录，补充施工内容、人员、附件和需要说明的问题。',
      href: '/construction-logs/new',
      icon: 'crane',
      tone: 'blue',
    },
    quickEntries: [
      { title: '报量结算风险核对', desc: '核对现场完成量、对上报量、对下结算之间的差异', href: '/project-center?tab=quantity-reporting', icon: 'chart', tone: 'amber' },
      { title: '签证待确认', desc: '推进签字、商务确认和预算确认', href: '/visas', icon: 'doc', tone: 'rose' },
      { title: '结算证据链', desc: '沉淀变更、答疑、聊天记录和附件', href: '/project-center?tab=evidence-chain', icon: 'doc', tone: 'blue' },
      { title: '月度分析', desc: '提交项目经理确认并沉淀经营经验', href: '/reports/monthly', icon: 'chart', tone: 'emerald' },
      { title: '工资异常核对', desc: '核对导入失败、未建档和发放差异', href: '/workers/salaries', icon: 'worker', tone: 'violet' },
      { title: '查找经验', desc: '查询投标、签证、结算复盘经验', href: '/knowledge', icon: 'book', tone: 'slate' },
    ],
    todoKeys: ['constructionLogsPending', 'monthlyReportsPending', 'visasPending', 'knowledgePending', 'businessNotificationsPending'],
    todoTitle: '预算员待处理',
    todoDesc: '按负责项目和岗位权限展示，不把超级管理员全部项目默认塞进来。',
    noticeTitle: '钉钉业务摘要',
    noticeDesc: '根据预算员负责项目的待办实时生成，不展示示例项目和金额。',
  },
  manager: {
    key: 'manager',
    identity: '项目经理 · 现场推进',
    title: '盯住现场进展和待推进问题',
    subtitle: '重点查看施工日志、提交现场日志、推进签证、确认班组结算和阅读项目日报。',
    primary: {
      title: '提交施工日志',
      desc: '补充项目经理现场日志，记录当天施工推进、人员安排和现场问题。',
      href: '/construction-logs/new',
      icon: 'crane',
      tone: 'blue',
    },
    quickEntries: [
      { title: '施工日志查看', desc: '按天折叠查看现场记录', href: '/construction-logs?tab=logs', icon: 'doc', tone: 'blue' },
      { title: '现场风险确认', desc: '集中处理日志评论、施工风险和待确认事项', href: '/construction-logs?tab=risks', icon: 'alert', tone: 'emerald' },
      { title: '签证推进', desc: '上传甲方签字附件并更新状态', href: '/visas', icon: 'doc', tone: 'amber' },
      { title: '班组结算确认', desc: '核对工程量和分账明细', href: '/team-management/settlements', icon: 'wrench', tone: 'rose' },
      { title: '项目日报汇总', desc: '查看昨日项目情况摘要', href: '/construction-logs?tab=daily-reports', icon: 'doc', tone: 'slate' },
    ],
    todoKeys: ['constructionLogsPending', 'visasPending', 'monthlyReportsPending'],
    todoTitle: '项目经理待处理',
    todoDesc: '聚焦现场推进、签证和项目确认事项。',
    noticeTitle: '现场消息摘要',
    noticeDesc: '根据项目经理名下待办实时生成，不展示示例风险和金额。',
  },
  boss: {
    key: 'boss',
    identity: '老板 · 公司经营视角',
    title: '只看公司经营结果和关键风险',
    subtitle: '不展示录入型入口，聚焦回款、应付、利润、风险项目和需要老板确认的事项。',
    primary: {
      title: '公司经营总览',
      desc: '查看项目应收、供应商应付、人工成本、利润和风险项目。',
      href: '/business-analysis?tab=overview',
      icon: 'wrench',
      tone: 'blue',
    },
    quickEntries: [
      { title: '项目应收台账', desc: '查看应收、未收、账期和风险', href: '/business-analysis?tab=fund-management', icon: 'money', tone: 'emerald' },
      { title: '成本利润中心', desc: '按项目查看利润和成本结构', href: '/business-analysis?tab=cost-center', icon: 'chart', tone: 'violet' },
      { title: '供应商成本', desc: '查看分项目应付、已付和未付', href: '/business-analysis?tab=supplier-cost', icon: 'wrench', tone: 'amber' },
      { title: '风险项目', desc: '查看滞后、超付、资料缺口和账期风险', href: '/business-analysis?tab=overview', icon: 'alert', tone: 'rose' },
      { title: '审批确认', desc: '只处理需要老板确认的事项', href: '/notifications', icon: 'doc', tone: 'slate' },
    ],
    todoKeys: ['monthlyReportsPending', 'visasPending', 'knowledgePending', 'businessNotificationsPending'],
    todoTitle: '老板待确认',
    todoDesc: '只显示经营确认、风险提醒和与本人相关的事项。',
    noticeTitle: '经营提醒摘要',
    noticeDesc: '根据经营提醒和审批待办实时生成，不展示示例项目和金额。',
  },
};

const todoVisuals: Record<TodoKey, { icon: BrandIconName; tone: Tone; valueTone: string }> = {
  constructionLogsPending: { icon: 'crane', tone: 'blue', valueTone: 'text-primary' },
  monthlyReportsPending: { icon: 'doc', tone: 'emerald', valueTone: 'text-emerald-700' },
  visasPending: { icon: 'doc', tone: 'amber', valueTone: 'text-amber-700' },
  knowledgePending: { icon: 'book', tone: 'violet', valueTone: 'text-violet-700' },
  businessNotificationsPending: { icon: 'wrench', tone: 'slate', valueTone: 'text-slate-700' },
};

function toneClass(tone: Tone) {
  const map: Record<Tone, string> = {
    blue: 'bg-accent text-primary ring-accent',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    teal: 'bg-teal-50 text-teal-700 ring-teal-100',
  };
  return map[tone];
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function hasAnyText(source: string, words: string[]) {
  return words.some((word) => source.includes(word));
}

function resolveRoleWorkbench(
  user: ReturnType<typeof usePermission>['user'],
  permissions: string[],
  isSuperAdmin: boolean,
): RoleWorkbench {
  const roleText = normalizeText([user?.role, user?.name, user?.username].filter(Boolean).join('|'));
  const permissionSet = new Set(permissions);
  const hasPermission = (code: string) => permissionSet.has('*') || permissionSet.has(code);

  if (hasAnyText(roleText, ['老板', '总经理', 'boss', 'general_manager', 'owner', 'ceo'])) {
    return roleWorkbenches.boss;
  }
  if (hasAnyText(roleText, ['现场', 'site_staff', 'site-staff', 'site staff', 'site'])) {
    return roleWorkbenches.site;
  }
  if (hasAnyText(roleText, ['项目经理', 'project_manager', 'project-manager', 'project manager'])) {
    return roleWorkbenches.manager;
  }
  if (hasAnyText(roleText, ['预算', '预算员', '造价', 'cost', 'budget', 'estimator'])) {
    return roleWorkbenches.budget;
  }

  // 超级管理员默认使用预算员视角
  if (isSuperAdmin) return roleWorkbenches.budget;
  if (hasPermission('business_overview:view') || hasPermission('cost_center:view')) return roleWorkbenches.boss;
  if (hasPermission('team_settlements:view') || hasPermission('visas:edit')) return roleWorkbenches.manager;
  if (hasPermission('work_items:view') || hasPermission('evidence_chain:view') || hasPermission('salaries:view')) {
    return roleWorkbenches.budget;
  }

  return roleWorkbenches.site;
}

function ActionCard({ item, large = false }: { item: QuickEntry; large?: boolean }) {
  if (large) {
    return (
      <Link
        href={item.href}
        className="mobile-primary-action group block rounded-xl border border-border bg-white px-5 py-5 transition hover:border-border hover:bg-white md:px-6"
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              当前主任务
            </div>
            <div className="flex items-start gap-4">
              <BrandIconContainer name={item.icon} size={24} className="rounded-xl" />
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">{item.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{item.desc}</p>
              </div>
            </div>
          </div>
          <span className="mobile-primary-action-cta inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-base font-semibold text-white transition group-hover:bg-primary">
            立即进入
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={1.8} />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className="mobile-quick-entry group flex min-h-[96px] items-start gap-3 rounded-lg p-3 text-left transition hover:bg-muted/40"
    >
      <BrandIconContainer name={item.icon} size={18} className="mt-0.5 rounded-lg p-1.5 shadow-none" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-semibold text-slate-950 group-hover:text-primary">{item.title}</div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary" strokeWidth={1.8} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.desc}</p>
      </div>
    </Link>
  );
}

export default function WorkbenchContent() {
  const { user, permissions, isSuperAdmin } = usePermission();
  const [todos, setTodos] = useState<TodoResponse>({ total: 0, items: fallbackTodos });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadTodos(options: { silent?: boolean } = {}) {
      try {
        if (!options.silent) setLoading(true);
        setError('');
        const res = await fetch('/api/workspace/todos', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.success === false) {
          throw new Error(json.error || '待办统计加载失败');
        }
        if (mounted) setTodos(json.data || { total: 0, items: fallbackTodos });
      } catch (err) {
        if (mounted) {
          setTodos({ total: 0, items: fallbackTodos });
          setError(err instanceof Error ? err.message : '待办统计加载失败');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadTodos();
    const refreshTodos = () => {
      void loadTodos({ silent: true });
    };
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refreshTodos);
    window.addEventListener('focus', refreshTodos);
    return () => {
      mounted = false;
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refreshTodos);
      window.removeEventListener('focus', refreshTodos);
    };
  }, []);

  const roleWorkbench = useMemo(
    () => resolveRoleWorkbench(user, permissions, isSuperAdmin),
    [isSuperAdmin, permissions, user],
  );
  const allTodoItems = todos.items?.length ? todos.items : fallbackTodos;
  const visibleTodos = useMemo(() => {
    const byKey = new Map(allTodoItems.map((item) => [item.key, item]));
    return roleWorkbench.todoKeys.map((key) => byKey.get(key) || fallbackTodos.find((item) => item.key === key)).filter(Boolean) as TodoItem[];
  }, [allTodoItems, roleWorkbench.todoKeys]);
  const pendingTotal = useMemo(
    () => visibleTodos.reduce((sum, item) => sum + Number(item.count || 0), 0),
    [visibleTodos],
  );
  const entryCount = roleWorkbench.quickEntries.length + 1;
  const dingtalkSummaryItems = useMemo(
    () =>
      visibleTodos.filter((item) => {
        const hasDingTalkRoute = Boolean(item.dingtalkChannels?.length || item.notificationTypes?.length);
        return hasDingTalkRoute && Number(item.count || 0) > 0;
      }),
    [visibleTodos],
  );

  return (
    <div className="mobile-task-page mobile-workbench min-h-full bg-background p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="space-y-4">
              <ActionCard item={roleWorkbench.primary} large />
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">高频入口</h2>
                    <p className="mt-1 text-sm text-slate-500">保留当前岗位最常用的操作，减少导航来回找。</p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{entryCount} 个</span>
                </div>
                <div className="grid gap-1.5 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roleWorkbench.quickEntries.map((item) => (
                    <ActionCard key={item.title} item={item} />
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-accent">
                    <AlertCircle className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <h2 className="font-semibold">{roleWorkbench.todoTitle}</h2>
                    <p className="mt-1 text-sm text-slate-500">{roleWorkbench.todoDesc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {loading ? '加载中' : `${pendingTotal} 项`}
                </div>
              </div>

              {error ? (
                <div className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-1.5 p-2 lg:grid-cols-2">
                {visibleTodos.map((item) => {
                  const visual = todoVisuals[item.key];
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="mobile-todo-item flex flex-col gap-2.5 rounded-lg px-3.5 py-3 text-left transition hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <BrandIconContainer name={visual.icon} size={18} className="mt-0.5 rounded-lg p-1.5 shadow-none" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-950">{item.label}</span>
                            <span className={`text-xl font-semibold tabular-nums ${visual.valueTone}`}>
                              {loading ? '-' : item.count}
                            </span>
                            <span className="text-xs text-slate-400">{item.unit}</span>
                          </div>
                          <p className="mt-0.5 text-sm leading-6 text-slate-500">{item.desc}</p>
                          {item.dingtalkChannels?.length ? (
                            <p className="mt-0.5 text-xs text-slate-400">
                              钉钉对应：{item.dingtalkChannels.join(' / ')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className="inline-flex items-center justify-end gap-1 text-sm font-medium text-primary">
                        {item.action}
                        <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold">{roleWorkbench.noticeTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{roleWorkbench.noticeDesc}</p>
              </div>
              <div className="divide-y divide-slate-100 p-2">
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    正在读取真实待办
                  </div>
                ) : dingtalkSummaryItems.length ? (
                  dingtalkSummaryItems.map((item) => (
                    <Link key={item.key} href={item.href} className="block rounded-lg p-3 transition hover:bg-slate-50">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-accent">
                          <MessageSquareText className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                            <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-primary">
                              {item.count}{item.unit}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.desc}</p>
                          {item.dingtalkChannels?.length ? (
                            <p className="mt-2 text-xs text-slate-400">钉钉对应：{item.dingtalkChannels.join(' / ')}</p>
                          ) : null}
                          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                            {item.action}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-3 py-5 text-sm leading-6 text-slate-500">
                    当前身份暂无需要钉钉提醒的待办。
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
