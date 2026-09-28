'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileImage,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutList,
  PackageSearch,
  Paperclip,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type MaterialStatus = 'draft' | 'confirmed' | 'voided';
type MaterialSource = '手工登记' | 'Excel 导入' | '票据识别';
type ViewMode = 'ledger' | 'summary';

type MaterialRow = {
  id: number;
  project: string;
  projectShort: string;
  purchaseDate: string;
  category: string;
  name: string;
  specification: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  supplier: string;
  purchaser: string;
  source: MaterialSource;
  status: MaterialStatus;
  hasReceipt: boolean;
  receiptCount: number;
  receiptNo: string;
  remark: string;
};

type FormState = {
  project: string;
  purchaseDate: string;
  category: string;
  name: string;
  specification: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  supplier: string;
  purchaser: string;
  receiptNo: string;
  remark: string;
};

const projects = ['全部项目', '南京中交智慧港项目', '滨河商业综合体二标', '城东学校改扩建项目'];
const categories = ['全部分类', '五金辅材', '电料', '安全文明', '工具耗材', '其他'];
const formCategories = ['五金辅材', '电料', '安全文明', '工具耗材', '其他'];
const units = ['个', '件', '箱', '卷', '桶', '套', '米', '袋', '项'];

const initialRows: MaterialRow[] = [
  {
    id: 1,
    project: '南京中交智慧港项目',
    projectShort: '南京中交智慧港',
    purchaseDate: '2026-09-18',
    category: '五金辅材',
    name: '高强螺栓',
    specification: 'M16×80',
    unit: '套',
    quantity: 120,
    unitPrice: 6.8,
    supplier: '南京华筑材料店',
    purchaser: '王强',
    source: '手工登记',
    status: 'confirmed',
    hasReceipt: true,
    receiptCount: 1,
    receiptNo: 'JZ-0918-012',
    remark: '主体三层加固使用',
  },
  {
    id: 2,
    project: '南京中交智慧港项目',
    projectShort: '南京中交智慧港',
    purchaseDate: '2026-09-16',
    category: '电料',
    name: '临时照明电缆',
    specification: 'YC 3×6+2×4',
    unit: '米',
    quantity: 180,
    unitPrice: 18.5,
    supplier: '南京启明五金',
    purchaser: '李海',
    source: '票据识别',
    status: 'draft',
    hasReceipt: true,
    receiptCount: 1,
    receiptNo: 'QW-0916-008',
    remark: '识别结果待确认',
  },
  {
    id: 3,
    project: '滨河商业综合体二标',
    projectShort: '滨河商业二标',
    purchaseDate: '2026-09-14',
    category: '安全文明',
    name: '安全网',
    specification: '1.8×6m',
    unit: '张',
    quantity: 45,
    unitPrice: 29,
    supplier: '滨河建材供应站',
    purchaser: '周成',
    source: 'Excel 导入',
    status: 'confirmed',
    hasReceipt: true,
    receiptCount: 2,
    receiptNo: 'BH-0914-021',
    remark: '外架维护补充',
  },
  {
    id: 4,
    project: '城东学校改扩建项目',
    projectShort: '城东学校',
    purchaseDate: '2026-09-10',
    category: '工具耗材',
    name: '切割片',
    specification: 'Ф125',
    unit: '盒',
    quantity: 8,
    unitPrice: 86,
    supplier: '城东机电商行',
    purchaser: '赵刚',
    source: '手工登记',
    status: 'confirmed',
    hasReceipt: false,
    receiptCount: 0,
    receiptNo: '',
    remark: '钢筋班组领用登记',
  },
  {
    id: 5,
    project: '南京中交智慧港项目',
    projectShort: '南京中交智慧港',
    purchaseDate: '2026-09-06',
    category: '五金辅材',
    name: '止水螺杆',
    specification: 'Ф14×500',
    unit: '根',
    quantity: 300,
    unitPrice: 4.2,
    supplier: '南京华筑材料店',
    purchaser: '王强',
    source: 'Excel 导入',
    status: 'voided',
    hasReceipt: true,
    receiptCount: 1,
    receiptNo: 'JZ-0906-004',
    remark: '重复导入，已作废',
  },
  {
    id: 6,
    project: '滨河商业综合体二标',
    projectShort: '滨河商业二标',
    purchaseDate: '2026-09-03',
    category: '其他',
    name: '混凝土试块箱',
    specification: '100×100×100',
    unit: '组',
    quantity: 6,
    unitPrice: 42,
    supplier: '滨河建材供应站',
    purchaser: '周成',
    source: '手工登记',
    status: 'confirmed',
    hasReceipt: true,
    receiptCount: 1,
    receiptNo: 'BH-0903-003',
    remark: '试验送检使用',
  },
];

const emptyForm: FormState = {
  project: '南京中交智慧港项目',
  purchaseDate: '2026-09-28',
  category: '五金辅材',
  name: '',
  specification: '',
  unit: '个',
  quantity: '',
  unitPrice: '',
  supplier: '',
  purchaser: '当前用户',
  receiptNo: '',
  remark: '',
};

const statusMeta: Record<MaterialStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  confirmed: { label: '已确认', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  voided: { label: '已作废', className: 'border-slate-200 bg-slate-100 text-slate-500' },
};

const sourceClassName: Record<MaterialSource, string> = {
  '手工登记': 'text-slate-600',
  'Excel 导入': 'text-blue-700',
  '票据识别': 'text-violet-700',
};

function formatMoney(value: number) {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return value.replaceAll('-', '.');
}

function getRowAmount(row: Pick<MaterialRow, 'quantity' | 'unitPrice'>) {
  return row.quantity * row.unitPrice;
}

function getMonth(value: string) {
  return value.slice(0, 7);
}

function metricTone(value: string) {
  return value === 'warning' ? 'text-amber-700' : value === 'muted' ? 'text-slate-500' : 'text-slate-950';
}

export default function MiscellaneousMaterialsPreview() {
  const [rows, setRows] = useState<MaterialRow[]>(initialRows);
  const [viewMode, setViewMode] = useState<ViewMode>('ledger');
  const [selectedProject, setSelectedProject] = useState('全部项目');
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [selectedCategory, setSelectedCategory] = useState('全部分类');
  const [selectedStatus, setSelectedStatus] = useState('全部状态');
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<'new' | 'detail' | null>(null);
  const [selectedRow, setSelectedRow] = useState<MaterialRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState('');

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const projectMatch = selectedProject === '全部项目' || row.project === selectedProject;
      const monthMatch = selectedMonth === '全部月份' || getMonth(row.purchaseDate) === selectedMonth;
      const categoryMatch = selectedCategory === '全部分类' || row.category === selectedCategory;
      const statusMatch =
        selectedStatus === '全部状态' ||
        (selectedStatus === '草稿' && row.status === 'draft') ||
        (selectedStatus === '已确认' && row.status === 'confirmed') ||
        (selectedStatus === '已作废' && row.status === 'voided');
      const normalizedQuery = query.trim().toLowerCase();
      const queryMatch =
        !normalizedQuery ||
        [row.name, row.specification, row.supplier, row.projectShort].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      return projectMatch && monthMatch && categoryMatch && statusMatch && queryMatch;
    });
  }, [query, rows, selectedCategory, selectedMonth, selectedProject, selectedStatus]);

  const confirmedRows = filteredRows.filter((row) => row.status === 'confirmed');
  const draftRows = filteredRows.filter((row) => row.status === 'draft');
  const voidedRows = filteredRows.filter((row) => row.status === 'voided');
  const confirmedAmount = confirmedRows.reduce((sum, row) => sum + getRowAmount(row), 0);
  const draftAmount = draftRows.reduce((sum, row) => sum + getRowAmount(row), 0);
  const voidedAmount = voidedRows.reduce((sum, row) => sum + getRowAmount(row), 0);
  const receiptCount = filteredRows.filter((row) => row.hasReceipt).length;

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    confirmedRows.forEach((row) => {
      map.set(row.category, (map.get(row.category) || 0) + getRowAmount(row));
    });
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [confirmedRows]);

  const projectSummary = useMemo(() => {
    const map = new Map<string, number>();
    confirmedRows.forEach((row) => {
      map.set(row.projectShort, (map.get(row.projectShort) || 0) + getRowAmount(row));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [confirmedRows]);

  const formAmount = (Number(form.quantity) || 0) * (Number(form.unitPrice) || 0);

  function openNewDrawer() {
    setForm({ ...emptyForm, project: selectedProject === '全部项目' ? emptyForm.project : selectedProject });
    setSelectedRow(null);
    setMessage('');
    setDrawer('new');
  }

  function openDetail(row: MaterialRow) {
    setSelectedRow(row);
    setMessage('');
    setDrawer('detail');
  }

  function handleFormChange<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function handleCreate(status: MaterialStatus) {
    if (!form.name.trim() || !form.quantity || !form.unitPrice) {
      setMessage('请先填写材料名称、数量和单价。');
      return;
    }

    const project = form.project || '南京中交智慧港项目';
    const newRow: MaterialRow = {
      id: Math.max(...rows.map((row) => row.id)) + 1,
      project,
      projectShort: project.replace('项目', ''),
      purchaseDate: form.purchaseDate,
      category: form.category,
      name: form.name.trim(),
      specification: form.specification.trim() || '未填写',
      unit: form.unit,
      quantity: Number(form.quantity),
      unitPrice: Number(form.unitPrice),
      supplier: form.supplier.trim() || '未填写',
      purchaser: form.purchaser.trim() || '当前用户',
      source: '手工登记',
      status,
      hasReceipt: Boolean(form.receiptNo),
      receiptCount: form.receiptNo ? 1 : 0,
      receiptNo: form.receiptNo.trim(),
      remark: form.remark.trim() || '新登记记录',
    };
    setRows((previous) => [newRow, ...previous]);
    setMessage(status === 'confirmed' ? '登记已确认，已进入本期统计。' : '草稿已保存，暂不计入正式成本。');
    setTimeout(() => setDrawer(null), 650);
  }

  function confirmSelectedRow() {
    if (!selectedRow) return;
    setRows((previous) =>
      previous.map((row) => (row.id === selectedRow.id ? { ...row, status: 'confirmed' } : row)),
    );
    setSelectedRow({ ...selectedRow, status: 'confirmed' });
    setMessage('已确认，当前记录将纳入正式统计。');
  }

  function voidSelectedRow() {
    if (!selectedRow) return;
    setRows((previous) =>
      previous.map((row) => (row.id === selectedRow.id ? { ...row, status: 'voided' } : row)),
    );
    setSelectedRow({ ...selectedRow, status: 'voided' });
    setMessage('已作废，保留记录但不再计入统计。');
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="mx-auto min-h-screen max-w-[1540px] border-x border-slate-200/80 bg-[#f8fafb]">
        <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 px-4 py-3 backdrop-blur md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
                <PackageSearch className="size-5" strokeWidth={1.7} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>供应商与费用</span>
                  <ChevronRight className="size-3.5" />
                  <span>零星材料</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">预览</span>
                </div>
                <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.02em]">零星材料登记台账</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-slate-500 sm:inline">只登记采购发生，不做库存进出库</span>
              <button
                type="button"
                onClick={openNewDrawer}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
              >
                <Plus className="size-4" />
                新增登记
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-5 px-4 py-5 md:px-7 md:py-7">
          <section className="border-b border-slate-200 pb-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-medium text-slate-500">项目采购登记 / 成本台账</p>
                <h2 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-slate-950">
                  每笔采购有记录，汇总时有依据。
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  以项目和月份为主线登记零星材料，金额自动计算，确认后进入成本汇总；凭证、来源和状态都留在同一条记录里。
                </p>
              </div>
              <div className="flex max-w-md items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs leading-5 text-blue-800">
                <ShieldCheck className="size-4 shrink-0 text-blue-700" />
                <span>统计口径：仅“已确认”记录计入项目成本，草稿和已作废记录不计入。</span>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: '本期已确认', value: formatMoney(confirmedAmount), hint: `${confirmedRows.length} 笔正式记录`, tone: 'normal' },
              { label: '待确认金额', value: formatMoney(draftAmount), hint: `${draftRows.length} 笔需要核对`, tone: 'warning' },
              { label: '已作废金额', value: formatMoney(voidedAmount), hint: `${voidedRows.length} 笔保留留痕`, tone: 'muted' },
              { label: '凭证覆盖', value: `${receiptCount}/${filteredRows.length || 0}`, hint: '有原图或附件的记录', tone: 'normal' },
            ].map((metric) => (
              <div key={metric.label} className="border-l-2 border-slate-300 py-1 pl-4">
                <div className="text-xs font-medium text-slate-500">{metric.label}</div>
                <div className={cn('mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.02em]', metricTone(metric.tone))}>
                  {metric.value}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">{metric.hint}</div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3 border-y border-slate-200 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
              {[
                { key: 'ledger' as const, label: '登记台账', icon: LayoutList },
                { key: 'summary' as const, label: '分类汇总', icon: BarChart3 },
              ].map((item) => {
                const Icon = item.icon;
                const active = viewMode === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setViewMode(item.key)}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition',
                      active ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950',
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                已确认进入成本
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" />
                草稿待核对
              </span>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3">
                  <Search className="size-4 shrink-0 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    placeholder="搜索材料名称、规格、供应商"
                    aria-label="搜索材料"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-700" aria-label="清除搜索">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
                  <label className="relative">
                    <span className="sr-only">项目</span>
                    <select
                      value={selectedProject}
                      onChange={(event) => setSelectedProject(event.target.value)}
                      className="h-10 w-full min-w-[150px] appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-slate-500"
                    >
                      {projects.map((project) => <option key={project}>{project}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-4 text-slate-400" />
                  </label>
                  <label className="relative">
                    <span className="sr-only">月份</span>
                    <select
                      value={selectedMonth}
                      onChange={(event) => setSelectedMonth(event.target.value)}
                      className="h-10 w-full min-w-[116px] appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-slate-500"
                    >
                      <option value="2026-09">2026 年 09 月</option>
                      <option value="2026-08">2026 年 08 月</option>
                      <option value="全部月份">全部月份</option>
                    </select>
                    <CalendarDays className="pointer-events-none absolute right-2.5 top-3 size-4 text-slate-400" />
                  </label>
                  <label className="relative">
                    <span className="sr-only">材料分类</span>
                    <select
                      value={selectedCategory}
                      onChange={(event) => setSelectedCategory(event.target.value)}
                      className="h-10 w-full min-w-[120px] appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-slate-500"
                    >
                      {categories.map((category) => <option key={category}>{category}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-4 text-slate-400" />
                  </label>
                  <label className="relative">
                    <span className="sr-only">状态</span>
                    <select
                      value={selectedStatus}
                      onChange={(event) => setSelectedStatus(event.target.value)}
                      className="h-10 w-full min-w-[100px] appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-slate-500"
                    >
                      <option>全部状态</option>
                      <option>已确认</option>
                      <option>草稿</option>
                      <option>已作废</option>
                    </select>
                    <SlidersHorizontal className="pointer-events-none absolute right-2.5 top-3 size-4 text-slate-400" />
                  </label>
                </div>
              </div>

              {viewMode === 'ledger' ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">登记明细</h3>
                      <p className="mt-0.5 text-xs text-slate-500">共 {filteredRows.length} 条记录，点击一行查看凭证和留痕</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <FileSpreadsheet className="size-3.5" />
                        导出当前结果
                      </button>
                      <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <ArrowDownToLine className="size-3.5" />
                        导入预览
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[1040px] w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                          <th className="border-b border-slate-200 px-4 py-3">采购日期 / 项目</th>
                          <th className="border-b border-slate-200 px-3 py-3">材料名称</th>
                          <th className="border-b border-slate-200 px-3 py-3">数量</th>
                          <th className="border-b border-slate-200 px-3 py-3 text-right">单价</th>
                          <th className="border-b border-slate-200 px-3 py-3 text-right">金额</th>
                          <th className="border-b border-slate-200 px-3 py-3">来源 / 凭证</th>
                          <th className="border-b border-slate-200 px-4 py-3">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => {
                          const status = statusMeta[row.status];
                          return (
                            <tr
                              key={row.id}
                              onClick={() => openDetail(row)}
                              className="group cursor-pointer transition hover:bg-slate-50"
                            >
                              <td className="border-b border-slate-100 px-4 py-3.5">
                                <div className="font-medium text-slate-950">{formatDate(row.purchaseDate)}</div>
                                <div className="mt-1 text-xs text-slate-500">{row.projectShort}</div>
                              </td>
                              <td className="border-b border-slate-100 px-3 py-3.5">
                                <div className="font-medium text-slate-950">{row.name}</div>
                                <div className="mt-1 text-xs text-slate-500">{row.category} · {row.specification}</div>
                              </td>
                              <td className="border-b border-slate-100 px-3 py-3.5 tabular-nums text-slate-700">
                                {row.quantity.toLocaleString('zh-CN')} <span className="text-slate-400">{row.unit}</span>
                              </td>
                              <td className="border-b border-slate-100 px-3 py-3.5 text-right tabular-nums text-slate-700">{formatMoney(row.unitPrice)}</td>
                              <td className="border-b border-slate-100 px-3 py-3.5 text-right font-semibold tabular-nums text-slate-950">{formatMoney(getRowAmount(row))}</td>
                              <td className="border-b border-slate-100 px-3 py-3.5">
                                <div className={cn('text-xs font-medium', sourceClassName[row.source])}>{row.source}</div>
                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                                  {row.hasReceipt ? <Paperclip className="size-3.5 text-emerald-600" /> : <FileText className="size-3.5" />}
                                  {row.hasReceipt ? `${row.receiptCount} 个凭证` : '待补凭证'}
                                </div>
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3.5">
                                <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', status.className)}>{status.label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {filteredRows.length === 0 && (
                    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
                      <PackageSearch className="size-8 text-slate-300" />
                      <p className="mt-3 font-medium text-slate-700">没有匹配的登记记录</p>
                      <p className="mt-1 text-sm text-slate-400">可以调整筛选条件，或者新增一笔材料登记。</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">材料分类汇总</h3>
                        <p className="mt-1 text-xs text-slate-500">只统计当前筛选条件下的“已确认”记录</p>
                      </div>
                      <span className="text-xs text-slate-400">共 {confirmedRows.length} 笔</span>
                    </div>
                    <div className="mt-5 space-y-4">
                      {categorySummary.map((item, index) => {
                        const percent = confirmedAmount ? Math.round((item.amount / confirmedAmount) * 100) : 0;
                        return (
                          <div key={item.name}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="flex size-6 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
                                <span className="font-medium text-slate-800">{item.name}</span>
                              </div>
                              <span className="font-semibold tabular-nums text-slate-950">{formatMoney(item.amount)}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${Math.max(percent, 3)}%` }} />
                            </div>
                            <div className="mt-1 text-right text-xs text-slate-400">{percent}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">项目金额分布</h3>
                        <p className="mt-1 text-xs text-slate-500">按项目归属查看本期正式成本</p>
                      </div>
                      <ArrowUpRight className="size-4 text-slate-400" />
                    </div>
                    <div className="mt-4 divide-y divide-slate-100">
                      {projectSummary.map(([name, amount]) => (
                        <div key={name} className="flex items-center justify-between gap-3 py-3 text-sm">
                          <span className="text-slate-600">{name}</span>
                          <span className="font-semibold tabular-nums text-slate-950">{formatMoney(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-slate-500" />
                  <h3 className="font-semibold text-slate-950">当前统计范围</h3>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">项目</span>
                    <span className="max-w-[170px] text-right font-medium text-slate-800">{selectedProject}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">月份</span>
                    <span className="font-medium text-slate-800">{selectedMonth === '全部月份' ? '全部月份' : selectedMonth.replace('-', ' 年 ') + ' 月'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">分类</span>
                    <span className="font-medium text-slate-800">{selectedCategory}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">正式成本</span>
                    <span className="font-semibold tabular-nums text-slate-950">{formatMoney(confirmedAmount)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="size-4 text-amber-300" />
                      推荐录入顺序
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-300">先选项目和日期，再填材料与金额，最后补齐凭证。</p>
                  </div>
                  <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-slate-300">4 步</span>
                </div>
                <ol className="mt-4 space-y-2.5 text-xs text-slate-300">
                  {['项目 / 采购日期', '材料名称 / 规格 / 单位', '数量 × 单价自动计算金额', '确认状态 / 凭证留痕'].map((item, index) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full border border-white/20 text-[10px] text-white">{index + 1}</span>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <ClipboardCheck className="size-4 text-emerald-600" />
                  台账规则
                </div>
                <div className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                  <p>金额 = 数量 × 单价，由系统统一计算。</p>
                  <p>同项目、同日期、同材料和同金额时，导入前提示重复。</p>
                  <p>一张票据可以对应多条材料登记，但原图只留一份。</p>
                </div>
              </div>
            </aside>
          </section>

          <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>预览数据仅用于体验字段和流程，不会写入正式台账。</span>
            <span className="inline-flex items-center gap-1.5">
              <ReceiptText className="size-3.5" />
              统计口径：已确认记录
            </span>
          </footer>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40">
          <button type="button" onClick={() => setDrawer(null)} className="absolute inset-0 bg-slate-950/25 backdrop-blur-[1px]" aria-label="关闭详情" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-medium text-slate-500">{drawer === 'new' ? '新增记录' : '登记详情'}</div>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  {drawer === 'new' ? '新增零星材料登记' : selectedRow?.name}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {drawer === 'new' ? '保存为草稿或确认后进入本期统计' : `${selectedRow?.projectShort} · ${selectedRow ? formatDate(selectedRow.purchaseDate) : ''}`}
                </p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="关闭">
                <X className="size-4" />
              </button>
            </div>

            {drawer === 'new' ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  <div className="space-y-6">
                    <section>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <span className="flex size-6 items-center justify-center rounded-md bg-slate-950 text-xs text-white">1</span>
                        先确定归属
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">所属项目 <em className="text-rose-500">*</em></span>
                          <select value={form.project} onChange={(event) => handleFormChange('project', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
                            {projects.filter((project) => project !== '全部项目').map((project) => <option key={project}>{project}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">采购日期 <em className="text-rose-500">*</em></span>
                          <input type="date" value={form.purchaseDate} onChange={(event) => handleFormChange('purchaseDate', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500" />
                        </label>
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <span className="flex size-6 items-center justify-center rounded-md bg-slate-950 text-xs text-white">2</span>
                        填写材料信息
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm sm:col-span-2">
                          <span className="font-medium text-slate-700">材料名称 <em className="text-rose-500">*</em></span>
                          <input value={form.name} onChange={(event) => handleFormChange('name', event.target.value)} placeholder="例如：高强螺栓、临时照明电缆" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500" />
                        </label>
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">材料分类 <em className="text-rose-500">*</em></span>
                          <select value={form.category} onChange={(event) => handleFormChange('category', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
                            {formCategories.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">规格型号</span>
                          <input value={form.specification} onChange={(event) => handleFormChange('specification', event.target.value)} placeholder="例如：M16×80" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500" />
                        </label>
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">数量 <em className="text-rose-500">*</em></span>
                          <input type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => handleFormChange('quantity', event.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500" />
                        </label>
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">单位 <em className="text-rose-500">*</em></span>
                          <select value={form.unit} onChange={(event) => handleFormChange('unit', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
                            {units.map((unit) => <option key={unit}>{unit}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">单价（元） <em className="text-rose-500">*</em></span>
                          <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => handleFormChange('unitPrice', event.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500" />
                        </label>
                      </div>
                      <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/70 px-3.5 py-3">
                        <div>
                          <div className="text-xs font-medium text-blue-700">系统自动计算金额</div>
                          <div className="mt-1 text-xs text-blue-600/80">数量 × 单价，不接受手工覆盖</div>
                        </div>
                        <div className="text-lg font-semibold tabular-nums text-blue-950">{formatMoney(formAmount)}</div>
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <span className="flex size-6 items-center justify-center rounded-md bg-slate-950 text-xs text-white">3</span>
                        补充采购信息
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">供应商 / 商店</span>
                          <input value={form.supplier} onChange={(event) => handleFormChange('supplier', event.target.value)} placeholder="可填零星采购商店名称" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500" />
                        </label>
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium text-slate-700">采购人</span>
                          <input value={form.purchaser} onChange={(event) => handleFormChange('purchaser', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
                        </label>
                        <label className="space-y-1.5 text-sm sm:col-span-2">
                          <span className="font-medium text-slate-700">票据号</span>
                          <input value={form.receiptNo} onChange={(event) => handleFormChange('receiptNo', event.target.value)} placeholder="有发票或收据时填写，用于重复识别" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500" />
                        </label>
                        <label className="space-y-1.5 text-sm sm:col-span-2">
                          <span className="font-medium text-slate-700">备注</span>
                          <textarea value={form.remark} onChange={(event) => handleFormChange('remark', event.target.value)} rows={3} placeholder="记录使用位置、采购原因或需要复核的情况" className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500" />
                        </label>
                      </div>
                    </section>

                    <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <FileImage className="size-4 text-slate-500" />
                        凭证原图
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">预览中用票据号模拟附件入口，正式版接入 OSS 原图上传和识别结果。</p>
                      <button type="button" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        <Paperclip className="size-3.5" />
                        添加凭证
                      </button>
                    </section>
                  </div>
                </div>
                <div className="border-t border-slate-200 px-5 py-4">
                  {message && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div>}
                  {!message && form.name && formAmount > 0 && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                      <Check className="size-3.5 text-emerald-600" />
                      当前登记金额 {formatMoney(formAmount)}，确认后会进入本期统计
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleCreate('draft')} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      保存草稿
                    </button>
                    <button type="button" onClick={() => handleCreate('confirmed')} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800">
                      <ClipboardCheck className="size-4" />
                      确认登记
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {selectedRow && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
                      <div>
                        <div className="text-xs text-slate-500">{selectedRow.category} · {selectedRow.specification}</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{formatMoney(getRowAmount(selectedRow))}</div>
                        <div className="mt-1 text-xs text-slate-500">{selectedRow.quantity.toLocaleString('zh-CN')} {selectedRow.unit} × {formatMoney(selectedRow.unitPrice)}</div>
                      </div>
                      <span className={cn('rounded-md border px-2 py-1 text-xs font-medium', statusMeta[selectedRow.status].className)}>{statusMeta[selectedRow.status].label}</span>
                    </div>
                    <dl className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
                      {[
                        ['所属项目', selectedRow.project],
                        ['采购日期', formatDate(selectedRow.purchaseDate)],
                        ['供应商 / 商店', selectedRow.supplier],
                        ['采购人', selectedRow.purchaser],
                        ['数据来源', selectedRow.source],
                        ['票据号', selectedRow.receiptNo || '未填写'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs text-slate-400">{label}</dt>
                          <dd className="mt-1 font-medium text-slate-800">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <FileImage className="size-4 text-slate-500" />
                          凭证留痕
                        </div>
                        <span className="text-xs text-slate-500">{selectedRow.hasReceipt ? `${selectedRow.receiptCount} 个附件` : '暂未上传'}</span>
                      </div>
                      {selectedRow.hasReceipt ? (
                        <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex size-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                            <FileImage className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800">采购票据原图_{selectedRow.receiptNo || selectedRow.id}.jpg</div>
                            <div className="mt-0.5 text-xs text-slate-400">OSS 原图 · 可查看识别结果</div>
                          </div>
                          <button type="button" className="text-xs font-medium text-blue-700 hover:text-blue-900">查看</button>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs leading-5 text-slate-500">该记录暂未上传凭证。确认前建议补充原图，便于后续核对。</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <FileText className="size-4 text-slate-500" />
                        登记说明
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{selectedRow.remark || '暂无备注'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-sm font-semibold text-slate-800">状态说明</div>
                      <div className="mt-3 space-y-3 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-3" /></span>
                          <div><div className="font-medium text-slate-700">已创建登记</div><div className="mt-0.5 text-slate-400">记录已保存，金额由数量和单价计算</div></div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className={cn('mt-0.5 flex size-4 items-center justify-center rounded-full', selectedRow.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400')}><Check className="size-3" /></span>
                          <div><div className="font-medium text-slate-700">{selectedRow.status === 'voided' ? '记录已作废' : selectedRow.status === 'confirmed' ? '已确认进入成本' : '等待确认'}</div><div className="mt-0.5 text-slate-400">{selectedRow.status === 'confirmed' ? '已计入当前筛选范围的正式成本' : selectedRow.status === 'voided' ? '保留台账痕迹，不再计入统计' : '确认后才会进入成本中心和月报'}</div></div>
                        </div>
                      </div>
                    </div>
                    {message && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div>}
                  </div>
                )}
              </div>
            )}

            {drawer === 'detail' && selectedRow && (
              <div className="border-t border-slate-200 px-5 py-4">
                <div className="flex gap-2">
                  {selectedRow.status === 'draft' && (
                    <button type="button" onClick={confirmSelectedRow} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800">
                      <ClipboardCheck className="size-4" />
                      确认登记
                    </button>
                  )}
                  {selectedRow.status !== 'voided' && (
                    <button type="button" onClick={voidSelectedRow} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                      作废记录
                    </button>
                  )}
                  <button type="button" onClick={() => setDrawer(null)} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    关闭
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
