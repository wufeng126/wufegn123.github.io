'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FilePlus2,
  FileSearch,
  FileText,
  Loader2,
  PenSquare,
  Search,
  WalletCards,
} from 'lucide-react';

type TodoKey = 'constructionLogsPending' | 'monthlyReportsPending' | 'visasPending' | 'knowledgePending';

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
  tone: string;
};

const quickEntries: QuickEntry[] = [
  { title: '拍照录施工日志', desc: '手写日志拍照识别', href: '/construction-logs/scan', icon: Camera, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  { title: '新建施工日志', desc: '手动补录当天日志', href: '/construction-logs/new', icon: PenSquare, tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100' },
  { title: '查看我的日志', desc: '查看已提交和待确认日志', href: '/construction-logs?tab=logs&mine=1', icon: FileSearch, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { title: '月报填报', desc: '整理本月施工进展', href: '/reports/monthly', icon: FileText, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { title: '签证办理', desc: '提交、跟进、查看签证资料', href: '/visas', icon: FileCheck2, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  { title: '工资查询', desc: '查看工资记录和发放状态', href: '/workers/query', icon: WalletCards, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
  { title: '新建知识', desc: '沉淀施工经验和管理方法', href: '/knowledge/new', icon: FilePlus2, tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  { title: '查找经验', desc: '搜索可复用的项目做法', href: '/knowledge', icon: Search, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { title: '月报经验沉淀', desc: '从月报中整理可复用内容', href: '/knowledge/monthly/new', icon: BookOpen, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
];

const todoVisuals: Record<TodoKey, { icon: LucideIcon; tone: string; valueTone: string }> = {
  constructionLogsPending: { icon: Camera, tone: 'bg-blue-50 text-blue-700 ring-blue-100', valueTone: 'text-blue-700' },
  monthlyReportsPending: { icon: FileText, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100', valueTone: 'text-emerald-700' },
  visasPending: { icon: FileCheck2, tone: 'bg-amber-50 text-amber-700 ring-amber-100', valueTone: 'text-amber-700' },
  knowledgePending: { icon: BookOpen, tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100', valueTone: 'text-indigo-700' },
};

const fallbackTodos: TodoItem[] = [
  {
    key: 'constructionLogsPending',
    label: '施工日志待确认',
    desc: '照片识别或日志风险已生成，需要人工核对确认',
    action: '去确认',
    count: 0,
    unit: '条',
    href: '/construction-logs?tab=risks&status=pending',
  },
  {
    key: 'monthlyReportsPending',
    label: '月报待填报',
    desc: '当前权限项目中，本月还没有完成月度分析沉淀',
    action: '去填报',
    count: 0,
    unit: '项',
    href: '/reports/monthly?todo=pending',
  },
  {
    key: 'visasPending',
    label: '签证待办理',
    desc: '当前权限项目中仍处于待办理状态的签证',
    action: '去办理',
    count: 0,
    unit: '个',
    href: '/visas?status=待办理',
  },
  {
    key: 'knowledgePending',
    label: '知识待整理',
    desc: '月度分析和经验沉淀流程中，需要你处理的内容',
    action: '去整理',
    count: 0,
    unit: '条',
    href: '/knowledge?status=pending',
  },
];

export default function WorkbenchContent() {
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

  const todoItems = todos.items?.length ? todos.items : fallbackTodos;
  const pendingTotal = useMemo(
    () => todoItems.reduce((sum, item) => sum + Number(item.count || 0), 0),
    [todoItems],
  );

  return (
    <div className="min-h-full bg-[#f5f7fb] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1320px] space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">工作台</h1>
              <p className="mt-2 text-sm text-slate-500">面向所有员工，只保留每天高频使用的办事入口和需要马上处理的事项。</p>
            </div>
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              {quickEntries.length} 个高频入口
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
                <p className="mt-1 text-xs text-slate-500">按当前员工权限范围统计，只显示需要马上处理的事项</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {pendingTotal} 项待处理
            </div>
          </div>

          {error ? (
            <div className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {todoItems.map(item => {
              const visual = todoVisuals[item.key];
              const Icon = visual.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group rounded-lg border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${visual.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-right">
                      <div className={`text-3xl font-semibold tabular-nums ${visual.valueTone}`}>
                        {loading ? '-' : item.count}
                      </div>
                      <div className="text-xs text-slate-400">{item.unit}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-950 group-hover:text-blue-700">{item.label}</div>
                  <p className="mt-1 min-h-[40px] text-xs leading-5 text-slate-500">{item.desc}</p>
                  <div className="mt-3 flex items-center justify-end">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                      {item.action}
                      <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
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
                <Link
                  key={item.title}
                  href={item.href}
                  className="group min-h-[118px] rounded-lg border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                    <ItemIcon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-950 group-hover:text-blue-700">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
