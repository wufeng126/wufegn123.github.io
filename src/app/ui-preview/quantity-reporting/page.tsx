'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileClock,
  Filter,
  History,
  Layers3,
  Save,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

type ViewMode = 'summary' | 'entry';
type EntryMode = 'client' | 'internal' | 'additional';
type ProjectStatus = '正常' | '对上偏慢' | '对下偏快' | '重点关注';

type ProjectSummary = {
  id: number;
  name: string;
  year: number;
  manager: string;
  contractAmount: number;
  budgetAmount: number;
  clientCumulativeAmount: number;
  internalCumulativeAmount: number;
  clientRate: number;
  internalRate: number;
  status: ProjectStatus;
  risk: string;
};

type WorkItem = {
  id: number;
  projectId: number;
  source: 'budget' | 'additional';
  name: string;
  unit: string;
  budgetQty: number;
  clientPreviousQty: number;
  internalPreviousQty: number;
  contractPrice: number;
  internalPrice: number;
  defaultClientQty: number;
  defaultInternalQty: number;
};

const projects: ProjectSummary[] = [
  {
    id: 1,
    name: '南京中交智慧港项目',
    year: 2026,
    manager: '王预算',
    contractAmount: 28600000,
    budgetAmount: 18260000,
    clientCumulativeAmount: 11240000,
    internalCumulativeAmount: 12680000,
    clientRate: 61.6,
    internalRate: 69.4,
    status: '对下偏快',
    risk: '对下累计高于对上 144 万，需核对本月是否少报或多结',
  },
  {
    id: 2,
    name: '滨河商业综合体二标',
    year: 2026,
    manager: '李预算',
    contractAmount: 36800000,
    budgetAmount: 23600000,
    clientCumulativeAmount: 16790000,
    internalCumulativeAmount: 15150000,
    clientRate: 71.1,
    internalRate: 64.2,
    status: '正常',
    risk: '对上对下节奏正常，本月继续按清单复核剩余量',
  },
  {
    id: 3,
    name: '城东学校改扩建项目',
    year: 2025,
    manager: '张预算',
    contractAmount: 19600000,
    budgetAmount: 12800000,
    clientCumulativeAmount: 7360000,
    internalCumulativeAmount: 9140000,
    clientRate: 57.5,
    internalRate: 71.4,
    status: '重点关注',
    risk: '模板、抹灰对下明显快于对上，建议优先补报量',
  },
  {
    id: 4,
    name: '奥体中心配套改造',
    year: 2026,
    manager: '赵预算',
    contractAmount: 15800000,
    budgetAmount: 9200000,
    clientCumulativeAmount: 4020000,
    internalCumulativeAmount: 3510000,
    clientRate: 43.7,
    internalRate: 38.2,
    status: '对上偏慢',
    risk: '对上累计不足 45%，需关注甲方确认节奏',
  },
];

const workItems: WorkItem[] = [
  {
    id: 101,
    projectId: 1,
    source: 'budget',
    name: '墙柱模板安装',
    unit: 'm2',
    budgetQty: 42800,
    clientPreviousQty: 25200,
    internalPreviousQty: 29300,
    contractPrice: 54,
    internalPrice: 39,
    defaultClientQty: 3800,
    defaultInternalQty: 5100,
  },
  {
    id: 102,
    projectId: 1,
    source: 'budget',
    name: '梁板模板安装',
    unit: 'm2',
    budgetQty: 51600,
    clientPreviousQty: 32100,
    internalPreviousQty: 30800,
    contractPrice: 48,
    internalPrice: 36,
    defaultClientQty: 6200,
    defaultInternalQty: 5900,
  },
  {
    id: 103,
    projectId: 1,
    source: 'budget',
    name: '钢筋绑扎',
    unit: 't',
    budgetQty: 2160,
    clientPreviousQty: 1180,
    internalPreviousQty: 1395,
    contractPrice: 720,
    internalPrice: 520,
    defaultClientQty: 180,
    defaultInternalQty: 245,
  },
  {
    id: 104,
    projectId: 1,
    source: 'additional',
    name: '材料整理转运',
    unit: '工日',
    budgetQty: 0,
    clientPreviousQty: 0,
    internalPreviousQty: 286,
    contractPrice: 0,
    internalPrice: 180,
    defaultClientQty: 0,
    defaultInternalQty: 42,
  },
  {
    id: 201,
    projectId: 2,
    source: 'budget',
    name: '地下室模板',
    unit: 'm2',
    budgetQty: 63200,
    clientPreviousQty: 45200,
    internalPreviousQty: 40700,
    contractPrice: 58,
    internalPrice: 41,
    defaultClientQty: 7400,
    defaultInternalQty: 6150,
  },
  {
    id: 202,
    projectId: 2,
    source: 'budget',
    name: '二次结构砌筑',
    unit: 'm3',
    budgetQty: 9100,
    clientPreviousQty: 5110,
    internalPreviousQty: 4860,
    contractPrice: 210,
    internalPrice: 146,
    defaultClientQty: 860,
    defaultInternalQty: 790,
  },
  {
    id: 301,
    projectId: 3,
    source: 'budget',
    name: '楼梯间抹灰',
    unit: 'm2',
    budgetQty: 18600,
    clientPreviousQty: 9200,
    internalPreviousQty: 12840,
    contractPrice: 32,
    internalPrice: 24,
    defaultClientQty: 1100,
    defaultInternalQty: 1680,
  },
  {
    id: 302,
    projectId: 3,
    source: 'additional',
    name: '零星修补打磨',
    unit: '项',
    budgetQty: 0,
    clientPreviousQty: 0,
    internalPreviousQty: 18,
    contractPrice: 0,
    internalPrice: 1250,
    defaultClientQty: 0,
    defaultInternalQty: 4,
  },
];

const modeMeta: Record<EntryMode, { label: string; description: string; accent: string }> = {
  client: {
    label: '对上报量',
    description: '按合同清单向甲方确认当月完成量',
    accent: 'border-blue-500 bg-blue-50 text-blue-700',
  },
  internal: {
    label: '对下结算',
    description: '按预算工程量清单录入班组或内部结算量',
    accent: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  },
  additional: {
    label: '内部附加清单',
    description: '只参与金额统计，不参与对上对下工程量差异',
    accent: 'border-amber-500 bg-amber-50 text-amber-700',
  },
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatMoney(value: number) {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString('zh-CN');
}

function formatQty(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function getStatusClass(status: ProjectStatus) {
  if (status === '正常') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === '对上偏慢') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === '对下偏快') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function ProgressBar({ value, tone }: { value: number; tone: 'blue' | 'emerald' | 'amber' | 'rose' }) {
  const color =
    tone === 'blue'
      ? 'bg-blue-500'
      : tone === 'emerald'
        ? 'bg-emerald-500'
        : tone === 'amber'
          ? 'bg-amber-500'
          : 'bg-rose-500';

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

export default function QuantityReportingPreviewPage() {
  const [view, setView] = useState<ViewMode>('summary');
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const [mode, setMode] = useState<EntryMode>('client');
  const [period, setPeriod] = useState('2026-07');
  const [projectQuery, setProjectQuery] = useState('');
  const [entryQuery, setEntryQuery] = useState('');
  const [saved, setSaved] = useState(false);
  const [entries, setEntries] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      workItems.map((item) => [item.id, item.source === 'additional' ? item.defaultInternalQty : item.defaultClientQty]),
    ),
  );

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  const filteredProjects = useMemo(() => {
    const keyword = projectQuery.trim();
    return projects.filter((project) => !keyword || project.name.includes(keyword) || project.manager.includes(keyword));
  }, [projectQuery]);

  const visibleRows = useMemo(() => {
    const keyword = entryQuery.trim();
    return workItems
      .filter((item) => item.projectId === selectedProject.id)
      .filter((item) => (mode === 'additional' ? item.source === 'additional' : item.source === 'budget'))
      .filter((item) => !keyword || item.name.includes(keyword));
  }, [entryQuery, mode, selectedProject.id]);

  const calculatedRows = visibleRows.map((item) => {
    const currentQty = entries[item.id] ?? 0;
    const previousQty = mode === 'client' ? item.clientPreviousQty : item.internalPreviousQty;
    const compareQty = mode === 'client' ? item.internalPreviousQty : item.clientPreviousQty;
    const price = mode === 'client' ? item.contractPrice : item.internalPrice;
    const afterQty = previousQty + currentQty;
    const remainingQty = item.source === 'additional' ? 0 : item.budgetQty - afterQty;
    const amount = currentQty * price;
    const isOverBudget = item.source === 'budget' && afterQty > item.budgetQty;
    const isInternalFaster = mode !== 'client' && item.source === 'budget' && afterQty > compareQty;
    const isClientSlower = mode === 'client' && item.source === 'budget' && afterQty < item.internalPreviousQty;
    const risk = isOverBudget ? '超预算量' : isInternalFaster ? '对下快于对上' : isClientSlower ? '对上仍偏慢' : '正常';

    return {
      ...item,
      currentQty,
      previousQty,
      afterQty,
      remainingQty,
      price,
      amount,
      risk,
      isOverBudget,
      isInternalFaster,
      isClientSlower,
    };
  });

  const totalAmount = calculatedRows.reduce((sum, row) => sum + row.amount, 0);
  const overBudgetCount = calculatedRows.filter((row) => row.isOverBudget).length;
  const paceRiskCount = calculatedRows.filter((row) => row.isInternalFaster || row.isClientSlower).length;

  const summary = projects.reduce(
    (acc, project) => {
      acc.contract += project.contractAmount;
      acc.client += project.clientCumulativeAmount;
      acc.internal += project.internalCumulativeAmount;
      acc.risks += project.status === '正常' ? 0 : 1;
      return acc;
    },
    { contract: 0, client: 0, internal: 0, risks: 0 },
  );

  const clientRemainingAmount = selectedProject.budgetAmount - selectedProject.clientCumulativeAmount;
  const internalRemainingAmount = selectedProject.budgetAmount - selectedProject.internalCumulativeAmount;
  const gapAmount = selectedProject.clientCumulativeAmount - selectedProject.internalCumulativeAmount;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4 px-4 py-5 lg:px-6">
        {view === 'summary' ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                    <ClipboardList className="h-4 w-4" />
                    项目管理 / 报量管理
                  </div>
                  <h1 className="text-2xl font-semibold tracking-normal text-slate-950">项目汇总对比</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    首页只看项目整体进度、对上对下差异和风险提醒；需要录入时再进入单项目工作台。
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={projectQuery}
                      onChange={(event) => setProjectQuery(event.target.value)}
                      placeholder="搜索项目或预算员"
                      className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Filter className="h-4 w-4" />
                    筛选
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <BarChart3 className="h-4 w-4" />
                  合同总额
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(summary.contract)}</div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 shadow-sm">
                <div className="text-sm text-blue-700">对上累计报量</div>
                <div className="mt-2 text-2xl font-semibold text-blue-950">{formatMoney(summary.client)}</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                <div className="text-sm text-emerald-700">对下累计结算</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-950">{formatMoney(summary.internal)}</div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-sm">
                <div className="text-sm text-amber-700">需关注项目</div>
                <div className="mt-2 text-2xl font-semibold text-amber-950">{summary.risks} 个</div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="font-semibold text-slate-950">项目台账</h2>
                  <p className="mt-0.5 text-xs text-slate-500">按项目先判断差异，再进入录入，不把工作台堆在首页。</p>
                </div>
                <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <History className="h-4 w-4" />
                  历史报量
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <th className="border-b border-slate-200 px-4 py-3">项目名称</th>
                      <th className="border-b border-slate-200 px-3 py-3">年度 / 预算员</th>
                      <th className="border-b border-slate-200 px-3 py-3">状态</th>
                      <th className="border-b border-slate-200 px-3 py-3">对上进度</th>
                      <th className="border-b border-slate-200 px-3 py-3">对下进度</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">对上剩余</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">对下剩余</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">差额</th>
                      <th className="border-b border-slate-200 px-4 py-3">风险提示</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((project) => {
                      const clientRemaining = project.budgetAmount - project.clientCumulativeAmount;
                      const internalRemaining = project.budgetAmount - project.internalCumulativeAmount;
                      const gap = project.clientCumulativeAmount - project.internalCumulativeAmount;

                      return (
                        <tr key={project.id} className="hover:bg-slate-50">
                          <td className="border-b border-slate-100 px-4 py-4">
                            <div className="font-medium text-slate-950">{project.name}</div>
                            <div className="mt-0.5 text-xs text-slate-500">合同额 {formatMoney(project.contractAmount)}</div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4 text-slate-600">
                            {project.year} 年 / {project.manager}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4">
                            <span className={cn('rounded-full border px-2 py-0.5 text-xs', getStatusClass(project.status))}>
                              {project.status}
                            </span>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4">
                            <div className="flex min-w-[130px] items-center gap-2">
                              <ProgressBar value={project.clientRate} tone="blue" />
                              <span className="w-12 text-right text-xs text-slate-500">{project.clientRate}%</span>
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4">
                            <div className="flex min-w-[130px] items-center gap-2">
                              <ProgressBar value={project.internalRate} tone={project.internalRate > project.clientRate ? 'amber' : 'emerald'} />
                              <span className="w-12 text-right text-xs text-slate-500">{project.internalRate}%</span>
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4 text-right text-slate-700">{formatMoney(clientRemaining)}</td>
                          <td className="border-b border-slate-100 px-3 py-4 text-right text-slate-700">{formatMoney(internalRemaining)}</td>
                          <td className={cn('border-b border-slate-100 px-3 py-4 text-right font-medium', gap >= 0 ? 'text-emerald-700' : 'text-amber-700')}>
                            {formatMoney(gap)}
                          </td>
                          <td className="border-b border-slate-100 px-4 py-4 text-slate-600">{project.risk}</td>
                          <td className="border-b border-slate-100 px-4 py-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedProjectId(project.id);
                                setView('entry');
                                setSaved(false);
                              }}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
                            >
                              进入录入
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <button
                    onClick={() => setView('summary')}
                    className="mb-3 inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回项目汇总
                  </button>
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                    <ClipboardList className="h-4 w-4" />
                    报量管理 / 项目录入
                  </div>
                  <h1 className="text-2xl font-semibold tracking-normal text-slate-950">项目录入工作台</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    只处理当前项目的对上报量、对下结算和内部附加清单，录入完成后返回汇总页看整体差异。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <History className="h-4 w-4" />
                    本项目历史
                  </button>
                  <button
                    onClick={() => setSaved(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Save className="h-4 w-4" />
                    保存并校验
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-slate-950">{selectedProject.name}</h2>
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs', getStatusClass(selectedProject.status))}>
                      {selectedProject.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedProject.year} 年 / {selectedProject.manager}，当前录入边界固定在本项目。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 xl:w-[640px]">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">预算金额</div>
                    <div className="mt-1 font-semibold">{formatMoney(selectedProject.budgetAmount)}</div>
                  </div>
                  <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                    <div className="text-xs text-blue-700">对上剩余</div>
                    <div className="mt-1 font-semibold text-blue-900">{formatMoney(clientRemainingAmount)}</div>
                  </div>
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
                    <div className="text-xs text-emerald-700">对下剩余</div>
                    <div className="mt-1 font-semibold text-emerald-900">{formatMoney(internalRemainingAmount)}</div>
                  </div>
                  <div className={cn('rounded-md border p-3', gapAmount >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50')}>
                    <div className={cn('text-xs', gapAmount >= 0 ? 'text-emerald-700' : 'text-amber-700')}>对上对下差额</div>
                    <div className={cn('mt-1 font-semibold', gapAmount >= 0 ? 'text-emerald-900' : 'text-amber-900')}>
                      {formatMoney(gapAmount)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(modeMeta) as EntryMode[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => {
                          setMode(key);
                          setSaved(false);
                        }}
                        className={cn(
                          'rounded-md border px-3 py-2 text-left text-sm transition',
                          mode === key ? modeMeta[key].accent : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        <div className="font-medium">{modeMeta[key].label}</div>
                        <div className="mt-0.5 text-xs opacity-80">{modeMeta[key].description}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
                      <FileClock className="h-4 w-4 text-slate-400" />
                      <input
                        value={period}
                        onChange={(event) => setPeriod(event.target.value)}
                        className="w-24 bg-transparent text-slate-900 outline-none"
                      />
                    </label>
                    <label className="flex h-10 min-w-[220px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        value={entryQuery}
                        onChange={(event) => setEntryQuery(event.target.value)}
                        placeholder="搜索清单项"
                        className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">清单项</th>
                      <th className="border-b border-slate-200 px-3 py-3">单位</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">预算量</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">上期累计</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">本次录入</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">填后累计</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">剩余量</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">单价</th>
                      <th className="border-b border-slate-200 px-3 py-3 text-right">本次金额</th>
                      <th className="border-b border-slate-200 px-4 py-3">校验</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedRows.map((row) => (
                      <tr key={row.id} className="group hover:bg-slate-50">
                        <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50">
                          <div className="font-medium text-slate-950">{row.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {row.source === 'additional' ? '内部附加清单' : '预算工程量清单'}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 text-slate-600">{row.unit}</td>
                        <td className="border-b border-slate-100 px-3 py-3 text-right text-slate-700">
                          {row.source === 'additional' ? '-' : formatQty(row.budgetQty)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 text-right text-slate-700">{formatQty(row.previousQty)}</td>
                        <td className="border-b border-slate-100 px-3 py-3 text-right">
                          <input
                            type="number"
                            value={row.currentQty}
                            onChange={(event) => {
                              setEntries((prev) => ({ ...prev, [row.id]: Number(event.target.value) }));
                              setSaved(false);
                            }}
                            className="h-9 w-28 rounded-md border border-slate-200 bg-white px-2 text-right font-medium text-slate-950 outline-none focus:border-slate-500"
                          />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 text-right font-medium text-slate-950">
                          {formatQty(row.afterQty)}
                        </td>
                        <td
                          className={cn(
                            'border-b border-slate-100 px-3 py-3 text-right',
                            row.remainingQty < 0 ? 'font-semibold text-rose-600' : 'text-slate-700',
                          )}
                        >
                          {row.source === 'additional' ? '-' : formatQty(row.remainingQty)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 text-right text-slate-700">{formatMoney(row.price)}</td>
                        <td className="border-b border-slate-100 px-3 py-3 text-right font-medium text-slate-950">
                          {formatMoney(row.amount)}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
                              row.risk === '正常'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : row.risk === '超预算量'
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700',
                            )}
                          >
                            {row.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 xl:grid-cols-[1fr_360px]">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Layers3 className="h-4 w-4" />
                      当前录入
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">{modeMeta[mode].label}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {period} / {calculatedRows.length} 项清单
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">本次合计金额</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">{formatMoney(totalAmount)}</div>
                    <div className="mt-1 text-xs text-slate-500">本次数量 x 当前单价自动计算</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">保存前校验</div>
                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-950">
                      {overBudgetCount + paceRiskCount === 0 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                      )}
                      {overBudgetCount + paceRiskCount} 条提醒
                    </div>
                    <div className="mt-1 text-xs text-slate-500">超预算、少报多结、对上偏慢集中提示</div>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2 font-medium text-slate-950">
                    <ShieldCheck className="h-4 w-4 text-slate-500" />
                    风险校验结果
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {overBudgetCount > 0 && (
                      <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">
                        有 {overBudgetCount} 项填后累计超过预算工程量，建议核对是否存在重复结算。
                      </div>
                    )}
                    {paceRiskCount > 0 && (
                      <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-amber-700">
                        有 {paceRiskCount} 项存在对上对下进度差异，保存时应提醒预算员复核。
                      </div>
                    )}
                    {overBudgetCount + paceRiskCount === 0 && (
                      <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700">
                        当前录入未发现明显异常，可以保存进入本月台账。
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setSaved(true)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      保存校验结果
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      草稿
                    </button>
                  </div>
                  {saved && <div className="mt-2 text-xs text-emerald-700">已生成预览保存结果：本期数据进入项目台账。</div>}
                </div>
              </div>
            </section>
          </>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            拆分思路：汇总页负责“看差异、找风险、进项目”，录入页负责“填数量、算金额、做校验、保存草稿”。
          </div>
        </section>
      </div>
    </main>
  );
}
