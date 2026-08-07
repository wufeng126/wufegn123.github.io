'use client';

import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  Filter,
  HardHat,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TableProperties,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';

type RoleKey = 'site' | 'budget' | 'manager' | 'boss';
type ModuleKey = 'construction' | 'project' | 'supplier';
type Tone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';

type NavGroup = {
  key: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  tone: Tone;
  items: string[];
};

type PageScenario = {
  key: ModuleKey;
  title: string;
  breadcrumb: string[];
  desc: string;
  primaryAction: string;
  secondaryAction: string;
  stats: { label: string; value: string; hint: string; tone: Tone }[];
  filters: string[];
  rows: { name: string; project: string; status: string; amount: string; owner: string; tone: Tone }[];
  emptyTitle: string;
  mobileActions: string[];
};

const roles: { key: RoleKey; label: string; desc: string }[] = [
  { key: 'site', label: '现场人员', desc: '只保留拍照录日志、我的日志、项目日报、工资查询' },
  { key: 'budget', label: '预算员', desc: '突出报量、签证、证据链、结算、经营风险' },
  { key: 'manager', label: '项目经理', desc: '突出施工日志、进度计划、班组确认、现场风险' },
  { key: 'boss', label: '老板', desc: '突出经营结果、资金风险、关键待确认事项' },
];

const roleNav: Record<RoleKey, NavGroup[]> = {
  site: [
    {
      key: 'workbench',
      label: '工作台',
      desc: '打开即办事',
      icon: LayoutDashboard,
      tone: 'blue',
      items: ['拍照录施工日志', '新建施工日志', '查看我的日志', '项目日报汇总', '工资查询'],
    },
    {
      key: 'construction',
      label: '施工管理',
      desc: '现场高频',
      icon: HardHat,
      tone: 'emerald',
      items: ['施工日志', '人员考勤'],
    },
    {
      key: 'personal',
      label: '个人中心',
      desc: '本人相关',
      icon: UsersRound,
      tone: 'slate',
      items: ['工资查询', '消息记录'],
    },
  ],
  budget: [
    {
      key: 'workbench',
      label: '工作台',
      desc: '待办优先',
      icon: LayoutDashboard,
      tone: 'blue',
      items: ['经营待办', '报量风险', '签证待推进', '证据链提醒'],
    },
    {
      key: 'project',
      label: '项目管理',
      desc: '经营资料',
      icon: Building2,
      tone: 'emerald',
      items: ['项目列表', '报量管理', '签证管理', '甲方回款', '结算证据链'],
    },
    {
      key: 'construction',
      label: '施工管理',
      desc: '现场关联',
      icon: HardHat,
      tone: 'amber',
      items: ['施工日志', '项目日报汇总', '进度计划'],
    },
    {
      key: 'team',
      label: '班组管理',
      desc: '成本结算',
      icon: UserRoundCheck,
      tone: 'violet',
      items: ['班组档案', '班组结算'],
    },
    {
      key: 'analysis',
      label: '经营分析',
      desc: '复盘看板',
      icon: BarChart3,
      tone: 'rose',
      items: ['经营总览', '成本中心', '月度经营月报'],
    },
  ],
  manager: [
    {
      key: 'workbench',
      label: '工作台',
      desc: '现场待办',
      icon: LayoutDashboard,
      tone: 'blue',
      items: ['提交施工日志', '日志评论', '班组确认', '进度提醒'],
    },
    {
      key: 'construction',
      label: '施工管理',
      desc: '每日使用',
      icon: HardHat,
      tone: 'emerald',
      items: ['施工日志', '人员考勤', '项目日报汇总', '进度计划'],
    },
    {
      key: 'project',
      label: '项目管理',
      desc: '项目资料',
      icon: Building2,
      tone: 'amber',
      items: ['项目详情', '签证管理', '结算证据链'],
    },
    {
      key: 'team',
      label: '班组管理',
      desc: '现场确认',
      icon: UserRoundCheck,
      tone: 'violet',
      items: ['班组档案', '班组结算确认'],
    },
  ],
  boss: [
    {
      key: 'workbench',
      label: '工作台',
      desc: '结果和风险',
      icon: LayoutDashboard,
      tone: 'blue',
      items: ['经营总览', '关键风险', '待确认事项', '日报摘要'],
    },
    {
      key: 'analysis',
      label: '经营分析',
      desc: '公司视角',
      icon: BarChart3,
      tone: 'emerald',
      items: ['经营总览', '项目应收台账', '成本利润中心', '月度经营月报'],
    },
    {
      key: 'project',
      label: '项目管理',
      desc: '看重点项目',
      icon: Building2,
      tone: 'amber',
      items: ['项目列表', '报量管理', '签证管理', '结算证据链'],
    },
    {
      key: 'system',
      label: '系统管理',
      desc: '低频维护',
      icon: Settings,
      tone: 'slate',
      items: ['用户管理', '权限管理', '钉钉配置', '数据备份'],
    },
  ],
};

const scenarios: PageScenario[] = [
  {
    key: 'construction',
    title: '施工日志',
    breadcrumb: ['施工管理', '施工日志'],
    desc: '页面打开先看今日待办和风险，再按天查看日志。录入、评论、风险确认都放在同一业务入口下。',
    primaryAction: '拍照录日志',
    secondaryAction: '新建日志',
    stats: [
      { label: '今日待提交', value: '6', hint: '只统计需本人处理', tone: 'amber' },
      { label: '待确认风险', value: '3', hint: '提醒确认即可', tone: 'rose' },
      { label: '日志评论', value: '8', hint: '未读 2 条', tone: 'blue' },
    ],
    filters: ['项目', '日期', '提交状态', '风险状态', '提交人'],
    rows: [
      { name: '主体三层钢筋绑扎', project: '南京中交智慧港项目', status: '待项目经理确认', amount: '-', owner: '赵经理', tone: 'amber' },
      { name: '地下室返工签证照片补充', project: '滨河商业综合体二标', status: '风险提醒', amount: '-', owner: '王预算', tone: 'rose' },
      { name: '模板加固与清理', project: '城东学校改扩建项目', status: '已提交', amount: '-', owner: '李工', tone: 'emerald' },
    ],
    emptyTitle: '当前筛选下暂无施工日志',
    mobileActions: ['拍照录日志', '我的日志', '项目日报'],
  },
  {
    key: 'project',
    title: '报量管理',
    breadcrumb: ['项目管理', '报量管理'],
    desc: '先选项目，再进入录入工作台；项目汇总对比与录入区分开，避免一个页面又宽又挤。',
    primaryAction: '新增月度报量',
    secondaryAction: '导出台账',
    stats: [
      { label: '本月对上报量', value: '218.6万', hint: '较上月 +12%', tone: 'blue' },
      { label: '少报提醒', value: '2项', hint: '需填写原因', tone: 'rose' },
      { label: '待预算确认', value: '5条', hint: '工程量匹配', tone: 'amber' },
    ],
    filters: ['项目', '月份', '分部分项', '状态', '异常类型'],
    rows: [
      { name: '模板工程月度报量', project: '南京中交智慧港项目', status: '少报待说明', amount: '2000㎡ / 应报3000㎡', owner: '王预算', tone: 'rose' },
      { name: '钢筋工程月度报量', project: '南京中交智慧港项目', status: '待审核', amount: '186.4t', owner: '王预算', tone: 'amber' },
      { name: '混凝土工程月度报量', project: '滨河商业综合体二标', status: '已确认', amount: '1280m³', owner: '李预算', tone: 'emerald' },
    ],
    emptyTitle: '请选择项目后查看报量台账',
    mobileActions: ['选项目', '录报量', '看风险'],
  },
  {
    key: 'supplier',
    title: '供应商结算管理',
    breadcrumb: ['供应商与费用', '结算管理'],
    desc: '台账顶部保留横向滚动条和关键列固定，累计结算、累计已付按结算日期逐条递增。',
    primaryAction: '新增结算',
    secondaryAction: '付款记录',
    stats: [
      { label: '本期结算', value: '85,000', hint: '按本次结算统计', tone: 'blue' },
      { label: '累计结算', value: '416,000', hint: '随结算日期递增', tone: 'emerald' },
      { label: '合同未付', value: '126,000', hint: '结算减累计付款', tone: 'rose' },
    ],
    filters: ['项目', '供应商', '合同', '结算日期', '付款状态'],
    rows: [
      { name: '模板材料第3期结算', project: '南京中交智慧港项目', status: '本期结算', amount: '85,000 / 累计416,000', owner: '南京启承劳务', tone: 'blue' },
      { name: '钢管租赁第2期结算', project: '滨河商业综合体二标', status: '部分已付', amount: '62,000 / 已付30,000', owner: '华东租赁', tone: 'amber' },
      { name: '零星材料结算', project: '城东学校改扩建项目', status: '已结清', amount: '18,600 / 已付18,600', owner: '兴达建材', tone: 'emerald' },
    ],
    emptyTitle: '暂无供应商结算记录',
    mobileActions: ['筛选合同', '新增结算', '看付款'],
  },
];

function toneClass(tone: Tone, strong = false) {
  const map: Record<Tone, string> = {
    blue: strong ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 ring-blue-100',
    emerald: strong ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: strong ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 ring-amber-100',
    rose: strong ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 ring-rose-100',
    violet: strong ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: strong ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return map[tone];
}

function borderClass(tone: Tone) {
  const map: Record<Tone, string> = {
    blue: 'border-l-blue-500',
    emerald: 'border-l-emerald-500',
    amber: 'border-l-amber-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
    slate: 'border-l-slate-300',
  };
  return map[tone];
}

export default function NavigationLayoutPreviewPage() {
  const [roleKey, setRoleKey] = useState<RoleKey>('budget');
  const [scenarioKey, setScenarioKey] = useState<ModuleKey>('project');
  const activeRole = roles.find((role) => role.key === roleKey) || roles[1];
  const navGroups = roleNav[roleKey];
  const scenario = scenarios.find((item) => item.key === scenarioKey) || scenarios[1];

  const activeNavLabel = useMemo(() => {
    if (scenario.key === 'construction') return '施工管理';
    if (scenario.key === 'project') return '项目管理';
    return '供应商与费用';
  }, [scenario.key]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4 lg:flex-row lg:p-5">
        <aside className="w-full rounded-lg border border-slate-200 bg-white shadow-sm lg:w-72 lg:shrink-0">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                <HardHat className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold">建筑劳务系统</p>
                <p className="text-xs text-slate-500">收敛后的导航预览</p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 p-3">
            <p className="mb-2 text-[11px] font-medium text-slate-500">登录身份</p>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => setRoleKey(role.key)}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                    role.key === roleKey
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block font-semibold">{role.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{activeRole.desc}</p>
          </div>

          <nav className="space-y-2 p-3">
            {navGroups.map((group) => {
              const Icon = group.icon;
              const isActive = group.label === activeNavLabel || (scenario.key === 'supplier' && group.label === '供应商与费用');
              return (
                <section key={group.key} className={`rounded-lg border ${isActive ? 'border-blue-200 bg-blue-50/70' : 'border-slate-100 bg-white'}`}>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-md ring-1 ${toneClass(group.tone)}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                      <p className="text-[11px] text-slate-500">{group.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="grid gap-1 px-3 pb-3">
                    {group.items.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`rounded-md px-3 py-2 text-left text-xs ${
                          item.includes(scenario.title.replace('管理', '')) || (scenario.key === 'supplier' && item === '结算管理')
                            ? 'bg-white font-semibold text-blue-700 shadow-sm'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {scenario.breadcrumb.map((crumb, index) => (
                    <span key={crumb} className="flex items-center gap-2">
                      <span className={index === scenario.breadcrumb.length - 1 ? 'font-medium text-slate-700' : ''}>{crumb}</span>
                      {index < scenario.breadcrumb.length - 1 ? <ChevronRight className="h-3 w-3" /> : null}
                    </span>
                  ))}
                </div>
                <h1 className="text-xl font-bold text-slate-950">{scenario.title}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{scenario.desc}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {scenarios.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setScenarioKey(item.key)}
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      item.key === scenario.key
                        ? 'border-blue-200 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <section className="grid gap-3 md:grid-cols-3">
                {scenario.stats.map((stat) => (
                  <div key={stat.label} className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm border-l-4 ${borderClass(stat.tone)}`}>
                    <p className="text-xs text-slate-500">{stat.label}</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{stat.value}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{stat.hint}</p>
                  </div>
                ))}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-950">统一筛选区</p>
                    <p className="mt-1 text-xs text-slate-500">筛选条件固定在数据区上方，常用项优先，移动端收进底部抽屉。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                      <Search className="h-4 w-4" />
                      搜索
                    </button>
                    <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                      <Filter className="h-4 w-4" />
                      更多筛选
                    </button>
                    <button type="button" className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
                      <Sparkles className="h-4 w-4" />
                      {scenario.primaryAction}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-4 py-3">
                  {scenario.filters.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[820px]">
                    <div className="grid grid-cols-[1.3fr_1.2fr_1fr_1fr_110px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                      <span>事项名称</span>
                      <span>项目/合同</span>
                      <span>状态</span>
                      <span className="text-right">关键数据</span>
                      <span className="text-right">责任人</span>
                    </div>
                    {scenario.rows.map((row) => (
                      <div
                        key={`${row.name}-${row.project}`}
                        className="grid grid-cols-[1.3fr_1.2fr_1fr_1fr_110px] gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">{row.name}</span>
                        <span className="text-slate-600">{row.project}</span>
                        <span>
                          <span className={`rounded-full px-2.5 py-1 text-xs ring-1 ${toneClass(row.tone)}`}>{row.status}</span>
                        </span>
                        <span className="text-right font-semibold tabular-nums text-slate-900">{row.amount}</span>
                        <span className="text-right text-slate-600">{row.owner}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center">
                  <TableProperties className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">{scenario.emptyTitle}</p>
                  <p className="mt-1 text-xs text-slate-500">空状态不只显示“暂无数据”，要告诉用户下一步该做什么。</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-900">加载状态示意</p>
                  <div className="mt-4 space-y-3">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                  </div>
                  <p className="mt-4 text-xs text-slate-500">表格切换、保存、导入时优先使用骨架屏和按钮内加载。</p>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-950">钉钉手机端</p>
                    <p className="mt-1 text-xs text-slate-500">高频操作变成卡片和底部按钮。</p>
                  </div>
                  <Menu className="h-5 w-5 text-slate-400" />
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-950 p-2 shadow-sm">
                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-500">{activeRole.label}</p>
                        <p className="text-base font-bold text-slate-950">{scenario.title}</p>
                      </div>
                      <BellRing className="h-5 w-5 text-blue-600" />
                    </div>

                    <div className="mt-3 grid gap-2">
                      {scenario.mobileActions.map((action, index) => {
                        const icons = [Camera, FileText, ClipboardCheck];
                        const Icon = icons[index] || CheckCircle2;
                        return (
                          <button key={action} type="button" className="flex items-center gap-3 rounded-lg bg-white p-3 text-left shadow-sm">
                            <span className={`flex h-9 w-9 items-center justify-center rounded-md ${index === 0 ? toneClass('blue', true) : toneClass('slate')}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900">{action}</span>
                              <span className="block truncate text-[11px] text-slate-500">进入后直接处理，不再多层查找</span>
                            </span>
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="text-xs font-semibold text-blue-800">页面优化原则</p>
                      <p className="mt-1 text-[11px] leading-5 text-blue-700">
                        手机端少表格、少统计卡，优先显示“我现在要点哪里、处理什么”。
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-base font-semibold text-slate-950">建议落地顺序</p>
                <div className="mt-3 space-y-3">
                  {[
                    ['1', '先统一导航层级', '补二级导航，隐藏低频入口'],
                    ['2', '再统一页面骨架', '标题、筛选、表格、状态反馈一致'],
                    ['3', '最后做移动端', '高频角色先卡片化'],
                  ].map(([step, title, desc]) => (
                    <div key={step} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                        {step}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                        <p className="text-xs text-slate-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">不建议一次全站重构</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      先用 2 到 3 个高频页面试点，确认风格和交互口径，再逐步替换正式页面。
                    </p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
