import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Gauge,
  HardHat,
  Home,
  Layers3,
  Library,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';

type NavItem = {
  name: string;
  icon: LucideIcon;
  active?: boolean;
  muted?: boolean;
};

type StatItem = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: string;
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: '一级导航',
    items: [
      { name: '工作台', icon: Home, active: true },
      { name: '项目管理', icon: Building2 },
      { name: '施工管理', icon: ClipboardList },
      { name: '人力资源', icon: Users },
      { name: '经营分析', icon: BarChart3 },
      { name: '投标测算', icon: WalletCards },
      { name: '知识库', icon: Library },
      { name: '系统管理', icon: Settings },
    ],
  },
];

const stats: StatItem[] = [
  {
    label: '在建项目',
    value: '12',
    helper: '3 个本周有关键节点',
    icon: Building2,
    tone: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    label: '今日日志',
    value: '28',
    helper: '5 条待人工确认',
    icon: ClipboardList,
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  {
    label: '风险提醒',
    value: '7',
    helper: '只提醒，不进入复杂处理',
    icon: AlertTriangle,
    tone: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
  {
    label: '可复用知识',
    value: '46',
    helper: '9 条推荐用于新项目',
    icon: BookOpen,
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
];

const projectRows = [
  { name: '城东商业综合体二标段', phase: '主体施工', progress: 68, status: '正常推进', tone: 'text-emerald-700 bg-emerald-50' },
  { name: '高新区厂房改造项目', phase: '装饰安装', progress: 42, status: '需关注材料', tone: 'text-amber-700 bg-amber-50' },
  { name: '南环路市政配套工程', phase: '收尾验收', progress: 91, status: '月报待整理', tone: 'text-blue-700 bg-blue-50' },
];

const reminders = [
  { title: '城东商业综合体二标段', desc: '今日施工日志已识别，等待现场人员确认', icon: Camera, tone: 'bg-blue-50 text-blue-700' },
  { title: '高新区厂房改造项目', desc: '连续 2 天出现材料到场延迟提醒', icon: ShieldAlert, tone: 'bg-amber-50 text-amber-700' },
  { title: '南环路市政配套工程', desc: '本月月报缺少现场照片和下月计划', icon: FileText, tone: 'bg-slate-100 text-slate-700' },
];

const knowledgeItems = [
  { title: '雨季基坑排水组织经验', meta: '施工管理 · 推荐复用', tag: '适用：土方/基坑' },
  { title: '钢结构吊装签证资料清单', meta: '签证变更 · 标准经验', tag: '适用：变更索赔' },
  { title: '投标阶段临设费用测算口径', meta: '投标策略 · 已整理', tag: '适用：成本测算' },
];

export default function UiPreviewPage() {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-[244px] shrink-0 border-r border-slate-200 bg-white text-slate-950 lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">工程管理系统</div>
              <div className="text-xs text-slate-500">Project Console</div>
            </div>
          </div>

          <div className="flex-1 space-y-6 px-3 py-5">
            {navGroups.map(group => (
              <section key={group.title}>
                <div className="mb-2 px-3 text-[11px] font-medium text-slate-500">{group.title}</div>
                <div className="space-y-1">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.name}
                        className={[
                          'flex h-10 items-center gap-3 rounded-md px-3 text-sm',
                          item.active
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                            : item.muted
                              ? 'text-slate-400'
                              : 'text-slate-600',
                        ].join(' ')}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-blue-600" />
                AI 整理助手
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">识别施工日志、整理月报摘要、沉淀知识经验。</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-16 items-center gap-3 px-4 md:px-6">
              <button className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white lg:hidden">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">工作台</h1>
                <p className="truncate text-xs text-slate-500">把项目、日志、月报、风险提醒和知识复用放在同一个入口里</p>
              </div>
              <div className="hidden h-10 w-[280px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 md:flex">
                <Search className="h-4 w-4" />
                搜索项目、日志、知识
              </div>
              <button className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm">
                <Plus className="h-4 w-4" />
                新建
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">{item.label}</p>
                        <p className="mt-2 text-3xl font-semibold tracking-normal">{item.value}</p>
                      </div>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">{item.helper}</p>
                  </div>
                );
              })}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold">项目进展</h2>
                    <p className="text-xs text-slate-500">重点看进度、状态和最近提醒</p>
                  </div>
                  <button className="flex items-center gap-1 text-sm font-medium text-blue-600">
                    查看全部
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {projectRows.map(row => (
                    <div key={row.name} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_140px_180px_110px] md:items-center">
                      <div>
                        <div className="font-medium">{row.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.phase}</div>
                      </div>
                      <div className="text-sm text-slate-600">进度 {row.progress}%</div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.progress}%` }} />
                      </div>
                      <div className={`w-fit rounded-md px-2.5 py-1 text-xs font-medium ${row.tone}`}>{row.status}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-base font-semibold">待处理提醒</h2>
                  <p className="text-xs text-slate-500">只放真正需要用户关注的事情</p>
                </div>
                <div className="space-y-3 p-4">
                  {reminders.map(item => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${item.tone}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{item.title}</div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</p>
                        </div>
                        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold">知识复用推荐</h2>
                    <p className="text-xs text-slate-500">从项目经验里找可直接借鉴的内容</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div className="space-y-3 p-4">
                  {knowledgeItems.map(item => (
                    <div key={item.title} className="rounded-lg border border-slate-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.meta}</div>
                        </div>
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{item.tag}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">施工日志手机录入预览</h2>
                    <p className="text-xs text-slate-500">现场人员重点做三件事：拍照、确认、提交</p>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">移动端优先</span>
                </div>
                <div className="grid gap-5 md:grid-cols-[260px_1fr] md:items-center">
                  <div className="mx-auto w-[240px] rounded-[28px] border border-slate-300 bg-slate-950 p-2 shadow-xl">
                    <div className="rounded-[22px] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold">今日施工日志</div>
                        <Camera className="h-4 w-4 text-blue-600" />
                      </div>
                      <button className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-blue-700">
                        <Camera className="h-7 w-7" />
                        <span className="text-sm font-medium">拍照识别</span>
                      </button>
                      <div className="mt-3 space-y-2">
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            已自动整理
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">今日完成 3 层钢筋绑扎，机械 2 台，人员 18 人。</p>
                        </div>
                        <button className="h-10 w-full rounded-lg bg-blue-600 text-sm font-medium text-white">确认提交</button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-4">
                      <MessageSquareText className="mb-3 h-5 w-5 text-blue-600" />
                      <div className="text-sm font-medium">识别后自动整理</div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">把手写内容整理成标准日志字段，减少现场人员输入。</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4">
                      <Gauge className="mb-3 h-5 w-5 text-emerald-600" />
                      <div className="text-sm font-medium">只保留关键确认</div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">用户只改错别字、补人数机械、确认风险提醒。</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4">
                      <Layers3 className="mb-3 h-5 w-5 text-amber-600" />
                      <div className="text-sm font-medium">自动进入月报素材</div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">确认后的日志进入项目动态，月底可汇总成月报。</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4">
                      <Library className="mb-3 h-5 w-5 text-slate-700" />
                      <div className="text-sm font-medium">经验可沉淀知识库</div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">有复用价值的处理办法，可以转成知识库条目。</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
