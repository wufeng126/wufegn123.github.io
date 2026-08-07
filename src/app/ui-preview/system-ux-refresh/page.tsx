'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  Camera,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  HardHat,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  ReceiptText,
  Search,
  ShieldCheck,
  Table2,
  TrendingUp,
  UserRound,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type RoleKey = 'site' | 'budget' | 'manager' | 'boss';
type PreviewMode = 'workbench' | 'ledger' | 'mobile';
type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

type RoleConfig = {
  title: string;
  subtitle: string;
  primaryAction: string;
  quickActions: Array<{ label: string; icon: LucideIcon; tone: Tone }>;
  tasks: Array<{ title: string; meta: string; tag: string; tone: Tone }>;
  focus: Array<{ label: string; value: string; hint: string; tone: Tone }>;
};

const roles: Array<{ key: RoleKey; label: string; caption: string }> = [
  { key: 'site', label: '现场人员', caption: '每天只看高频事项' },
  { key: 'budget', label: '预算员', caption: '经营资料优先处理' },
  { key: 'manager', label: '项目经理', caption: '现场进度与确认' },
  { key: 'boss', label: '老板', caption: '结果、风险、资金' },
];

const modes: Array<{ key: PreviewMode; label: string }> = [
  { key: 'workbench', label: '角色工作台' },
  { key: 'ledger', label: '台账页面' },
  { key: 'mobile', label: '钉钉移动端' },
];

const navGroups = [
  {
    label: '今日高频',
    items: [
      { name: '工作台', icon: LayoutDashboard, active: true },
      { name: '施工日志', icon: ClipboardList },
      { name: '项目日报', icon: FileText },
    ],
  },
  {
    label: '项目经营',
    items: [
      { name: '项目管理', icon: Building2 },
      { name: '报量管理', icon: Table2 },
      { name: '证据链', icon: FileCheck2 },
      { name: '供应商结算', icon: ReceiptText },
    ],
  },
  {
    label: '低频沉淀',
    items: [
      { name: '经营分析', icon: TrendingUp },
      { name: '知识库', icon: Database },
      { name: '系统设置', icon: ShieldCheck },
    ],
  },
];

const roleData: Record<RoleKey, RoleConfig> = {
  site: {
    title: '今天先提交施工日志',
    subtitle: '首屏只放拍照录日志、我的日志、项目日报、工资查询。',
    primaryAction: '拍照录施工日志',
    quickActions: [
      { label: '拍照录施工日志', icon: Camera, tone: 'primary' },
      { label: '新建施工日志', icon: ClipboardList, tone: 'neutral' },
      { label: '查看我的日志', icon: FileText, tone: 'neutral' },
      { label: '工资查询', icon: WalletCards, tone: 'neutral' },
    ],
    tasks: [
      { title: '南京中交智慧港施工日志待提交', meta: '今天 18:00 前完成', tag: '待办', tone: 'warning' },
      { title: '项目日报汇总已生成', meta: '已阅 18/42 人', tag: '抄送', tone: 'neutral' },
      { title: '你的日志有 1 条评论', meta: '项目经理 @你核对班组人数', tag: '提醒', tone: 'primary' },
    ],
    focus: [
      { label: '我的待办', value: '2', hint: '今天处理', tone: 'warning' },
      { label: '未读提醒', value: '3', hint: '直达业务', tone: 'primary' },
      { label: '本月日志', value: '21', hint: '已提交 19', tone: 'success' },
    ],
  },
  budget: {
    title: '先处理经营风险',
    subtitle: '签证、证据链、报量、结算放在首屏，日志只作为关联信息。',
    primaryAction: '进入经营待办',
    quickActions: [
      { label: '新增证据', icon: FileCheck2, tone: 'primary' },
      { label: '月度报量', icon: Table2, tone: 'neutral' },
      { label: '签证处理', icon: BadgeCheck, tone: 'neutral' },
      { label: '预约日志提交', icon: Clock3, tone: 'neutral' },
    ],
    tasks: [
      { title: '模板工程少报原因待填写', meta: '实际进度到 3 层，月报量偏低', tag: '风险', tone: 'danger' },
      { title: '滨河商业二标证据待归档', meta: '甲方聊天记录 4 张图片', tag: '待办', tone: 'warning' },
      { title: '供应商结算台账需要复核', meta: '本期累计已付差异 12,000 元', tag: '复核', tone: 'primary' },
    ],
    focus: [
      { label: '经营待办', value: '8', hint: '含风险 3', tone: 'danger' },
      { label: '待归档证据', value: '14', hint: '本周新增', tone: 'primary' },
      { label: '待确认报量', value: '5', hint: '2 项异常', tone: 'warning' },
    ],
  },
  manager: {
    title: '确认现场进展',
    subtitle: '施工日志、人员出勤、进度计划、班组确认保留为高频入口。',
    primaryAction: '提交施工日志',
    quickActions: [
      { label: '提交施工日志', icon: ClipboardList, tone: 'primary' },
      { label: '编辑进度计划', icon: Gauge, tone: 'neutral' },
      { label: '确认风险提醒', icon: AlertCircle, tone: 'neutral' },
      { label: '班组确认', icon: UserRound, tone: 'neutral' },
    ],
    tasks: [
      { title: '3 条施工日志待确认提醒', meta: '只做提醒确认，不改变日志状态', tag: '提醒', tone: 'warning' },
      { title: '主体三层计划本周到期', meta: '请在日志中填写实际进展', tag: '进度', tone: 'primary' },
      { title: '班组结算单待查看', meta: '南京中交智慧港木工班组', tag: '抄送', tone: 'neutral' },
    ],
    focus: [
      { label: '现场待办', value: '6', hint: '今天处理', tone: 'warning' },
      { label: '进度偏差', value: '1', hint: '需要说明', tone: 'danger' },
      { label: '已阅日报', value: '18/42', hint: '公司总人数', tone: 'primary' },
    ],
  },
  boss: {
    title: '先看结果，再看风险',
    subtitle: '减少录入功能，突出资金、利润、回款、异常和待拍板事项。',
    primaryAction: '查看经营总览',
    quickActions: [
      { label: '经营总览', icon: TrendingUp, tone: 'primary' },
      { label: '资金风险', icon: WalletCards, tone: 'neutral' },
      { label: '项目日报', icon: FileText, tone: 'neutral' },
      { label: '关键待确认', icon: Bell, tone: 'neutral' },
    ],
    tasks: [
      { title: '南京中交智慧港应收台账更新', meta: '合同应收、已收、未收已同步', tag: '结果', tone: 'success' },
      { title: '供应商未付金额连续上升', meta: '本周新增 126,000 元', tag: '风险', tone: 'danger' },
      { title: '2 条结算证据建议走补充协议', meta: '预算部已标记处理结果', tag: '建议', tone: 'primary' },
    ],
    focus: [
      { label: '项目毛利', value: '18.6%', hint: '较上月 +1.2%', tone: 'success' },
      { label: '应收未回', value: '286万', hint: '3 个项目', tone: 'danger' },
      { label: '待拍板', value: '4', hint: '金额相关', tone: 'warning' },
    ],
  },
};

const ledgerRows = [
  { date: '2026-08-03', supplier: '南京华筑模板材料', project: '南京中交智慧港', current: '85,000', settled: '416,000', paid: '290,000', payable: '126,000', status: '待复核', tone: 'warning' as Tone },
  { date: '2026-07-28', supplier: '滨河钢材供应站', project: '滨河商业综合体二标', current: '132,400', settled: '822,400', paid: '690,000', payable: '132,400', status: '待付款', tone: 'danger' as Tone },
  { date: '2026-07-21', supplier: '城东周转料租赁', project: '城东学校改扩建', current: '46,800', settled: '188,600', paid: '188,600', payable: '0', status: '已结清', tone: 'success' as Tone },
  { date: '2026-07-12', supplier: '奥体零星材料部', project: '奥体中心配套改造', current: '18,240', settled: '63,240', paid: '45,000', payable: '18,240', status: '待确认', tone: 'primary' as Tone },
];

const iconTone: Record<Tone, string> = {
  primary: 'bg-blue-50 text-blue-700 ring-blue-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  danger: 'bg-rose-50 text-rose-700 ring-rose-100',
  neutral: 'bg-slate-50 text-slate-600 ring-slate-200',
};

const statusTone: Record<Tone, string> = {
  primary: 'bg-blue-50 text-blue-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  neutral: 'bg-slate-100 text-slate-600',
};

export default function SystemUxRefreshPreview() {
  const [role, setRole] = useState<RoleKey>('budget');
  const [mode, setMode] = useState<PreviewMode>('workbench');
  const current = useMemo(() => roleData[role], [role]);

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1500px] border-x border-slate-200/80 bg-white">
        <aside className="hidden w-[238px] shrink-0 border-r border-slate-200 bg-[#f8fafc] lg:block">
          <div className="border-b border-slate-200 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                <HardHat className="size-5" strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-sm font-semibold">工程经营系统</div>
                <div className="text-xs text-slate-500">视觉刷新预览</div>
              </div>
            </div>
          </div>
          <div className="space-y-5 px-3 py-4">
            {navGroups.map((group) => (
              <section key={group.label}>
                <div className="px-2 pb-2 text-[11px] font-medium text-slate-400">{group.label}</div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.name}
                        className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${
                          item.active
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                        }`}
                      >
                        <Icon className="size-4" strokeWidth={1.8} />
                        <span>{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/94 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white lg:hidden">
                  <Menu className="size-5" strokeWidth={1.8} />
                </button>
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>工作台</span>
                    <ChevronRight className="size-3" strokeWidth={1.8} />
                    <span>按角色自动收敛</span>
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-[0] md:text-2xl">
                    系统 UX / UI 深度优化方向
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 md:flex">
                  <Search className="size-4" strokeWidth={1.8} />
                  搜索项目、单据、人员
                </div>
                <button className="relative flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white">
                  <Bell className="size-4" strokeWidth={1.8} />
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-rose-500" />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-8 px-4 py-6 md:px-7 md:py-7">
            <section className="flex flex-col gap-4 border-b border-slate-200 pb-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  {roles.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setRole(item.key)}
                      className={`min-w-[92px] rounded-md px-3 py-2 text-sm transition ${
                        role === item.key
                          ? 'bg-white font-semibold text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                          : 'text-slate-500 hover:text-slate-950'
                      }`}
                    >
                      <span className="block">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{item.caption}</span>
                    </button>
                  ))}
                </div>
                <div className="text-sm text-slate-500">
                  主蓝只用于导航选中、主按钮和关键入口；状态色只承担状态含义。
                </div>
              </div>
              <div className="inline-flex w-full rounded-lg bg-slate-100 p-1 sm:w-auto">
                {modes.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setMode(item.key)}
                    className={`flex-1 rounded-md px-4 py-2 text-sm transition sm:flex-none ${
                      mode === item.key
                        ? 'bg-blue-600 font-medium text-white'
                        : 'text-slate-500 hover:text-slate-950'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            {mode === 'workbench' && <WorkbenchPreview current={current} />}
            {mode === 'ledger' && <LedgerPreview />}
            {mode === 'mobile' && <MobilePreview current={current} role={role} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function WorkbenchPreview({ current }: { current: RoleConfig }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-7">
        <section className="rounded-xl border border-blue-100 bg-[#f7fbff] px-5 py-6 md:px-7">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <div className="mb-3 text-xs font-medium text-blue-700">当前主任务</div>
              <h2 className="text-3xl font-semibold tracking-[0] text-slate-950">{current.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{current.subtitle}</p>
            </div>
            <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-base font-semibold text-white transition hover:bg-blue-700">
              {current.primaryAction}
              <ArrowRight className="size-4" strokeWidth={1.8} />
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="font-semibold">高频入口</h3>
              <p className="mt-1 text-xs text-slate-500">只放这个角色最常用的动作。</p>
            </div>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-4">
            {current.quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button key={action.label} className="group bg-white p-4 text-left transition hover:bg-slate-50">
                  <div className={`mb-4 flex size-10 items-center justify-center rounded-lg ring-1 ${iconTone[action.tone]}`}>
                    <Icon className="size-5" strokeWidth={1.8} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{action.label}</span>
                    <ChevronRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" strokeWidth={1.8} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="font-semibold">待办和提醒</h3>
              <p className="mt-1 text-xs text-slate-500">通知点进去后直接定位到业务页、项目、单据或日志。</p>
            </div>
            <button className="rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200">全部</button>
          </div>
          <div className="divide-y divide-slate-100">
            {current.tasks.map((task) => (
              <div key={task.title} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{task.title}</span>
                    <StatusBadge tone={task.tone}>{task.tag}</StatusBadge>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{task.meta}</div>
                </div>
                <button className="h-9 rounded-md bg-slate-100 px-3 text-sm text-slate-700 hover:bg-slate-200">处理</button>
              </div>
            ))}
          </div>
        </section>
      </section>

      <aside className="space-y-7">
        <section className="border-l border-slate-200 pl-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">今日重点</h3>
              <p className="mt-1 text-xs text-slate-500">更像仪表盘，少一点装饰。</p>
            </div>
            <Gauge className="size-4 text-slate-400" strokeWidth={1.8} />
          </div>
          <div className="divide-y divide-slate-200">
            {current.focus.map((item) => (
              <div key={item.label} className="py-4 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-500">{item.label}</span>
                  <StatusBadge tone={item.tone}>{item.hint}</StatusBadge>
                </div>
                <div className="mt-2 font-mono text-4xl font-semibold tracking-[0] text-slate-950">{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <MessageSquareText className="size-4 text-blue-600" strokeWidth={1.8} />
            钉钉消息模板
          </div>
          <div className="mt-4 rounded-md bg-white p-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-200">
            南京中交智慧港<br />
            报量少报提醒：模板工程差异 1000 平方<br />
            责任人：王预算<br />
            入口：点击查看报量详情
          </div>
        </section>
      </aside>
    </div>
  );
}

function LedgerPreview() {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">供应商与费用 / 结算管理</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">台账页更像“可操作表格”</h2>
          <p className="mt-2 text-sm text-slate-500">筛选和横向移动放到表格上方，累计数据按结算日期逐条递增。</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm text-slate-700">
            <Filter className="size-4" strokeWidth={1.8} />
            筛选
          </button>
          <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">新增结算</button>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-4">
        {[
          ['本期结算', '28.2万', '只统计本次'],
          ['累计结算', '149万', '按日期递增'],
          ['累计已付', '121万', '付款记录联动'],
          ['合同未付', '28万', '结算减已付'],
        ].map(([label, value, hint]) => (
          <div key={label} className="bg-white p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-slate-950">{value}</div>
            <div className="mt-1 text-xs text-slate-400">{hint}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex min-w-[860px] items-center justify-between gap-4">
            <div className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
              <Search className="size-4" strokeWidth={1.8} />
              搜索合同、供应商、项目
            </div>
            <div className="text-xs text-slate-500">横向滚动条固定在表格顶部，数据多时不用拉到底。</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-white text-left text-xs text-slate-500">
              <tr>
                {['结算日期', '供应商', '项目', '本次结算', '合同累计结算', '合同累计已付', '合同未付', '状态', '操作'].map((head) => (
                  <th key={head} className="border-b border-slate-200 px-5 py-3 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => (
                <tr key={`${row.date}-${row.supplier}`} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-5 py-4 font-mono text-xs text-slate-500">{row.date}</td>
                  <td className="border-b border-slate-100 px-5 py-4 font-medium text-slate-900">{row.supplier}</td>
                  <td className="border-b border-slate-100 px-5 py-4 text-slate-600">{row.project}</td>
                  <td className="border-b border-slate-100 px-5 py-4 font-mono">{row.current}</td>
                  <td className="border-b border-slate-100 px-5 py-4 font-mono">{row.settled}</td>
                  <td className="border-b border-slate-100 px-5 py-4 font-mono">{row.paid}</td>
                  <td className="border-b border-slate-100 px-5 py-4 font-mono">{row.payable}</td>
                  <td className="border-b border-slate-100 px-5 py-4">
                    <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
                  </td>
                  <td className="border-b border-slate-100 px-5 py-4">
                    <button className="text-sm font-medium text-blue-600">详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function MobilePreview({ current, role }: { current: RoleConfig; role: RoleKey }) {
  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_390px]">
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold">钉钉内打开时，先给用户“下一步做什么”</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            移动端不照搬完整后台导航。现场人员只保留拍照录日志、我的日志、项目日报、工资查询；预算员和项目经理保留各自高频待办。
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-3">
          {[
            ['通知更明确', '待办、风险、结果、抄送分开显示'],
            ['入口更短', '每条钉钉消息带业务直达链接'],
            ['页面更轻', '低频设置沉到二级页面或桌面端'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-white p-4">
              <div className="font-medium text-slate-900">{title}</div>
              <div className="mt-2 text-sm leading-6 text-slate-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[360px] rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)]">
        <div className="overflow-hidden rounded-[22px] bg-[#eef3f8]">
          <div className="bg-white px-4 py-3">
            <div className="mx-auto mb-3 h-1 w-16 rounded-full bg-slate-200" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">工程经营系统</div>
                <div className="text-lg font-semibold">{roles.find((item) => item.key === role)?.label}工作台</div>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Bell className="size-4" strokeWidth={1.8} />
              </div>
            </div>
          </div>
          <div className="space-y-3 p-3">
            <div className="rounded-lg bg-blue-600 p-4 text-white">
              <div className="text-sm text-blue-100">下一件事</div>
              <div className="mt-2 text-lg font-semibold">{current.tasks[0].title}</div>
              <button className="mt-4 h-9 rounded-md bg-white px-3 text-sm font-medium text-blue-700">立即处理</button>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
              {current.quickActions.slice(0, 4).map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.label} className="bg-white p-3 text-left">
                    <Icon className="mb-3 size-5 text-blue-600" strokeWidth={1.8} />
                    <div className="text-sm font-medium text-slate-900">{action.label}</div>
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">消息分组</span>
                <span className="text-xs text-slate-400">全部 6</span>
              </div>
              {['待办 2', '风险 1', '结果 2', '抄送 1'].map((item) => (
                <div key={item} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm first:border-t-0">
                  <span>{item}</span>
                  <ChevronRight className="size-4 text-slate-300" strokeWidth={1.8} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${statusTone[tone]}`}>
      {children}
    </span>
  );
}
