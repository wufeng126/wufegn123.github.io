'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  Camera,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileText,
  HardHat,
  ListChecks,
  MapPinned,
  MessageSquare,
  NotebookPen,
  PanelLeft,
  ReceiptText,
  Search,
  Sparkles,
  TrendingUp,
  UserRound,
  WalletCards,
} from 'lucide-react';

type RoleKey = 'boss' | 'budget' | 'manager' | 'site';
type Tone = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';

type Metric = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: Tone;
  delta?: string;
};

type NavItem = {
  label: string;
  note: string;
  icon: LucideIcon;
  active?: boolean;
};

type ActionItem = {
  label: string;
  note: string;
  icon: LucideIcon;
  tone: Tone;
};

type ProgressItem = {
  label: string;
  value: string;
  bar: number;
  note: string;
  tone: Tone;
};

type IssueItem = {
  title: string;
  desc: string;
  tag: string;
  tone: Tone;
};

const toneMap: Record<
  Tone,
  {
    icon: string;
    iconDark: string;
    ring: string;
    chip: string;
    text: string;
  }
> = {
  blue: {
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    iconDark: 'bg-white/10 text-white ring-white/15',
    ring: 'ring-blue-100',
    chip: 'bg-blue-50 text-blue-700 ring-blue-100',
    text: 'text-blue-700',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    iconDark: 'bg-white/10 text-white ring-white/15',
    ring: 'ring-emerald-100',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    text: 'text-emerald-700',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    iconDark: 'bg-white/10 text-white ring-white/15',
    ring: 'ring-amber-100',
    chip: 'bg-amber-50 text-amber-700 ring-amber-100',
    text: 'text-amber-700',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-700 ring-rose-100',
    iconDark: 'bg-white/10 text-white ring-white/15',
    ring: 'ring-rose-100',
    chip: 'bg-rose-50 text-rose-700 ring-rose-100',
    text: 'text-rose-700',
  },
  slate: {
    icon: 'bg-slate-100 text-slate-700 ring-slate-200',
    iconDark: 'bg-white/10 text-white ring-white/15',
    ring: 'ring-slate-200',
    chip: 'bg-slate-100 text-slate-700 ring-slate-200',
    text: 'text-slate-700',
  },
};

const roleLabels: Record<RoleKey, string> = {
  boss: '老板',
  budget: '预算员',
  manager: '项目经理',
  site: '现场人员',
};

const roleMeta: Record<
  RoleKey,
  {
    title: string;
    lead: string;
    theme: string;
    summary: string;
    heroBadge: string;
    heroAction: string;
    heroActionHint: string;
    nav: NavItem[];
    metrics: Metric[];
    actions: ActionItem[];
    progress: ProgressItem[];
    issues: IssueItem[];
  }
> = {
  boss: {
    title: '经营结果',
    lead: '先看总盘，再下钻到回款 / 应收 / 项目异常。老板进来第一眼只看结果，不先碰明细。',
    theme: 'bg-slate-950',
    summary: '本月经营平稳，两个项目回款偏慢，需要先压住应收再看新增报量。',
    heroBadge: '经营总览',
    heroAction: '下钻项目',
    heroActionHint: '看经营结果、回款 / 应收和异常提醒',
    nav: [
      { label: '经营结果', note: '先看总盘', icon: BarChart3, active: true },
      { label: '回款 / 应收', note: '资金节奏', icon: WalletCards },
      { label: '项目穿透', note: '单项目追踪', icon: Building2 },
      { label: '异常提醒', note: '优先处理', icon: AlertTriangle },
    ],
    metrics: [
      { label: '本月经营结果', value: '8,642 万元', note: '比上月 +12.4%', icon: CircleDollarSign, tone: 'blue', delta: '+12.4%' },
      { label: '回款 / 应收', value: '5,286 / 1,632', note: '单位：万元', icon: WalletCards, tone: 'emerald', delta: '76.8%' },
      { label: '超期应收', value: '486 万元', note: '需要重点催收', icon: Clock3, tone: 'amber', delta: '48 笔' },
      { label: '异常项目', value: '3 个', note: '本周已发提醒', icon: AlertTriangle, tone: 'rose', delta: '2 个待复核' },
    ],
    actions: [
      { label: '查看经营总览', note: '总收入、成本和利润放在一起', icon: TrendingUp, tone: 'blue' },
      { label: '下钻回款明细', note: '按项目、合同、账龄继续拆', icon: ReceiptText, tone: 'emerald' },
      { label: '导出异常清单', note: '把催收和复核一起带走', icon: FileCheck2, tone: 'amber' },
    ],
    progress: [
      { label: '南京中交智慧港', value: '71%', bar: 71, note: '回款节奏偏慢，今日需回访', tone: 'amber' },
      { label: '滨河商业综合体', value: '88%', bar: 88, note: '合同已接近结算节点', tone: 'emerald' },
      { label: '太原南站配套工程', value: '62%', bar: 62, note: '存在辅材差异，先复核再结算', tone: 'rose' },
    ],
    issues: [
      { title: '超期应收 486 万元', desc: '按项目列出账龄，先处理 30 天以上回款。', tag: '优先催收', tone: 'rose' },
      { title: '异常项目 3 个', desc: '包含材料差异、结算待审和证据缺口。', tag: '经营提醒', tone: 'amber' },
      { title: '本周关键动作', desc: '项目复盘、回款回访、异常跟进同步看。', tag: '已安排', tone: 'emerald' },
    ],
  },
  budget: {
    title: '报量',
    lead: '预算员先看报量与差异，再看证据链、异常对账和结算资料。页面先总后分，减少多层跳转。',
    theme: 'bg-blue-950',
    summary: '本月报量已形成闭环，但还有两项异常对账需要处理，证据链不完整的行项不能直接结算。',
    heroBadge: '报量总览',
    heroAction: '新建报量',
    heroActionHint: '看报量、异常对账和结算资料',
    nav: [
      { label: '报量', note: '本月核心入口', icon: ReceiptText, active: true },
      { label: '异常对账', note: '差异先处理', icon: AlertTriangle },
      { label: '结算资料', note: '资料完整性', icon: FileText },
      { label: '签证跟踪', note: '现场变更', icon: FileCheck2 },
    ],
    metrics: [
      { label: '本月已报量', value: '218.6 万', note: '按项目汇总', icon: ReceiptText, tone: 'blue', delta: '+12 项' },
      { label: '待审报量', value: '5 项', note: '复核后可入结算', icon: FileCheck2, tone: 'amber', delta: '2 项超时' },
      { label: '异常对账', value: '2 项', note: '需要核对来源和差异', icon: AlertTriangle, tone: 'rose', delta: '1 项需回访' },
      { label: '证据链', value: '12 份', note: '照片、签证和回单已归档', icon: BadgeCheck, tone: 'emerald', delta: '完整率 92%' },
    ],
    actions: [
      { label: '新建月度报量', note: '先选项目，再进报量工作台', icon: NotebookPen, tone: 'blue' },
      { label: '发起异常对账', note: '把差异项和责任人放一起', icon: AlertTriangle, tone: 'rose' },
      { label: '查看证据链', note: '按项目浏览签证和回单', icon: BadgeCheck, tone: 'emerald' },
    ],
    progress: [
      { label: '钢筋工程报量', value: '92%', bar: 92, note: '待审 1 项，差异较小', tone: 'emerald' },
      { label: '模板工程报量', value: '76%', bar: 76, note: '有 1 条需补证据链', tone: 'amber' },
      { label: '混凝土工程报量', value: '58%', bar: 58, note: '异常对账未完成', tone: 'rose' },
    ],
    issues: [
      { title: '模板工程差异 2 处', desc: '报量和甲方确认数不一致，需回查签证。', tag: '差异复核', tone: 'rose' },
      { title: '钢筋工程待审 1 项', desc: '资料已齐，等待预算员确认后入库。', tag: '待审', tone: 'amber' },
      { title: '证据链完整率 92%', desc: '剩余缺口主要是照片和现场签认。', tag: '资料补齐', tone: 'emerald' },
    ],
  },
  manager: {
    title: '施工进度',
    lead: '项目经理先看进度、日志和班组确认，再去处理风险和提醒。布局更偏执行，不把经营数字放在最前。',
    theme: 'bg-emerald-950',
    summary: '本周进度总体可控，日志填报和班组确认要和现场节奏同步，避免晚上集中补录。',
    heroBadge: '进度总览',
    heroAction: '填施工日志',
    heroActionHint: '看进度、日志和现场提醒',
    nav: [
      { label: '施工进度', note: '看节点完成率', icon: TrendingUp, active: true },
      { label: '施工日志', note: '日报和评论', icon: NotebookPen },
      { label: '班组确认', note: '现场签认', icon: ListChecks },
      { label: '提醒', note: '风险和待办', icon: Bell },
    ],
    metrics: [
      { label: '计划完成率', value: '68%', note: '主体结构领先计划', icon: TrendingUp, tone: 'emerald', delta: '+4%' },
      { label: '待填日志', value: '4 条', note: '今天下班前补齐', icon: NotebookPen, tone: 'amber', delta: '2 条超时' },
      { label: '今日风险', value: '2 项', note: '材料和天气要盯紧', icon: AlertTriangle, tone: 'rose', delta: '1 项可控' },
      { label: '班组确认', value: '3 个', note: '已回到班组群', icon: MessageSquare, tone: 'blue', delta: '1 个待确认' },
    ],
    actions: [
      { label: '提交施工日志', note: '直接从今天的进度写起', icon: NotebookPen, tone: 'emerald' },
      { label: '查看班组确认', note: '把未签认的事项单独拉出来', icon: ListChecks, tone: 'blue' },
      { label: '发出进度提醒', note: '同步给班组和现场人员', icon: Bell, tone: 'amber' },
    ],
    progress: [
      { label: '主体三层', value: '78%', bar: 78, note: '钢筋绑扎已收口', tone: 'emerald' },
      { label: '二次结构', value: '44%', bar: 44, note: '需要等材料进场', tone: 'amber' },
      { label: '样板区收尾', value: '18%', bar: 18, note: '待补签认资料', tone: 'rose' },
    ],
    issues: [
      { title: '今日待填施工日志 4 条', desc: '白天完成的事情尽量当天写完。', tag: '优先补齐', tone: 'amber' },
      { title: '班组确认 1 条未回', desc: '现场群已发，等班组长确认。', tag: '待确认', tone: 'rose' },
      { title: '材料到场提醒', desc: '明早模板和钢筋需要错峰进场。', tag: '已提醒', tone: 'emerald' },
    ],
  },
  site: {
    title: '施工日志填报',
    lead: '现场人员看到的是今天要完成什么、还缺什么、提醒在哪里。先把填报入口放前面，再看待办和进度。',
    theme: 'bg-amber-950',
    summary: '今天先补日志、照片和待办，再看进度；不让现场人员在多个模块之间来回找入口。',
    heroBadge: '现场总览',
    heroAction: '拍照填报',
    heroActionHint: '看日志填报、待办和提醒',
    nav: [
      { label: '日志填报', note: '今天先补完', icon: NotebookPen, active: true },
      { label: '我的待办', note: '个人任务', icon: ListChecks },
      { label: '照片补充', note: '现场留痕', icon: Camera },
      { label: '进度查看', note: '只看自己相关', icon: TrendingUp },
    ],
    metrics: [
      { label: '今日待填', value: '3 条', note: '尽量当天完成', icon: NotebookPen, tone: 'amber', delta: '1 条紧急' },
      { label: '照片待补', value: '2 张', note: '现场留痕和日志关联', icon: Camera, tone: 'blue', delta: '需补位' },
      { label: '个人待办', value: '4 项', note: '任务和提醒直接可见', icon: ListChecks, tone: 'emerald', delta: '2 项今天到期' },
      { label: '风险提醒', value: '1 条', note: '材料到场时间需确认', icon: AlertTriangle, tone: 'rose', delta: '待回复' },
    ],
    actions: [
      { label: '拍照填报日志', note: '先拍照，再补文字说明', icon: Camera, tone: 'blue' },
      { label: '补施工日志', note: '把今天的工序写完整', icon: NotebookPen, tone: 'amber' },
      { label: '查看个人待办', note: '提醒和截止时间都放这里', icon: ListChecks, tone: 'emerald' },
    ],
    progress: [
      { label: '钢筋绑扎', value: '82%', bar: 82, note: '已完成，待补照片', tone: 'emerald' },
      { label: '模板检查', value: '55%', bar: 55, note: '班组还在收口', tone: 'amber' },
      { label: '材料到场', value: '34%', bar: 34, note: '等司机确认时间', tone: 'rose' },
    ],
    issues: [
      { title: '今晚要补 3 条日志', desc: '日志先填完，再补照片和定位。', tag: '先完成', tone: 'amber' },
      { title: '照片待补 2 张', desc: '现场留痕和日志放在一起看。', tag: '补充', tone: 'blue' },
      { title: '个人待办 4 项', desc: '把提醒和截止时间直接摊开。', tag: '提醒', tone: 'emerald' },
    ],
  },
};

function toneClasses(tone: Tone, dark = false) {
  return dark ? toneMap[tone].iconDark : toneMap[tone].icon;
}

function ToneTag({ tone, children, dark = false }: { tone: Tone; children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
        dark ? 'bg-white/10 text-white/90 ring-white/15' : toneMap[tone].chip,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function MetricBlock({ metric, dark = false }: { metric: Metric; dark?: boolean }) {
  const Icon = metric.icon;
  return (
    <div
      className={[
        'rounded-[18px] border p-4 shadow-sm transition-transform duration-300',
        dark ? 'border-white/10 bg-white/10' : 'border-slate-200 bg-slate-50',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${toneClasses(metric.tone, dark)}`}>
          <Icon className="h-5 w-5" />
        </div>
        {metric.delta ? <ToneTag tone={metric.tone} dark={dark}>{metric.delta}</ToneTag> : null}
      </div>
      <div className={['mt-4 text-xs font-medium', dark ? 'text-white/65' : 'text-slate-500'].join(' ')}>
        {metric.label}
      </div>
      <div className={['mt-2 text-2xl font-semibold tabular-nums tracking-tight', dark ? 'text-white' : 'text-slate-950'].join(' ')}>
        {metric.value}
      </div>
      <div className={['mt-2 text-xs leading-5', dark ? 'text-white/65' : 'text-slate-500'].join(' ')}>
        {metric.note}
      </div>
    </div>
  );
}

function ActionButton({ action, dark = false }: { action: ActionItem; dark?: boolean }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      className={[
        'group flex w-full items-start gap-3 rounded-[18px] border px-4 py-3 text-left transition duration-300 active:scale-[0.99]',
        dark ? 'border-white/10 bg-white/10 hover:bg-white/15' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
      ].join(' ')}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses(action.tone, dark)}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={['block text-sm font-semibold', dark ? 'text-white' : 'text-slate-950'].join(' ')}>
          {action.label}
        </span>
        <span className={['mt-1 block text-xs leading-5', dark ? 'text-white/65' : 'text-slate-500'].join(' ')}>
          {action.note}
        </span>
      </span>
      <ChevronRight className={['mt-1 h-4 w-4 shrink-0', dark ? 'text-white/55' : 'text-slate-400'].join(' ')} />
    </button>
  );
}

function SurfaceCard({
  title,
  desc,
  action,
  children,
  className = '',
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={['rounded-[24px] border border-slate-200 bg-white shadow-sm', className].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{desc}</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function RoleNav({ nav }: { nav: NavItem[] }) {
  return (
    <div className="space-y-2">
      {nav.map(item => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            aria-pressed={item.active}
            className={[
              'group flex w-full items-start gap-3 rounded-[18px] border px-4 py-3 text-left transition duration-300',
              item.active ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50',
            ].join(' ')}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${item.active ? toneMap.blue.icon : toneMap.slate.icon}`}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={['block text-sm font-semibold', item.active ? 'text-blue-700' : 'text-slate-950'].join(' ')}>
                {item.label}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{item.note}</span>
            </span>
            {item.active ? <span className="mt-2 h-2 w-2 rounded-full bg-blue-600" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function HeroPanel({
  role,
  meta,
}: {
  role: string;
  meta: (typeof roleMeta)[RoleKey];
}) {
  return (
    <section className={`overflow-hidden rounded-[28px] border border-slate-200 ${meta.theme} shadow-sm`}>
      <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1.08fr)_320px] xl:gap-5 xl:px-6 xl:py-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ToneTag tone="slate" dark>{role}</ToneTag>
            <ToneTag tone="blue" dark>{meta.heroBadge}</ToneTag>
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">{meta.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">{meta.lead}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {meta.metrics.map(metric => (
              <MetricBlock key={metric.label} metric={metric} dark />
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">今天先做</div>
              <p className="mt-1 text-xs leading-5 text-white/68">{meta.heroActionHint}</p>
            </div>
            <Sparkles className="h-5 w-5 text-white/75" />
          </div>
          <div className="mt-4 space-y-2">
            {meta.actions.map(action => (
              <ActionButton key={action.label} action={action} dark />
            ))}
          </div>
          <div className="mt-4 rounded-[18px] border border-white/10 bg-slate-950/35 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white/68">
              <CheckCircle2 className="h-4 w-4" />
              预览说明
            </div>
            <p className="mt-2 text-sm leading-6 text-white/78">{meta.summary}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BossWorkspace({ meta }: { meta: (typeof roleMeta)[RoleKey] }) {
  const projects = [
    {
      name: '南京中交智慧港',
      settlement: '2,140 万',
      received: '1,518 万',
      receivable: '622 万',
      rate: '71%',
      risk: '回款偏慢',
      tone: 'amber' as const,
    },
    {
      name: '滨河商业综合体',
      settlement: '1,860 万',
      received: '1,480 万',
      receivable: '380 万',
      rate: '88%',
      risk: '结算在即',
      tone: 'emerald' as const,
    },
    {
      name: '太原南站配套工程',
      settlement: '1,520 万',
      received: '1,028 万',
      receivable: '492 万',
      rate: '62%',
      risk: '材料差异',
      tone: 'rose' as const,
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_340px]">
      <div className="space-y-4">
        <HeroPanel role="老板视图" meta={meta} />

        <SurfaceCard
          title="项目经营"
          desc="先把总盘摆出来，再下钻到单项目的结算、回款和风险。"
          action={<ToneTag tone="blue">项目穿透</ToneTag>}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="overflow-hidden rounded-[20px] border border-slate-200">
              <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">项目</th>
                    <th className="px-4 py-3 text-right font-medium">结算</th>
                    <th className="px-4 py-3 text-right font-medium">已收</th>
                    <th className="px-4 py-3 text-right font-medium">应收</th>
                    <th className="px-4 py-3 text-right font-medium">回款率</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {projects.map(project => (
                    <tr key={project.name} className="hover:bg-slate-50/80">
                      <td className="px-4 py-4 font-medium text-slate-950">{project.name}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700">{project.settlement}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-emerald-700">{project.received}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-amber-700">{project.receivable}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700">{project.rate}</td>
                      <td className="px-4 py-4">
                        <ToneTag tone={project.tone}>{project.risk}</ToneTag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 rounded-[20px] bg-slate-50 p-4">
              {meta.progress.map(item => (
                <div key={item.label} className="space-y-2 rounded-[18px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.note}</div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-slate-900">{item.value}</div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${toneMap[item.tone].chip.replace('text-' + item.tone + '-700', '').replace('ring-' + item.tone + '-100', '').includes('bg-') ? '' : ''}`}
                      style={{ width: `${item.bar}%`, backgroundColor: item.tone === 'emerald' ? '#10b981' : item.tone === 'amber' ? '#f59e0b' : '#f43f5e' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          title="回款 / 应收"
          desc="资金节奏和异常项目放在一起，老板不需要来回翻页。"
          action={<ToneTag tone="amber">超期 486 万</ToneTag>}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              {meta.progress.map(item => (
                <div key={item.label} className="rounded-[18px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-slate-950">{item.label}</span>
                    <span className={`font-semibold ${toneMap[item.tone].text}`}>{item.value}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${item.bar}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {meta.issues.map(issue => (
                <div key={issue.title} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-950">{issue.title}</div>
                    <ToneTag tone={issue.tone}>{issue.tag}</ToneTag>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{issue.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      </div>

      <aside className="space-y-4">
        <SurfaceCard title="角色导航" desc="老板只保留结果相关入口，避免被执行明细打断。">
          <RoleNav nav={meta.nav} />
        </SurfaceCard>

        <SurfaceCard title="今日提醒" desc="只保留必须立即处理的事项。">
          <div className="space-y-3">
            <div className="rounded-[18px] border border-amber-100 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                超期应收复核
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-800">486 万元需要先对账，再安排催收话术。</p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                经营摘要已更新
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">今天的经营结果、回款和异常提醒已经汇总。</p>
            </div>
          </div>
        </SurfaceCard>
      </aside>
    </div>
  );
}

function BudgetWorkspace({ meta }: { meta: (typeof roleMeta)[RoleKey] }) {
  const rows = [
    { name: '钢筋工程报量', project: '南京中交智慧港', report: '92%', review: '待审 1 项', diff: '0.8%', tone: 'emerald' as const },
    { name: '模板工程报量', project: '滨河商业综合体', report: '76%', review: '补证据链', diff: '2 处差异', tone: 'amber' as const },
    { name: '混凝土工程报量', project: '太原南站配套工程', report: '58%', review: '异常对账', diff: '1.6%', tone: 'rose' as const },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_340px]">
      <div className="space-y-4">
        <HeroPanel role="预算员视图" meta={meta} />

        <SurfaceCard title="报量" desc="先选项目，再看本月报量、复核、证据链和差异。">
          <div className="overflow-hidden rounded-[20px] border border-slate-200">
            <table className="min-w-[780px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">报量项</th>
                  <th className="px-4 py-3 font-medium">项目</th>
                  <th className="px-4 py-3 text-right font-medium">报量进度</th>
                  <th className="px-4 py-3 text-right font-medium">差异</th>
                  <th className="px-4 py-3 font-medium">复核状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map(row => (
                  <tr key={row.name} className="hover:bg-slate-50/80">
                    <td className="px-4 py-4 font-medium text-slate-950">{row.name}</td>
                    <td className="px-4 py-4 text-slate-700">{row.project}</td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-700">{row.report}</td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-700">{row.diff}</td>
                    <td className="px-4 py-4"><ToneTag tone={row.tone}>{row.review}</ToneTag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard title="异常对账" desc="差异项和责任人放在同一个区块里，预算员可以直接开始处理。">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              {meta.issues.map(issue => (
                <div key={issue.title} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-950">{issue.title}</div>
                    <ToneTag tone={issue.tone}>{issue.tag}</ToneTag>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{issue.desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[20px] bg-blue-950 p-4 text-white">
              <div className="text-sm font-semibold">处理顺序</div>
              <div className="mt-3 space-y-2">
                {[
                  '先确认差异来源，再补证据链。',
                  '把待审和异常分开，避免同一张表里混在一起。',
                  '需要回单的项先拆到项目级，防止后续结算卡住。',
                ].map((item, index) => (
                  <div key={item} className="flex items-start gap-3 rounded-[18px] border border-white/10 bg-white/10 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-xs leading-5 text-white/80">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <aside className="space-y-4">
        <SurfaceCard title="角色导航" desc="预算员看的是报量、对账、结算和签证。">
          <RoleNav nav={meta.nav} />
        </SurfaceCard>

        <SurfaceCard title="结算资料" desc="缺什么资料一眼可见，避免报量完成后才发现证据缺口。">
          <div className="space-y-3">
            <div className="rounded-[18px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">证据链完整率</div>
                  <div className="mt-1 text-xs text-slate-500">照片、签认、回单已归档</div>
                </div>
                <div className="text-sm font-semibold tabular-nums text-emerald-700">92%</div>
              </div>
            </div>
            <div className="rounded-[18px] border border-amber-100 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <FileCheck2 className="h-4 w-4" />
                2 项待补齐
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-800">缺口主要是签字照片和异常对账备注。</p>
            </div>
          </div>
        </SurfaceCard>
      </aside>
    </div>
  );
}

function ManagerWorkspace({ meta }: { meta: (typeof roleMeta)[RoleKey] }) {
  const logItems = [
    {
      title: '主体三层钢筋绑扎',
      time: '10:20',
      desc: '完成约 78%，班组已确认收口，下午补拍两张照片。',
      tone: 'emerald' as const,
    },
    {
      title: '二次结构材料进场',
      time: '13:40',
      desc: '模板材料到场稍晚，需要调整第二天的交叉作业。',
      tone: 'amber' as const,
    },
    {
      title: '样板区收尾复核',
      time: '17:05',
      desc: '有 1 处签认待补，先发到班组群再跟进。',
      tone: 'rose' as const,
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_340px]">
      <div className="space-y-4">
        <HeroPanel role="项目经理视图" meta={meta} />

        <SurfaceCard title="施工进度" desc="进度在前，日志和确认在后，项目经理每天先看这一块。">
          <div className="grid gap-3 lg:grid-cols-3">
            {meta.progress.map(item => (
              <div key={item.label} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{item.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.note}</div>
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${toneMap[item.tone].text}`}>{item.value}</div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${item.bar}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard title="施工日志" desc="日志和评论放在一起，项目经理可以直接看进展，也可以直接回。">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              {logItems.map(item => (
                <div key={item.title} className="rounded-[18px] border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{item.title}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</div>
                    </div>
                    <ToneTag tone={item.tone}>{item.time}</ToneTag>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[20px] bg-emerald-950 p-4 text-white">
              <div className="text-sm font-semibold">今日施工日志</div>
              <p className="mt-2 text-xs leading-5 text-white/72">把今天的进度写在一个卡片里，别让班组确认和日志分散在多个入口。</p>
              <div className="mt-4 space-y-2">
                {[
                  '先写今天完成了什么，再补风险和明天安排。',
                  '班组确认、照片和日志一起提交，减少二次补录。',
                  '夜间施工和材料调整单独标出来，方便明早复盘。',
                ].map((item, index) => (
                  <div key={item} className="flex items-start gap-3 rounded-[18px] border border-white/10 bg-white/10 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-xs leading-5 text-white/80">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <aside className="space-y-4">
        <SurfaceCard title="角色导航" desc="项目经理看的是进度、日志、班组确认和提醒。">
          <RoleNav nav={meta.nav} />
        </SurfaceCard>

        <SurfaceCard title="提醒" desc="把需要今天处理的事情放在这里。">
          <div className="space-y-3">
            {meta.issues.map(issue => (
              <div key={issue.title} className="rounded-[18px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">{issue.title}</div>
                  <ToneTag tone={issue.tone}>{issue.tag}</ToneTag>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{issue.desc}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </aside>
    </div>
  );
}

function SiteWorkspace({ meta }: { meta: (typeof roleMeta)[RoleKey] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_340px]">
      <div className="space-y-4">
        <HeroPanel role="现场人员视图" meta={meta} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.16fr)_minmax(280px,0.84fr)]">
          <SurfaceCard
            title="施工日志填报"
            desc="现场人员最先看到的是填报入口，不是层层目录。"
            action={<ToneTag tone="amber">今日 3 条待补</ToneTag>}
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: '项目', value: '南京中交智慧港' },
                  { label: '工序', value: '主体三层钢筋绑扎' },
                  { label: '班组', value: '钢筋班组 A' },
                ].map(field => (
                  <label key={field.label} className="space-y-2">
                    <span className="block text-xs font-medium text-slate-500">{field.label}</span>
                    <input
                      type="text"
                      defaultValue={field.value}
                      className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                ))}
              </div>

              <label className="space-y-2">
                <span className="block text-xs font-medium text-slate-500">日志内容</span>
                <textarea
                  defaultValue="今天完成主体三层钢筋绑扎，夜间混凝土浇筑需要安排复核，模板材料明早到场，照片待补。"
                  className="min-h-[150px] w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                {['现场照片 1', '现场照片 2', '现场照片 3'].map(label => (
                  <button
                    key={label}
                    type="button"
                    className="group flex min-h-[110px] items-center justify-center rounded-[18px] border border-dashed border-slate-300 bg-slate-50 text-sm text-blue-800 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
                  >
                    <span className="text-center">
                      <Camera className="mx-auto mb-2 h-5 w-5 text-blue-600 transition group-hover:text-blue-700" />
                      {label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-[0.99]">
                  <NotebookPen className="h-4 w-4" />
                  提交日志
                </button>
                <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]">
                  <MapPinned className="h-4 w-4" />
                  关联定位
                </button>
                <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]">
                  <FileText className="h-4 w-4" />
                  追加备注
                </button>
              </div>
            </div>
          </SurfaceCard>

          <div className="space-y-4">
            <SurfaceCard title="个人待办与提醒" desc="现场人员只看自己的任务和提醒，不看不相关的模块。">
              <div className="space-y-3">
                {meta.issues.map(issue => (
                  <div key={issue.title} className="rounded-[18px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">{issue.title}</div>
                      <ToneTag tone={issue.tone}>{issue.tag}</ToneTag>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{issue.desc}</p>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard title="施工进度" desc="只看和自己有关的进度，不把总盘塞给现场人员。">
              <div className="space-y-3">
                {meta.progress.map(item => (
                  <div key={item.label} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{item.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.note}</div>
                      </div>
                      <div className={`text-sm font-semibold tabular-nums ${toneMap[item.tone].text}`}>{item.value}</div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-amber-500" style={{ width: `${item.bar}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <SurfaceCard title="角色导航" desc="现场只保留日志、待办、照片和进度。">
          <RoleNav nav={meta.nav} />
        </SurfaceCard>

        <SurfaceCard title="今日状态" desc="把今天必须做完的事情摆在最上面。">
          <div className="rounded-[20px] bg-amber-950 p-4 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="h-4 w-4" />
              今天先补齐
            </div>
            <div className="mt-3 space-y-2">
              {[
                '日志先写完，再补照片和定位。',
                '待办和提醒放在一起，减少来回翻页。',
                '如果材料有变化，先发给项目经理。',
              ].map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-[18px] border border-white/10 bg-white/10 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-xs leading-5 text-white/80">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      </aside>
    </div>
  );
}

export default function RoleWorkbenchPreviewPage() {
  const [role, setRole] = useState<RoleKey>('boss');
  const meta = roleMeta[role];

  return (
    <main className="min-h-[100dvh] bg-[linear-gradient(180deg,#f7f8fb_0%,#eef2f7_100%)] text-slate-950">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1680px] gap-4 p-4 lg:p-6">
        <aside className="hidden w-[300px] shrink-0 lg:sticky lg:top-6 lg:flex lg:flex-col">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                <HardHat className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">工作台预览</div>
                <div className="text-xs text-slate-500">独立页面 · 四角色预览</div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-slate-500">角色导航</div>
              <div className="space-y-2">
                {Object.entries(roleLabels).map(([key, label]) => {
                  const current = key as RoleKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRole(current)}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left transition duration-300 active:scale-[0.99]',
                        role === current ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span className="min-w-0">
                        <span className={['block text-sm font-semibold', role === current ? 'text-blue-700' : 'text-slate-950'].join(' ')}>
                          {label}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {current === 'boss'
                            ? '经营结果和回款 / 应收'
                            : current === 'budget'
                              ? '报量、异常对账、结算资料'
                              : current === 'manager'
                                ? '施工进度、日志填报、提醒'
                                : '施工日志填报和个人待办'}
                        </span>
                      </span>
                      {role === current ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-[22px] bg-slate-950 p-4 text-white">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4" />
                设计方向
              </div>
              <p className="mt-2 text-xs leading-6 text-white/72">
                浅色为主，关键区域更深一点；先总再分；每个角色看到的工作台不一样，布局和信息层级也不一样。
              </p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-4">
          <header className="sticky top-4 z-20 rounded-[28px] border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <Link
                  href="/ui-preview"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100"
                >
                  <PanelLeft className="h-5 w-5" />
                </Link>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight text-slate-950">工作台预览</h1>
                    <ToneTag tone="blue">独立页面</ToneTag>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                    四个角色共用一个系统，但不共用一套信息层级。老板、预算员、项目经理、现场人员看到的不是同一块台面。
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex overflow-x-auto rounded-full border border-slate-200 bg-slate-50 p-1">
                  {(Object.keys(roleLabels) as RoleKey[]).map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setRole(item)}
                      className={[
                        'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition duration-300 active:scale-[0.99]',
                        role === item ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950',
                      ].join(' ')}
                    >
                      {roleLabels[item]}
                    </button>
                  ))}
                </div>

                <label className="flex h-11 min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-500 shadow-sm lg:w-[320px]">
                  <Search className="h-4 w-4 shrink-0" />
                  <input
                    type="text"
                    placeholder="搜索项目、日志、报量、待办"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
                  />
                </label>

                <button className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]">
                  <CalendarDays className="h-4 w-4" />
                  2026-08-05
                </button>
              </div>
            </div>
          </header>

          {role === 'boss' ? <BossWorkspace meta={meta} /> : null}
          {role === 'budget' ? <BudgetWorkspace meta={meta} /> : null}
          {role === 'manager' ? <ManagerWorkspace meta={meta} /> : null}
          {role === 'site' ? <SiteWorkspace meta={meta} /> : null}
        </section>
      </div>
    </main>
  );
}
