'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { usePermission } from '@/contexts/permission-context';
import { PageHeader, StatsBar } from '@/components/business/page-layout';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BellRing,
  BookOpen,
  BookOpenCheck,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileSearch,
  FileText,
  HandCoins,
  HardHat,
  Loader2,
  MessageSquareText,
  PenSquare,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';

type TodoKey = 'constructionLogsPending' | 'monthlyReportsPending' | 'visasPending' | 'knowledgePending';
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
  icon: LucideIcon;
  tone: Tone;
};

type NoticeExample = {
  title: string;
  summary: string;
  href: string;
  action: string;
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
  notices: NoticeExample[];
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
    label: '月报待填报',
    desc: '当前权限项目中，本月还有未完成的月度经营分析',
    action: '去填报',
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
];

const roleWorkbenches: Record<RoleKey, RoleWorkbench> = {
  site: {
    key: 'site',
    identity: '现场人员 · 手机优先',
    title: '今天只保留现场高频操作',
    subtitle: '进入工作台后直接拍照、提交施工日志、查看自己的日志和工资，不展示复杂台账。',
    primary: {
      title: '拍照录施工日志',
      desc: '拍照上传或识别手写日志，核对施工内容后选择出勤人员和工时。',
      href: '/construction-logs/scan',
      icon: Camera,
      tone: 'blue',
    },
    quickEntries: [
      { title: '新建施工日志', desc: '手动填写施工内容、出勤人员和附件', href: '/construction-logs/new', icon: PenSquare, tone: 'emerald' },
      { title: '查看我的日志', desc: '只看本人提交和待确认记录', href: '/construction-logs?tab=logs&mine=1', icon: FileSearch, tone: 'slate' },
      { title: '项目日报汇总', desc: '查看公司项目昨日情况摘要', href: '/construction-logs?tab=daily-reports', icon: ClipboardCheck, tone: 'teal' },
      { title: '工资查询', desc: '查询个人工资核算和发放记录', href: '/workers/query', icon: WalletCards, tone: 'violet' },
    ],
    todoKeys: ['constructionLogsPending'],
    todoTitle: '我的现场提醒',
    todoDesc: '只显示本人施工日志、评论和现场提交相关提醒。',
    noticeTitle: '钉钉提醒样式',
    noticeDesc: '现场人员收到的消息要短，点开就能处理。',
    notices: [
      {
        title: '施工日志待提交',
        summary: '南京中交智慧港项目昨日施工日志尚未提交，请在截止时间前完成。',
        href: '/construction-logs/new',
        action: '去提交',
      },
      {
        title: '日志评论提醒',
        summary: '项目经理评论了你提交的施工日志，请查看并补充说明。',
        href: '/construction-logs?tab=logs&mine=1',
        action: '查看评论',
      },
    ],
  },
  budget: {
    key: 'budget',
    identity: '预算员 · 项目经营推进',
    title: '先处理影响结算和成本的钱事',
    subtitle: '把报量、签证、结算证据链、月度分析、工资异常和施工日志入口收敛到第一屏。',
    primary: {
      title: '报量结算风险核对',
      desc: '核对现场完成量、对上报量、对下结算之间的差异。',
      href: '/project-center?tab=quantity-reporting',
      icon: ClipboardList,
      tone: 'amber',
    },
    quickEntries: [
      { title: '提交施工日志', desc: '填写自己负责项目的日志内容', href: '/construction-logs/new', icon: PenSquare, tone: 'emerald' },
      { title: '签证待确认', desc: '推进签字、商务确认和预算确认', href: '/visas', icon: FileCheck2, tone: 'rose' },
      { title: '结算证据链', desc: '沉淀变更、答疑、聊天记录和附件', href: '/project-center?tab=evidence-chain', icon: BookOpenCheck, tone: 'blue' },
      { title: '月度分析', desc: '提交项目经理确认并沉淀经营经验', href: '/reports/monthly', icon: BarChart3, tone: 'emerald' },
      { title: '工资异常核对', desc: '核对导入失败、未建档和发放差异', href: '/workers/salaries', icon: UserRoundCheck, tone: 'violet' },
      { title: '查找经验', desc: '查询投标、签证、结算复盘经验', href: '/knowledge', icon: Search, tone: 'slate' },
    ],
    todoKeys: ['constructionLogsPending', 'monthlyReportsPending', 'visasPending', 'knowledgePending'],
    todoTitle: '预算员待处理',
    todoDesc: '按负责项目和岗位权限展示，不把超级管理员全部项目默认塞进来。',
    noticeTitle: '钉钉业务摘要',
    noticeDesc: '自动消息要带项目、单位、金额或资料缺口。',
    notices: [
      {
        title: '供应商新增结算',
        summary: '南京启承劳务新增结算 85,000 元，请核对合同累计结算。',
        href: '/supplier-contracts/settlement',
        action: '打开结算单',
      },
      {
        title: '签证超过7天未推进',
        summary: '地下室返工签证仍未进入下一流程，请跟进甲方签字状态。',
        href: '/visas',
        action: '去推进',
      },
    ],
  },
  manager: {
    key: 'manager',
    identity: '项目经理 · 现场推进',
    title: '盯住现场进展和待推进问题',
    subtitle: '重点查看施工日志、提交现场日志、推进签证、确认班组结算和阅读项目日报。',
    primary: {
      title: '项目现场待处理',
      desc: '集中处理日志评论、签证推进、班组结算确认和现场风险。',
      href: '/construction-logs?tab=risks',
      icon: HardHat,
      tone: 'emerald',
    },
    quickEntries: [
      { title: '提交施工日志', desc: '补充项目经理现场日志', href: '/construction-logs/new', icon: PenSquare, tone: 'emerald' },
      { title: '施工日志查看', desc: '按天折叠查看现场记录', href: '/construction-logs?tab=logs', icon: FileText, tone: 'blue' },
      { title: '签证推进', desc: '上传甲方签字附件并更新状态', href: '/visas', icon: FileCheck2, tone: 'amber' },
      { title: '班组结算确认', desc: '核对工程量和分账明细', href: '/team-management/settlements', icon: ReceiptText, tone: 'rose' },
      { title: '项目日报汇总', desc: '查看昨日项目情况摘要', href: '/construction-logs?tab=daily-reports', icon: ClipboardCheck, tone: 'slate' },
    ],
    todoKeys: ['constructionLogsPending', 'visasPending', 'monthlyReportsPending'],
    todoTitle: '项目经理待处理',
    todoDesc: '聚焦现场推进、签证和项目确认事项。',
    noticeTitle: '现场消息摘要',
    noticeDesc: '消息直说项目、问题和需要你做什么。',
    notices: [
      {
        title: '日报风险提醒',
        summary: '南京中交智慧港项目昨日模板安装出勤减少，进度可能滞后 2 天。',
        href: '/construction-logs?tab=daily-reports',
        action: '看日报',
      },
      {
        title: '班组结算待确认',
        summary: '模板班组本期结算 126,300 元，请核对工程量和分账明细。',
        href: '/team-management/settlements',
        action: '去确认',
      },
    ],
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
      icon: BriefcaseBusiness,
      tone: 'blue',
    },
    quickEntries: [
      { title: '项目应收台账', desc: '查看应收、未收、账期和风险', href: '/business-analysis?tab=fund-management', icon: HandCoins, tone: 'emerald' },
      { title: '成本利润中心', desc: '按项目查看利润和成本结构', href: '/business-analysis?tab=cost-center', icon: BarChart3, tone: 'violet' },
      { title: '供应商成本', desc: '查看分项目应付、已付和未付', href: '/business-analysis?tab=supplier-cost', icon: ReceiptText, tone: 'amber' },
      { title: '风险项目', desc: '查看滞后、超付、资料缺口和账期风险', href: '/business-analysis?tab=overview', icon: AlertTriangle, tone: 'rose' },
      { title: '审批确认', desc: '只处理需要老板确认的事项', href: '/notifications', icon: ShieldCheck, tone: 'slate' },
    ],
    todoKeys: ['monthlyReportsPending', 'visasPending', 'knowledgePending'],
    todoTitle: '老板待确认',
    todoDesc: '只显示经营确认、风险提醒和与本人相关的事项。',
    noticeTitle: '经营提醒摘要',
    noticeDesc: '钉钉消息要能直接看出金额、项目和风险。',
    notices: [
      {
        title: '应收账期超期',
        summary: '城东学校改扩建项目质保期满后 428 天未收款，请关注回款风险。',
        href: '/business-analysis?tab=fund-management',
        action: '查看账期',
      },
      {
        title: '月度经营分析待确认',
        summary: '8月经营月报已由预算员提交，请查看利润、回款和风险摘要。',
        href: '/reports/monthly',
        action: '去确认',
      },
    ],
  },
};

const todoVisuals: Record<TodoKey, { icon: LucideIcon; tone: Tone; valueTone: string }> = {
  constructionLogsPending: { icon: Camera, tone: 'blue', valueTone: 'text-blue-700' },
  monthlyReportsPending: { icon: FileText, tone: 'emerald', valueTone: 'text-emerald-700' },
  visasPending: { icon: FileCheck2, tone: 'amber', valueTone: 'text-amber-700' },
  knowledgePending: { icon: BookOpen, tone: 'violet', valueTone: 'text-violet-700' },
};

function toneClass(tone: Tone) {
  const map: Record<Tone, string> = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    teal: 'bg-teal-50 text-teal-700 ring-teal-100',
  };
  return map[tone];
}

function valueClass(tone: Tone) {
  const map: Record<Tone, string> = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    violet: 'text-violet-700',
    slate: 'text-slate-700',
    teal: 'text-teal-700',
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

  if (isSuperAdmin) return roleWorkbenches.boss;
  if (hasPermission('business_overview:view') || hasPermission('cost_center:view')) return roleWorkbenches.boss;
  if (hasPermission('team_settlements:view') || hasPermission('visas:edit')) return roleWorkbenches.manager;
  if (hasPermission('work_items:view') || hasPermission('evidence_chain:view') || hasPermission('salaries:view')) {
    return roleWorkbenches.budget;
  }

  return roleWorkbenches.site;
}

function ActionCard({ item, large = false }: { item: QuickEntry; large?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`group flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${large ? 'min-h-[178px]' : 'min-h-[136px]'}`}
    >
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${toneClass(item.tone)}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-base font-semibold text-slate-950 group-hover:text-blue-700">{item.title}</div>
      <p className="mt-1 flex-1 text-sm leading-6 text-slate-500">{item.desc}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700">
        进入
        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function NoticeCard({ notice }: { notice: NoticeExample }) {
  return (
    <Link href={notice.href} className="block rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-white">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 ring-1 ring-blue-100">
          <MessageSquareText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{notice.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{notice.summary}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-700">
            {notice.action}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function WorkbenchContent() {
  const { user, permissions, managedProjects, isSuperAdmin, isLoading: userLoading } = usePermission();
  const [todos, setTodos] = useState<TodoResponse>({ total: 0, items: fallbackTodos });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadTodos() {
      try {
        setLoading(true);
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
    return () => {
      mounted = false;
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
  const projectScope = isSuperAdmin && managedProjects.length === 0 ? '全部' : managedProjects.length || '未分配';
  const surfaceStats = useMemo(
    () => [
      { label: '与我有关待办', value: loading ? '--' : pendingTotal, type: 'blue' as const },
      { label: '高频入口', value: entryCount, type: 'green' as const },
      { label: '项目范围', value: projectScope, type: 'default' as const },
      { label: '当前月份', value: todos.scope?.currentMonth || '本月', type: 'orange' as const },
    ],
    [entryCount, loading, pendingTotal, projectScope, todos.scope?.currentMonth],
  );

  return (
    <div className="min-h-full bg-[#f6f7f9] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1480px] space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <PageHeader
              title="工作台"
              description="根据登录人的岗位和项目绑定自动收敛入口，不需要手动切换身份。"
            />
            <StatsBar items={surfaceStats} className="xl:justify-end" />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {userLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                    {roleWorkbench.identity}
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-normal">{roleWorkbench.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{roleWorkbench.subtitle}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
                  {[
                    { label: '待处理', value: loading ? '--' : pendingTotal, hint: roleWorkbench.todoTitle, tone: 'blue' as Tone },
                    { label: '快捷入口', value: entryCount, hint: '按当前角色收敛', tone: 'emerald' as Tone },
                    { label: '项目范围', value: projectScope, hint: '来自后台项目绑定', tone: 'slate' as Tone },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{stat.label}</p>
                      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass(stat.tone)}`}>{stat.value}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{stat.hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.05fr_1.45fr]">
              <ActionCard item={roleWorkbench.primary} large />
              <div className="grid gap-3 sm:grid-cols-2">
                {roleWorkbench.quickEntries.map((item) => (
                  <ActionCard key={item.title} item={item} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">{roleWorkbench.todoTitle}</h2>
                    <p className="mt-1 text-sm text-slate-500">{roleWorkbench.todoDesc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {loading ? '加载中' : `${pendingTotal} 项`}
                </div>
              </div>

              {error ? (
                <div className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {error}
                </div>
              ) : null}

              <div className="divide-y divide-slate-100">
                {visibleTodos.map((item) => {
                  const visual = todoVisuals[item.key];
                  const Icon = visual.icon;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="flex flex-col gap-3 px-5 py-4 text-left transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClass(visual.tone)}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-950">{item.label}</span>
                            <span className={`text-xl font-semibold tabular-nums ${visual.valueTone}`}>
                              {loading ? '-' : item.count}
                            </span>
                            <span className="text-xs text-slate-400">{item.unit}</span>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{item.desc}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center justify-end gap-1 text-sm font-medium text-blue-700">
                        {item.action}
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold">{roleWorkbench.noticeTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{roleWorkbench.noticeDesc}</p>
              </div>
              <div className="space-y-3 p-4">
                {roleWorkbench.notices.map((notice) => (
                  <NoticeCard key={notice.title} notice={notice} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">工作台收敛规则</h2>
              <div className="mt-3 space-y-3">
                {[
                  '登录后按岗位自动显示，不提供身份切换按钮',
                  '现场人员只保留施工日志、日报和工资查询',
                  '预算员和项目经理保留提交施工日志入口',
                  '待办和钉钉提醒按岗位与项目绑定过滤',
                ].map((item) => (
                  <div key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <Link
              href="/notifications"
              className="group rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm transition hover:bg-slate-800"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">消息通知中心</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">配置自动消息、钉钉个人待办和群提醒。</p>
                </div>
                <ChevronRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          </aside>
        </section>
      </div>
    </div>
  );
}
