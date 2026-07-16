'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Database, Download, Plus, Save, TrendingUp, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

interface StandardItem {
  id: number;
  code: string;
  name: string;
  unit?: string;
  category?: string;
  material_included?: boolean;
}

interface PriceRow {
  id: number;
  standard_item_id: number;
  project_name?: string;
  region?: string;
  project_type?: string;
  price: number;
  bid_year?: number;
  cost_year?: number;
  material_included?: boolean;
  remark?: string;
  bid_standard_items?: { code?: string; name?: string };
}

interface AliasRow {
  id: number;
  standard_item_id: number;
  alias_name: string;
}

interface ImportReviewRow {
  rowId: string;
  originalName: string;
  standardItemId: number | '';
  matchScore: number;
  projectName: string;
  region: string;
  projectType: string;
  unit: string;
  price: number;
  year: number;
  materialIncluded: boolean;
  remark: string;
  ignored: boolean;
}

interface StandardImportRow {
  code: string;
  name: string;
  unit: string;
  category: string;
  material_included: boolean;
  material_scope_note: string;
  sort_order: number;
  status: string;
}

interface StandardInsight {
  bidCount: number;
  costCount: number;
  aliasCount: number;
  latestBidPrice: number;
  latestBidYear?: number;
}

type Tab = 'standard' | 'bidPrice' | 'costPrice';

const initialStandard = { code: '', name: '', unit: '', category: '', material_included: false, material_scope_note: '' };
const initialPrice = { standard_item_id: '', project_name: '', region: '', project_type: '', price: '', year: String(new Date().getFullYear()), material_included: false, remark: '' };

function normalize(value: string) {
  return value.replace(/[（(].*?[）)]/g, '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase();
}

function fuzzyScore(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 86;
  let common = 0;
  const used = new Set<number>();
  for (const char of left) {
    const index = [...right].findIndex((r, i) => r === char && !used.has(i));
    if (index >= 0) {
      used.add(index);
      common += 1;
    }
  }
  return Math.round((common / Math.max(left.length, right.length)) * 72);
}

function toNumber(value: unknown) {
  return Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
}

function boolFromCell(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return ['是', '含', '含材料', 'true', 'yes', '1'].includes(text);
}

export default function BidLibraryPage() {
  const importRef = useRef<HTMLInputElement>(null);
  const standardImportRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('standard');
  const [standards, setStandards] = useState<StandardItem[]>([]);
  const [bidPrices, setBidPrices] = useState<PriceRow[]>([]);
  const [costPrices, setCostPrices] = useState<PriceRow[]>([]);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [reviewRows, setReviewRows] = useState<ImportReviewRow[]>([]);
  const [standardForm, setStandardForm] = useState(initialStandard);
  const [priceForm, setPriceForm] = useState(initialPrice);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch('/api/bid-estimations/library');
    const json = await res.json();
    if (json.success) {
      setStandards(json.data.standards || []);
      setBidPrices(json.data.bidPrices || []);
      setCostPrices(json.data.costPrices || []);
      setAliases(json.data.aliases || []);
    }
  }

  useEffect(() => {
    fetch('/api/bid-estimations/library')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setStandards(json.data.standards || []);
          setBidPrices(json.data.bidPrices || []);
          setCostPrices(json.data.costPrices || []);
          setAliases(json.data.aliases || []);
        }
      });
  }, []);

  const activeRows = tab === 'bidPrice' ? bidPrices : costPrices;
  const priceTypeLabel = tab === 'bidPrice' ? '历史中标单价' : '内部结算单价';

  const standardInsights = useMemo(() => {
    const map: Record<number, StandardInsight> = {};
    standards.forEach(item => {
      map[item.id] = { bidCount: 0, costCount: 0, aliasCount: 0, latestBidPrice: 0 };
    });
    bidPrices.forEach(row => {
      const current = map[row.standard_item_id] || { bidCount: 0, costCount: 0, aliasCount: 0, latestBidPrice: 0 };
      current.bidCount += 1;
      const rowYear = Number(row.bid_year || 0);
      if (!current.latestBidYear || rowYear >= current.latestBidYear) {
        current.latestBidPrice = Number(row.price || 0);
        current.latestBidYear = row.bid_year;
      }
      map[row.standard_item_id] = current;
    });
    costPrices.forEach(row => {
      const current = map[row.standard_item_id] || { bidCount: 0, costCount: 0, aliasCount: 0, latestBidPrice: 0 };
      current.costCount += 1;
      map[row.standard_item_id] = current;
    });
    aliases.forEach(row => {
      const current = map[row.standard_item_id] || { bidCount: 0, costCount: 0, aliasCount: 0, latestBidPrice: 0 };
      current.aliasCount += 1;
      map[row.standard_item_id] = current;
    });
    return map;
  }, [standards, bidPrices, costPrices, aliases]);

  const stats = useMemo(() => [
    { label: '标准清单', value: standards.length, unit: '项' },
    { label: '历史中标价', value: bidPrices.length, unit: '条' },
    { label: '内部成本价', value: costPrices.length, unit: '条' },
    { label: '已有关联报价', value: standards.filter(item => (standardInsights[item.id]?.bidCount || 0) > 0).length, unit: '项' },
  ], [standards, bidPrices.length, costPrices.length, standardInsights]);

  async function saveStandard() {
    if (!standardForm.code || !standardForm.name) return alert('请填写编码和清单名称');
    setSaving(true);
    try {
      const res = await fetch('/api/bid-estimations/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'standard', ...standardForm }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setStandardForm(initialStandard);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function savePrice() {
    if (!priceForm.standard_item_id || !priceForm.price) return alert('请选择标准清单并填写单价');
    setSaving(true);
    try {
      const type = tab === 'bidPrice' ? 'bidPrice' : 'costPrice';
      const payload = {
        type,
        standard_item_id: Number(priceForm.standard_item_id),
        project_name: priceForm.project_name,
        region: priceForm.region,
        project_type: priceForm.project_type,
        price: Number(priceForm.price),
        material_included: priceForm.material_included,
        remark: priceForm.remark,
        bid_year: Number(priceForm.year),
        cost_year: Number(priceForm.year),
      };
      const res = await fetch('/api/bid-estimations/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setPriceForm(initialPrice);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const rows = [
      {
        标准编码: 'MB-001',
        标准清单名称: '模板安装拆除',
        原始清单名称: '模板工程',
        来源项目: '示例项目',
        地区: '沈阳',
        工程类型: '住宅',
        单位: 'm2',
        单价: 0,
        年份: new Date().getFullYear(),
        是否含材料: '否',
        备注: '',
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '导入模板');
    XLSX.writeFile(workbook, `${priceTypeLabel}_导入模板.xlsx`);
  }

  function downloadStandardTemplate() {
    const rows = [
      {
        '标准编码*': 'MB-001',
        '标准清单名称*': '模板安装拆除',
        单位: 'm2',
        分类: '模板工程',
        是否含材料: '否',
        材料范围说明: '',
        排序: 1,
        状态: 'active',
      },
      {
        '标准编码*': 'GT-001',
        '标准清单名称*': '钢筋制作安装',
        单位: 't',
        分类: '钢筋工程',
        是否含材料: '否',
        材料范围说明: '',
        排序: 2,
        状态: 'active',
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '标准清单导入模板');
    XLSX.writeFile(workbook, '标准清单库_导入模板.xlsx');
  }

  function cell(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim()) return value;
    }
    return '';
  }

  function cellLoose(row: Record<string, unknown>, keys: string[]) {
    const exact = cell(row, keys);
    if (exact) return exact;

    const normalizedKeys = new Set(keys.map(key => normalize(key)));
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined && value !== null && String(value).trim() && normalizedKeys.has(normalize(key))) {
        return value;
      }
    }
    return '';
  }

  function findStandard(row: Record<string, unknown>) {
    const code = String(row['标准编码'] || row['编码'] || '').trim();
    if (code) {
      const exactCode = standards.find(item => normalize(item.code) === normalize(code));
      if (exactCode) return { item: exactCode, score: 100 };
    }

    const name = String(row['标准清单名称'] || row['标准清单'] || row['清单名称'] || row['原始清单名称'] || '').trim();
    if (!name) return null;
    const exactAlias = aliases.find(alias => normalize(alias.alias_name) === normalize(name));
    if (exactAlias) {
      const item = standards.find(standard => standard.id === exactAlias.standard_item_id);
      if (item) return { item, score: 100 };
    }

    const scored = standards
      .map(item => {
        const aliasScore = aliases
          .filter(alias => alias.standard_item_id === item.id)
          .reduce((max, alias) => Math.max(max, fuzzyScore(name, alias.alias_name)), 0);
        return { item, score: Math.max(fuzzyScore(name, item.name), fuzzyScore(name, item.code), aliasScore) };
      })
      .sort((a, b) => b.score - a.score)[0];
    return scored && scored.score >= 55 ? scored : null;
  }

  function importStandardFile(file: File) {
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const invalidRows: number[] = [];
        const duplicatedCodes = new Set<string>();
        const rowMap = new Map<string, StandardImportRow>();

        rows.forEach((row, index) => {
          const code = String(cellLoose(row, ['标准编码*', '标准编码', '编码', '清单编码', 'code']) || '').trim();
          const name = String(cellLoose(row, ['标准清单名称*', '标准清单名称', '清单名称', '名称', 'name']) || '').trim();
          const hasAnyValue = Object.values(row).some(value => String(value ?? '').trim());
          if (!hasAnyValue) return;
          if (!code || !name) {
            invalidRows.push(index + 2);
            return;
          }

          const normalizedCode = normalize(code);
          if (rowMap.has(normalizedCode)) duplicatedCodes.add(code);
          rowMap.set(normalizedCode, {
            code,
            name,
            unit: String(cellLoose(row, ['单位', 'unit']) || '').trim(),
            category: String(cellLoose(row, ['分类', '类别', 'category']) || '').trim(),
            material_included: boolFromCell(cellLoose(row, ['是否含材料', '含材料', 'material_included'])),
            material_scope_note: String(cellLoose(row, ['材料范围说明', '含材说明', '备注', 'material_scope_note']) || '').trim(),
            sort_order: toNumber(cellLoose(row, ['排序', '排序号', 'sort_order'])),
            status: String(cellLoose(row, ['状态', 'status']) || 'active').trim() || 'active',
          });
        });

        const items = Array.from(rowMap.values());
        if (invalidRows.length) {
          alert(`第 ${invalidRows.join('、')} 行缺少标准编码或标准清单名称，请补充后再导入`);
          return;
        }
        if (!items.length) {
          alert('未识别到可导入的标准清单，请检查模板内容');
          return;
        }

        const existingCodes = new Set(standards.map(item => normalize(item.code)));
        const updateCount = items.filter(item => existingCodes.has(normalize(item.code))).length;
        const duplicateTip = duplicatedCodes.size ? `\n同一文件中有 ${duplicatedCodes.size} 个重复编码，系统将保留最后一条。` : '';
        const confirmed = window.confirm(`识别到 ${items.length} 条标准清单，其中 ${updateCount} 条会更新现有编码，${items.length - updateCount} 条会新增。${duplicateTip}\n确认导入吗？`);
        if (!confirmed) return;

        setSaving(true);
        const res = await fetch('/api/bid-estimations/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'standardBatch', items }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        await load();
        alert(`标准清单导入完成：新增 ${json.data?.created || 0} 条，更新 ${json.data?.updated || 0} 条`);
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : '标准清单批量导入失败');
      } finally {
        setSaving(false);
        if (standardImportRef.current) standardImportRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function importPriceFile(file: File) {
    if (tab === 'standard') return;
    const reader = new FileReader();
    reader.onload = event => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const parsed = rows.map((row, index) => {
        const matched = findStandard(row);
        const standard = matched?.item;
        const price = toNumber(cell(row, ['单价', '中标单价', '结算单价', '人工成本价', '成本价']));
        const year = toNumber(row['年份'] || row['中标年份'] || row['结算年份'] || new Date().getFullYear());
        return {
          rowId: `${Date.now()}-${index}`,
          originalName: String(cell(row, ['原始清单名称', '清单名称', '标准清单名称', '标准清单']) || '').trim(),
          standardItemId: standard?.id || '',
          matchScore: matched?.score || 0,
          projectName: String(cell(row, ['来源项目', '项目名称']) || '').trim(),
          region: String(row['地区'] || '').trim(),
          projectType: String(row['工程类型'] || '').trim(),
          unit: String(row['单位'] || standard?.unit || '').trim(),
          price,
          materialIncluded: boolFromCell(row['是否含材料'] || row['含材料']),
          remark: String(row['备注'] || '').trim(),
          year: year || new Date().getFullYear(),
          ignored: !standard || !price,
        } satisfies ImportReviewRow;
      }).filter(row => row.originalName || row.price || row.projectName);

      if (!parsed.length) {
        alert('未识别到可导入的数据，请检查清单名称和单价列');
        return;
      }

      setReviewRows(parsed);
      if (importRef.current) importRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  function updateReviewRow(rowId: string, updates: Partial<ImportReviewRow>) {
    setReviewRows(prev => prev.map(row => row.rowId === rowId ? { ...row, ...updates } : row));
  }

  async function confirmImportRows() {
    const validRows = reviewRows.filter(row => !row.ignored && row.standardItemId && row.price > 0);
    if (!validRows.length) return alert('请至少保留一条已匹配且有单价的数据');

    const type = tab === 'bidPrice' ? 'bidPrice' : 'costPrice';
    setSaving(true);
    try {
      const results = await Promise.all(validRows.map(row => fetch('/api/bid-estimations/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          standard_item_id: Number(row.standardItemId),
          project_name: row.projectName,
          region: row.region,
          project_type: row.projectType,
          item_original_name: row.originalName,
          unit: row.unit,
          price: row.price,
          material_included: row.materialIncluded,
          remark: row.remark,
          bid_year: row.year,
          cost_year: row.year,
        }),
      }).then(res => res.json())));
      const failed = results.filter(result => !result.success);
      if (failed.length) throw new Error(failed[0].error || '部分数据导入失败');

      await Promise.allSettled(validRows
        .filter(row => row.originalName && row.standardItemId)
        .map(row => fetch('/api/bid-estimations/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'alias',
            standard_item_id: Number(row.standardItemId),
            alias_name: row.originalName,
            source_type: 'import',
          }),
        })));

      await load();
      setReviewRows([]);
      alert(`已导入 ${validRows.length} 条${priceTypeLabel}，并同步沉淀清单别名`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '批量导入失败');
    } finally {
      setSaving(false);
    }
  }

  async function createStandardForReview(row: ImportReviewRow) {
    const defaultCode = `TMP-${Date.now().toString().slice(-6)}`;
    const code = window.prompt('请输入标准清单编码', defaultCode)?.trim();
    if (!code) return;
    const name = window.prompt('请输入标准清单名称', row.originalName)?.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bid-estimations/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'standard',
          code,
          name,
          unit: row.unit,
          material_included: row.materialIncluded,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
      updateReviewRow(row.rowId, { standardItemId: json.data.id, matchScore: 100, ignored: false });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '新增标准清单失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/cost-estimation/bid" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E6EB] bg-white hover:bg-[#F7F8FA]">
              <ArrowLeft className="h-4 w-4 text-[#4E5969]" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[#1D2129]">投标测算资料库</h1>
              <p className="mt-1 text-sm text-[#86909C]">维护标准清单、历史中标价和内部结算成本价。</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {stats.map(item => (
            <div key={item.label} className="rounded-xl border border-[#E5E6EB] bg-white p-4">
              <p className="text-xs text-[#86909C]">{item.label}</p>
              <p className="mt-2 text-2xl font-bold text-[#1D2129]">{item.value}<span className="ml-1 text-xs font-normal text-[#86909C]">{item.unit}</span></p>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-[#E5E6EB] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#165DFF]" />
            <span className="font-medium text-[#1D2129]">资料库维护重点</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <LibraryHint title="先建标准清单" desc="标准编码和名称是导入匹配、趋势分析和后续报价复用的统一口径。" />
            <LibraryHint title="再沉淀中标价" desc="每次已中标项目清单导入后，都会成为首页报价趋势的数据来源。" />
            <LibraryHint title="同步维护成本价" desc="内部结算单价用于新项目建议报价和利润空间判断。" />
          </div>
        </section>

        <div className="rounded-xl border border-[#E5E6EB] bg-white">
          <div className="flex border-b border-[#E5E6EB] px-4">
            {[
              ['standard', '标准清单库'],
              ['bidPrice', '历史中标单价库'],
              ['costPrice', '内部结算单价库'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key as Tab)} className={`h-12 border-b-2 px-4 text-sm ${tab === key ? 'border-[#165DFF] text-[#165DFF]' : 'border-transparent text-[#4E5969]'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'standard' ? (
            <div className="grid gap-5 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
              <section className="rounded-lg border border-[#E5E6EB] p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-[#1D2129]"><Plus className="h-4 w-4" />新增标准清单</div>
                <div className="space-y-3">
                  <Input label="标准编码" value={standardForm.code} onChange={v => setStandardForm({ ...standardForm, code: v })} placeholder="例如 MB-001" />
                  <Input label="清单名称" value={standardForm.name} onChange={v => setStandardForm({ ...standardForm, name: v })} placeholder="例如 模板安装拆除" />
                  <Input label="单位" value={standardForm.unit} onChange={v => setStandardForm({ ...standardForm, unit: v })} placeholder="m2 / m3 / t" />
                  <Input label="分类" value={standardForm.category} onChange={v => setStandardForm({ ...standardForm, category: v })} placeholder="模板工程" />
                  <label className="flex items-center gap-2 text-sm text-[#4E5969]">
                    <input type="checkbox" checked={standardForm.material_included} onChange={e => setStandardForm({ ...standardForm, material_included: e.target.checked })} />
                    默认含材料
                  </label>
                  <button disabled={saving} onClick={saveStandard} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#165DFF] text-sm text-white disabled:opacity-60">
                    <Save className="h-4 w-4" />保存标准清单
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="rounded-lg border border-[#E5E6EB] bg-[#FAFBFC] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#1D2129]">标准清单库台账</p>
                      <p className="mt-1 text-xs text-[#86909C]">支持 Excel/CSV 批量导入；标准编码重复时自动更新，不重复建档。</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={downloadStandardTemplate} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D9DCE3] bg-white px-3 text-xs text-[#1D2129] hover:bg-[#F7F8FA]">
                        <Download className="h-4 w-4" />模板
                      </button>
                      <input ref={standardImportRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) importStandardFile(e.target.files[0]); }} />
                      <button disabled={saving} onClick={() => standardImportRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#165DFF] px-3 text-xs text-white disabled:opacity-60">
                        <Upload className="h-4 w-4" />批量导入
                      </button>
                    </div>
                  </div>
                </div>
                <StandardTable standards={standards} insights={standardInsights} />
              </section>
            </div>
          ) : (
            <div className="grid gap-5 p-4 lg:grid-cols-[380px_minmax(0,1fr)]">
              <section className="rounded-lg border border-[#E5E6EB] p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-[#1D2129]"><Database className="h-4 w-4" />新增{priceTypeLabel}</div>
                <div className="space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[#4E5969]">标准清单</span>
                    <select value={priceForm.standard_item_id} onChange={e => setPriceForm({ ...priceForm, standard_item_id: e.target.value })} className="h-10 w-full rounded-lg border border-[#D9DCE3] px-3 text-sm outline-none focus:border-[#165DFF]">
                      <option value="">请选择</option>
                      {standards.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                    </select>
                  </label>
                  <Input label="来源项目" value={priceForm.project_name} onChange={v => setPriceForm({ ...priceForm, project_name: v })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="地区" value={priceForm.region} onChange={v => setPriceForm({ ...priceForm, region: v })} />
                    <Input label="工程类型" value={priceForm.project_type} onChange={v => setPriceForm({ ...priceForm, project_type: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="单价" type="number" value={priceForm.price} onChange={v => setPriceForm({ ...priceForm, price: v })} />
                    <Input label="年份" type="number" value={priceForm.year} onChange={v => setPriceForm({ ...priceForm, year: v })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#4E5969]">
                    <input type="checkbox" checked={priceForm.material_included} onChange={e => setPriceForm({ ...priceForm, material_included: e.target.checked })} />
                    含材料
                  </label>
                  <Input label="备注" value={priceForm.remark} onChange={v => setPriceForm({ ...priceForm, remark: v })} />
                  <button disabled={saving} onClick={savePrice} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#165DFF] text-sm text-white disabled:opacity-60">
                    <Save className="h-4 w-4" />保存单价
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="rounded-lg border border-[#E5E6EB] bg-[#FAFBFC] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#1D2129]">{priceTypeLabel}台账</p>
                      <p className="mt-1 text-xs text-[#86909C]">
                        这里维护的是后续自动匹配和报价趋势的数据源。历史中标价默认代表已中标项目，不需要再单独标记状态。
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={downloadTemplate} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D9DCE3] bg-white px-3 text-xs text-[#1D2129] hover:bg-[#F7F8FA]">
                        <Download className="h-4 w-4" />模板
                      </button>
                      <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) importPriceFile(e.target.files[0]); }} />
                      <button disabled={saving} onClick={() => importRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#165DFF] px-3 text-xs text-white disabled:opacity-60">
                        <Upload className="h-4 w-4" />批量导入
                      </button>
                    </div>
                  </div>
                </div>
                {reviewRows.length > 0 && (
                  <ImportReviewTable
                    rows={reviewRows}
                    standards={standards}
                    saving={saving}
                    onChange={updateReviewRow}
                    onCreateStandard={createStandardForReview}
                    onConfirm={confirmImportRows}
                    onCancel={() => setReviewRows([])}
                  />
                )}
                <PriceTable rows={activeRows} type={tab} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryHint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-[#E5E6EB] bg-[#FAFBFC] p-3">
      <p className="text-sm font-medium text-[#1D2129]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#86909C]">{desc}</p>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[#4E5969]">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-[#D9DCE3] px-3 text-sm outline-none focus:border-[#165DFF]" />
    </label>
  );
}

function ImportReviewTable({
  rows,
  standards,
  saving,
  onChange,
  onCreateStandard,
  onConfirm,
  onCancel,
}: {
  rows: ImportReviewRow[];
  standards: StandardItem[];
  saving: boolean;
  onChange: (rowId: string, updates: Partial<ImportReviewRow>) => void;
  onCreateStandard: (row: ImportReviewRow) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const validCount = rows.filter(row => !row.ignored && row.standardItemId && row.price > 0).length;
  const problemCount = rows.length - validCount;
  return (
    <section className="overflow-hidden rounded-lg border border-[#FADC9D] bg-[#FFFDF7]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#FADC9D] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-[#1D2129]">导入待确认</p>
          <p className="mt-1 text-xs text-[#86909C]">先确认匹配关系和单价，再写入历史库；原始清单名称会自动沉淀为别名。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#86909C]">可导入 {validCount} 条 / 需处理 {problemCount} 条</span>
          <button onClick={onCancel} className="h-8 rounded-lg border border-[#D9DCE3] bg-white px-3 text-xs text-[#4E5969]">取消</button>
          <button disabled={saving || validCount === 0} onClick={onConfirm} className="h-8 rounded-lg bg-[#165DFF] px-3 text-xs text-white disabled:opacity-60">确认入库</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-[#FFF7E8] text-xs text-[#86909C]">
            <tr>
              <th className="px-3 py-3 text-left font-medium">原始清单</th>
              <th className="px-3 py-3 text-left font-medium">匹配标准清单</th>
              <th className="px-3 py-3 text-left font-medium">来源项目</th>
              <th className="px-3 py-3 text-left font-medium">地区 / 类型</th>
              <th className="px-3 py-3 text-center font-medium">单位</th>
              <th className="px-3 py-3 text-right font-medium">单价</th>
              <th className="px-3 py-3 text-center font-medium">年份</th>
              <th className="px-3 py-3 text-center font-medium">含材料</th>
              <th className="px-3 py-3 text-center font-medium">处理</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FADC9D] bg-white">
            {rows.map(row => (
              <tr key={row.rowId} className={row.ignored ? 'bg-[#F7F8FA] text-[#86909C]' : ''}>
                <td className="px-3 py-3">
                  <input value={row.originalName} onChange={e => onChange(row.rowId, { originalName: e.target.value })} className="h-9 w-52 rounded-lg border border-[#D9DCE3] px-2 text-sm" />
                  <div className="mt-1 text-xs text-[#86909C]">匹配度 {row.matchScore}</div>
                </td>
                <td className="px-3 py-3">
                  <select value={row.standardItemId} onChange={e => onChange(row.rowId, { standardItemId: Number(e.target.value) || '', ignored: !e.target.value || row.price <= 0, matchScore: e.target.value ? 100 : row.matchScore })} className="h-9 w-64 rounded-lg border border-[#D9DCE3] px-2 text-sm">
                    <option value="">未匹配</option>
                    {standards.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                  </select>
                  {!row.standardItemId && (
                    <button onClick={() => onCreateStandard(row)} className="mt-2 h-7 rounded-md border border-[#D9DCE3] px-2 text-xs text-[#165DFF]">新增标准清单</button>
                  )}
                </td>
                <td className="px-3 py-3"><input value={row.projectName} onChange={e => onChange(row.rowId, { projectName: e.target.value })} className="h-9 w-40 rounded-lg border border-[#D9DCE3] px-2 text-sm" /></td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <input value={row.region} onChange={e => onChange(row.rowId, { region: e.target.value })} placeholder="地区" className="h-9 w-24 rounded-lg border border-[#D9DCE3] px-2 text-sm" />
                    <input value={row.projectType} onChange={e => onChange(row.rowId, { projectType: e.target.value })} placeholder="类型" className="h-9 w-24 rounded-lg border border-[#D9DCE3] px-2 text-sm" />
                  </div>
                </td>
                <td className="px-3 py-3 text-center"><input value={row.unit} onChange={e => onChange(row.rowId, { unit: e.target.value })} className="h-9 w-20 rounded-lg border border-[#D9DCE3] px-2 text-center text-sm" /></td>
                <td className="px-3 py-3 text-right"><input type="number" value={row.price || ''} onChange={e => onChange(row.rowId, { price: Number(e.target.value) || 0, ignored: !row.standardItemId || Number(e.target.value) <= 0 })} className="h-9 w-24 rounded-lg border border-[#D9DCE3] px-2 text-right text-sm" /></td>
                <td className="px-3 py-3 text-center"><input type="number" value={row.year || ''} onChange={e => onChange(row.rowId, { year: Number(e.target.value) || new Date().getFullYear() })} className="h-9 w-20 rounded-lg border border-[#D9DCE3] px-2 text-center text-sm" /></td>
                <td className="px-3 py-3 text-center"><input type="checkbox" checked={row.materialIncluded} onChange={e => onChange(row.rowId, { materialIncluded: e.target.checked })} /></td>
                <td className="px-3 py-3 text-center">
                  <label className="inline-flex items-center gap-1 text-xs text-[#4E5969]">
                    <input type="checkbox" checked={row.ignored} onChange={e => onChange(row.rowId, { ignored: e.target.checked })} />
                    忽略
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StandardTable({ standards, insights }: { standards: StandardItem[]; insights: Record<number, StandardInsight> }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#E5E6EB]">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-[#F7F8FA] text-xs text-[#86909C]">
          <tr>
            <th className="px-3 py-3 text-left font-medium">编码</th>
            <th className="px-3 py-3 text-left font-medium">清单名称</th>
            <th className="px-3 py-3 text-left font-medium">单位</th>
            <th className="px-3 py-3 text-left font-medium">分类</th>
            <th className="px-3 py-3 text-left font-medium">材料</th>
            <th className="px-3 py-3 text-right font-medium">中标价记录</th>
            <th className="px-3 py-3 text-right font-medium">成本价记录</th>
            <th className="px-3 py-3 text-right font-medium">别名</th>
            <th className="px-3 py-3 text-right font-medium">最近中标价</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E6EB]">
          {standards.map(item => {
            const insight = insights[item.id] || { bidCount: 0, costCount: 0, aliasCount: 0, latestBidPrice: 0 };
            return (
              <tr key={item.id}>
                <td className="px-3 py-3 font-medium text-[#165DFF]">{item.code}</td>
                <td className="px-3 py-3 text-[#1D2129]">{item.name}</td>
                <td className="px-3 py-3 text-[#4E5969]">{item.unit || '-'}</td>
                <td className="px-3 py-3 text-[#4E5969]">{item.category || '-'}</td>
                <td className="px-3 py-3 text-[#4E5969]">{item.material_included ? '含材料' : '不含材料'}</td>
                <td className="px-3 py-3 text-right text-[#4E5969]">{insight.bidCount}</td>
                <td className="px-3 py-3 text-right text-[#4E5969]">{insight.costCount}</td>
                <td className="px-3 py-3 text-right text-[#4E5969]">{insight.aliasCount}</td>
                <td className="px-3 py-3 text-right font-medium text-[#1D2129]">
                  {insight.latestBidPrice ? `${Number(insight.latestBidPrice).toLocaleString()} 元/${item.unit || '-'}` : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function PriceTable({ rows, type }: { rows: PriceRow[]; type: Tab }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#E5E6EB]">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-[#F7F8FA] text-xs text-[#86909C]">
          <tr>
            <th className="px-3 py-3 text-left font-medium">标准清单</th>
            <th className="px-3 py-3 text-left font-medium">来源项目</th>
            <th className="px-3 py-3 text-left font-medium">地区 / 类型</th>
            <th className="px-3 py-3 text-right font-medium">单价</th>
            <th className="px-3 py-3 text-center font-medium">年份</th>
            <th className="px-3 py-3 text-left font-medium">备注</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E6EB]">
          {rows.map(row => (
            <tr key={row.id}>
              <td className="px-3 py-3 text-[#1D2129]">{row.bid_standard_items?.code || '-'} · {row.bid_standard_items?.name || '-'}</td>
              <td className="px-3 py-3 text-[#4E5969]">{row.project_name || '-'}</td>
              <td className="px-3 py-3 text-[#4E5969]">{row.region || '-'} / {row.project_type || '-'}</td>
              <td className="px-3 py-3 text-right font-medium tabular-nums">{Number(row.price || 0).toLocaleString()} 元</td>
              <td className="px-3 py-3 text-center">{type === 'bidPrice' ? row.bid_year : row.cost_year}</td>
              <td className="px-3 py-3 text-[#4E5969]">{row.remark || '-'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-12 text-center text-[#86909C]">暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
