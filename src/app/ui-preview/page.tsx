import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FilePlus2,
  FileSearch,
  FileText,
  HardHat,
  Home,
  Library,
  Menu,
  PenSquare,
  Search,
  Settings,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';

type NavItem = {
  name: string;
  icon: LucideIcon;
  active?: boolean;
};

type EntryItem = {
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
};

type PendingItem = {
  title: string;
  desc: string;
  action: string;
  count: number;
  unit: string;
  href: string;
  icon: LucideIcon;
  tone: string;
  valueTone: string;
};

const navItems: NavItem[] = [
  { name: '工作台', icon: Home, active: true },
  { name: '项目管理', icon: Building2 },
  { name: '施工管理', icon: ClipboardList },
  { name: '人力资源', icon: Users },
  { name: '经营分析', icon: BarChart3 },
  { name: '投标测算', icon: WalletCards },
  { name: '知识库', icon: Library },
  { name: '系统管理', icon: Settings },
];

const quickEntries: EntryItem[] = [
  { title: '拍照录施工日志', desc: '手写日志拍照识别', icon: Camera, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  { title: '新建施工日志', desc: '手动补录当天日志', icon: PenSquare, tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100' },
  { title: '查看我的日志', desc: '查看已提交和待确认日志', icon: FileSearch, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { title: '月报填报', desc: '整理本月施工进展', icon: FileText, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { title: '签证办理', desc: '提交、跟进、查看签证资料', icon: FileCheck2, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  { title: '工资查询', desc: '查看工资记录和发放状态', icon: WalletCards, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
  { title: '新建知识', desc: '沉淀施工经验和管理方法', icon: FilePlus2, tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  { title: '查找经验', desc: '搜索可复用的项目做法', icon: Search, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { title: '月报经验沉淀', desc: '从月报中整理可复用内容', icon: BookOpen, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
];

const pendingItems: PendingItem[] = [
  {
    title: '3 条施工日志待确认',
    desc: '拍照识别已完成，需要核对后提交',
    action: '去确认',
    count: 3,
    unit: '条',
    href: '/construction-logs?status=pending-confirm',
    icon: Camera,
    tone: 'bg-blue-50 text-blue-700 ring-blue-100',
    valueTone: 'text-blue-700',
  },
  {
    title: '月报待填报',
    desc: '本月施工进展还未完成整理',
    action: '去填报',
    count: 1,
    unit: '份',
    href: '/reports/monthly?status=pending',
    icon: FileText,
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    valueTone: 'text-emerald-700',
  },
  {
    title: '签证待办理',
    desc: '资料已提交，等待补充处理意见',
    action: '去办理',
    count: 2,
    unit: '个',
    href: '/visas?status=todo',
    icon: FileCheck2,
    tone: 'bg-amber-50 text-amber-700 ring-amber-100',
    valueTone: 'text-amber-700',
  },
  {
    title: '知识待整理',
    desc: '从月报中提取到可沉淀经验',
    action: '去沉淀',
    count: 4,
    unit: '条',
    href: '/knowledge?status=pending',
    icon: BookOpen,
    tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    valueTone: 'text-indigo-700',
  },
];

const pendingTotal = pendingItems.reduce((sum, item) => sum + item.count, 0);

export default function UiPreviewPage() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-[244px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <HardHat className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">建筑劳务管理</div>
              <div className="text-xs text-slate-500">Project Console</div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-5">
            <div className="mb-2 px-3 text-[11px] font-medium text-slate-500">一级导航</div>
            <div className="space-y-1">
              {navItems.map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.name}
                    className={[
                      'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                      item.active
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                        : 'text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-slate-200 p-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <Sparkles className="h-4 w-4 text-blue-600" />
                快捷工作台
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">只放员工每天最容易用到的入口。</p>
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
                <p className="truncate text-xs text-slate-500">面向所有员工的高频操作入口</p>
              </div>
              <div className="hidden h-10 w-[320px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 md:flex">
                <Search className="h-4 w-4" />
                搜索日志、签证、工资、知识
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1320px] space-y-6 p-4 md:p-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">常用功能</h2>
                  <p className="mt-2 text-sm text-slate-500">只保留员工真正需要频繁点击的入口，打开首页就能直接办事。</p>
                </div>
                <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                  9 个高频入口
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">待我办理</h2>
                    <p className="mt-1 text-xs text-slate-500">只显示和当前工作台入口相关的待办事项</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {pendingTotal} 项待处理
                </div>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                {pendingItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.title}
                      href={item.href}
                      className="group rounded-lg border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="text-right">
                          <div className={`text-3xl font-semibold tabular-nums ${item.valueTone}`}>{item.count}</div>
                          <div className="text-xs text-slate-400">{item.unit}</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-950 group-hover:text-blue-700">{item.title}</div>
                      <p className="mt-1 min-h-[40px] text-xs leading-5 text-slate-500">{item.desc}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">{item.href}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                        {item.action}
                        <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">快捷入口</h2>
                  <p className="mt-1 text-xs text-slate-500">不再按板块分类，直接展示所有高频操作。</p>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                  {quickEntries.length} 个入口
                </div>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {quickEntries.map(item => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.title}
                      className="group min-h-[118px] rounded-lg border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
                    >
                      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                        <ItemIcon className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-semibold text-slate-950 group-hover:text-blue-700">{item.title}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
