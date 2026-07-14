'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, FileSpreadsheet, Save, Search, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

interface StandardItem {
  id: number;
  code: string;
  name: string;
  unit?: string;
  category?: string;
  material_included?: boolean;
}

interface PriceRecord {
  id: number;
  standard_item_id: number;
  project_name?: string;
  region?: string;
  project_type?: string;
  price: number;
  bid_year?: number;
  cost_year?: number;
  material_included?: boolean;
  created_at?: string;
}

interface Candidate {
  id: number;
  code: string;
  name: string;
  score: number;
}

interface BoqItem {
  rowId: string;
  boq_item_name: string;
  boq_content: string;
  unit: string;
  quantity: number;
  standard_item_id: number | null;
  standard_code: string;
  standard_name: string;
  match_score: number;
  match_status: 'matched' | 'review' | 'unmatched';
  candidates: Candidate[];
  historical_bid_price: number;
  cost_price: number;
  profit_rate: number;
  final_price: number;
  is_manual_price: boolean;
  pricing_warning: string;
}

interface MgmtFee {
  position: string;
  monthly_salary: number;
  headcount: number;
  months: number;
  amount: number;
}

const defaultFees: MgmtFee[] = [
  { position: '项目经理', monthly_salary: 15000, headcount: 1, months: 6, amount: 90000 },
  { position: '预算员', monthly_salary: 9000, headcount: 1, months: 6, amount: 54000 },
  { position: '施工员', monthly_salary: 8000, headcount: 1, months: 6, amount: 48000 },
];

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

function money(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export default function NewBidPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bidId, setBidId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');

  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [projectType, setProjectType] = useState('');
  const [durationMonths, setDurationMonths] = useState(6);
  const [materialIncluded, setMaterialIncluded] = useState(false);
  const [materialScopeNote, setMaterialScopeNote] = useState('');
  const [globalProfitRate, setGlobalProfitRate] = useState(10);

  const [standards, setStandards] = useState<StandardItem[]>([]);
  const [bidPrices, setBidPrices] = useState<PriceRecord[]>([]);
  const [costPrices, setCostPrices] = useState<PriceRecord[]>([]);
  const [items, setItems] = useState<BoqItem[]>([]);
  const [fees, setFees] = useState<MgmtFee[]>(defaultFees);

  useEffect(() => {
    fetch('/api/bid-estimations/library')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setStandards(json.data.standards || []);
          setBidPrices(json.data.bidPrices || []);
          setCostPrices(json.data.costPrices || []);
        }
      });
  }, []);

  const costBaseAmount = useMemo(() => items.reduce((sum, item) => {
    const base = item.cost_price || item.historical_bid_price || 0;
    return sum + base * item.quantity;
  }, 0), [items]);

  const totalMgmt = useMemo(() => fees.reduce((sum, fee) => sum + fee.amount, 0), [fees]);
  const managementFeeRate = costBaseAmount > 0 ? (totalMgmt / costBaseAmount) * 100 : 0;

  const calculatedItems = useMemo(() => items.map(item => {
    const base = item.cost_price || item.historical_bid_price || 0;
    const suggested = base ? base * (1 + managementFeeRate / 100) * (1 + item.profit_rate / 100) : 0;
    const finalPrice = item.is_manual_price ? item.final_price : suggested;
    const warning = buildWarning(item, base);
    return {
      ...item,
      suggested_price: suggested,
      suggested_amount: suggested * item.quantity,
      final_price: finalPrice,
      final_amount: finalPrice * item.quantity,
      pricing_warning: warning,
    };
  }), [items, managementFeeRate]);

  const totalHistory = calculatedItems.reduce((sum, item) => sum + item.historical_bid_price * item.quantity, 0);
  const totalCost = calculatedItems.reduce((sum, item) => sum + item.cost_price * item.quantity, 0);
  const totalSuggested = calculatedItems.reduce((sum, item) => sum + item.suggested_amount, 0);
  const totalFinal = calculatedItems.reduce((sum, item) => sum + item.final_amount, 0);
  const matchedCount = calculatedItems.filter(item => item.standard_item_id).length;
  const riskCount = calculatedItems.filter(item => item.pricing_warning).length;

  const visibleItems = calculatedItems.filter(item => {
    if (!keyword.trim()) return true;
    const text = `${item.boq_item_name} ${item.standard_code} ${item.standard_name}`.toLowerCase();
    return text.includes(keyword.toLowerCase());
  });

  function parseBoq(file: File) {
    const reader = new FileReader();
    reader.onload = event => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const headers = Object.keys(rows[0] || {});

      const nameKey = headers.find(h => /清单|名称|项目名称|分部分项|工程内容/i.test(h)) || headers[0];
      const contentKey = headers.find(h => /内容|描述|特征|说明|项目特征/i.test(h)) || '';
      const unitKey = headers.find(h => /单位|计量单位/i.test(h)) || '';
      const qtyKey = headers.find(h => /数量|工程量|工程数量/i.test(h)) || headers[1];

      const parsed = rows.map((row, index) => {
        const rawName = String(row[nameKey] || '').trim();
        const unit = unitKey ? String(row[unitKey] || '').trim() : '';
        const quantity = toNumber(row[qtyKey]);
        const candidates = standards
          .map(standard => ({ id: standard.id, code: standard.code, name: standard.name, score: fuzzyScore(rawName, standard.name) }))
          .filter(candidate => candidate.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const best = candidates[0];
        const matched = best && best.score >= 72 ? standards.find(s => s.id === best.id) : null;
        const priceMatch = matched ? matchPrices(matched.id) : { bid: null, cost: null };

        return {
          rowId: `${Date.now()}-${index}`,
          boq_item_name: rawName,
          boq_content: contentKey ? String(row[contentKey] || '').trim() : '',
          unit,
          quantity,
          standard_item_id: matched?.id || null,
          standard_code: matched?.code || '',
          standard_name: matched?.name || '',
          match_score: best?.score || 0,
          match_status: matched ? 'matched' : best ? 'review' : 'unmatched',
          candidates,
          historical_bid_price: Number(priceMatch.bid?.price || 0),
          cost_price: Number(priceMatch.cost?.price || 0),
          profit_rate: globalProfitRate,
          final_price: 0,
          is_manual_price: false,
          pricing_warning: '',
        } satisfies BoqItem;
      }).filter(item => item.boq_item_name && item.quantity > 0);

      setItems(parsed);
    };
    reader.readAsArrayBuffer(file);
  }

  function matchPrices(standardItemId: number) {
    return {
      bid: pickPrice(bidPrices, standardItemId),
      cost: pickPrice(costPrices, standardItemId),
    };
  }

  function pickPrice(records: PriceRecord[], standardItemId: number) {
    return records
      .filter(record => record.standard_item_id === standardItemId)
      .map(record => {
        let score = 0;
        if (record.region && region && record.region === region) score += 4;
        if (record.project_type && projectType && record.project_type === projectType) score += 3;
        if (Boolean(record.material_included) === materialIncluded) score += 2;
        const year = Number(record.bid_year || record.cost_year || new Date(record.created_at || '').getFullYear() || 0);
        return { record, score, year };
      })
      .sort((a, b) => b.score - a.score || b.year - a.year)[0]?.record || null;
  }

  function applyStandard(rowId: string, standardId: number) {
    const standard = standards.find(item => item.id === standardId);
    if (!standard) return;
    const priceMatch = matchPrices(standard.id);
    setItems(prev => prev.map(item => item.rowId === rowId ? {
      ...item,
      standard_item_id: standard.id,
      standard_code: standard.code,
      standard_name: standard.name,
      match_score: 100,
      match_status: 'matched',
      historical_bid_price: Number(priceMatch.bid?.price || 0),
      cost_price: Number(priceMatch.cost?.price || 0),
      is_manual_price: false,
    } : item));
  }

  function updateItem(rowId: string, updates: Partial<BoqItem>) {
    setItems(prev => prev.map(item => item.rowId === rowId ? { ...item, ...updates } : item));
  }

  function applyGlobalProfit() {
    setItems(prev => prev.map(item => ({ ...item, profit_rate: globalProfitRate, is_manual_price: false })));
  }

  function updateFee(index: number, updates: Partial<MgmtFee>) {
    setFees(prev => prev.map((fee, i) => {
      if (i !== index) return fee;
      const next = { ...fee, ...updates };
      next.amount = next.monthly_salary * next.headcount * next.months;
      return next;
    }));
  }

  function addFee() {
    setFees(prev => [...prev, { position: '', monthly_salary: 0, headcount: 1, months: durationMonths, amount: 0 }]);
  }

  function updateDurationMonths(value: number) {
    setDurationMonths(value);
    setFees(prev => prev.map(fee => ({ ...fee, months: value, amount: fee.monthly_salary * fee.headcount * value })));
  }

  async function saveBid({ saveVersion = false } = {}) {
    if (!name.trim()) return alert('请填写项目名称');
    if (!items.length) return alert('请先上传甲方清单');
    setSaving(true);
    try {
      let id = bidId;
      if (!id) {
        const res = await fetch('/api/bid-estimations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            region,
            project_type: projectType,
            duration_months: durationMonths,
            material_included: materialIncluded,
            material_scope_note: materialScopeNote,
            profit_rate: globalProfitRate,
            management_fee_rate: managementFeeRate,
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        id = json.data.id;
        setBidId(id);
      }

      const payloadItems = calculatedItems.map(item => ({
        boq_item_name: item.boq_item_name,
        original_item_name: item.boq_item_name,
        boq_content: item.boq_content,
        work_type: item.standard_name,
        standard_item_id: item.standard_item_id,
        standard_code: item.standard_code,
        unit: item.unit,
        quantity: item.quantity,
        standard_price: item.historical_bid_price,
        bid_price: item.final_price,
        standard_amount: item.historical_bid_price * item.quantity,
        bid_amount: item.final_amount,
        historical_bid_price: item.historical_bid_price,
        historical_bid_amount: item.historical_bid_price * item.quantity,
        cost_price: item.cost_price,
        cost_amount: item.cost_price * item.quantity,
        management_fee_rate: managementFeeRate,
        profit_rate: item.profit_rate,
        suggested_price: item.suggested_price,
        suggested_amount: item.suggested_amount,
        final_price: item.final_price,
        final_amount: item.final_amount,
        match_score: item.match_score,
        match_status: item.match_status,
        pricing_warning: item.pricing_warning,
        is_manual_price: item.is_manual_price,
        price_source: item.is_manual_price ? 'manual' : 'auto',
      }));

      const saveResponses = await Promise.all([
        fetch('/api/bid-estimations/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bidId: id, type: 'items', items: payloadItems }) }),
        fetch('/api/bid-estimations/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bidId: id, type: 'fees', items: fees.filter(fee => fee.position && fee.amount > 0) }) }),
        fetch('/api/bid-estimations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            region,
            project_type: projectType,
            duration_months: durationMonths,
            material_included: materialIncluded,
            material_scope_note: materialScopeNote,
            profit_rate: globalProfitRate,
            management_fee_rate: managementFeeRate,
            total_labor_cost: totalCost || costBaseAmount,
            management_fee: totalMgmt,
            total_amount: totalFinal,
            status: '测算中',
          }),
        }),
      ]);
      const saveResults = await Promise.all(saveResponses.map(response => response.json()));
      const failedSave = saveResults.find(result => !result.success);
      if (failedSave) throw new Error(failedSave.error || '保存测算数据失败');

      if (saveVersion) {
        const versionResponse = await fetch('/api/bid-estimations/versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bid_id: id,
            name: `测算版本 ${new Date().toLocaleString('zh-CN')}`,
            total_amount: totalFinal,
            summary: `清单 ${items.length} 项，风险 ${riskCount} 项，管理费率 ${managementFeeRate.toFixed(2)}%`,
            snapshot: { project: { name, region, projectType, durationMonths, materialIncluded, globalProfitRate, managementFeeRate }, items: calculatedItems, fees },
          }),
        });
        const versionResult = await versionResponse.json();
        if (!versionResult.success) throw new Error(versionResult.error || '保存测算版本失败');
      }

      router.push(`/cost-estimation/bid/${id}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function exportExcel() {
    const rows = calculatedItems.map(item => ({
      甲方清单名称: item.boq_item_name,
      标准编码: item.standard_code,
      标准清单: item.standard_name,
      单位: item.unit,
      工程量: item.quantity,
      最近中标单价: item.historical_bid_price,
      最近中标合价: item.historical_bid_price * item.quantity,
      内部成本单价: item.cost_price,
      内部成本合价: item.cost_price * item.quantity,
      管理费率: Number(managementFeeRate.toFixed(2)),
      利润率: item.profit_rate,
      建议报价单价: Number(item.suggested_price.toFixed(2)),
      最终报价单价: Number(item.final_price.toFixed(2)),
      最终报价合价: Number(item.final_amount.toFixed(2)),
      风险提示: item.pricing_warning,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '投标测算');
    XLSX.writeFile(workbook, `${name || '投标测算'}_测算表.xlsx`);
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/cost-estimation/bid" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E6EB] bg-white hover:bg-[#F7F8FA]">
              <ArrowLeft className="h-4 w-4 text-[#4E5969]" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#1D2129]">新建投标测算</h1>
              <p className="mt-1 text-sm text-[#86909C]">上传甲方清单后，系统自动匹配标准清单、历史中标价和内部成本价。</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} disabled={!items.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D9DCE3] bg-white px-4 text-sm text-[#1D2129] disabled:opacity-50">
              <Download className="h-4 w-4" />导出 Excel
            </button>
            <button onClick={() => saveBid({ saveVersion: true })} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm text-white disabled:opacity-60">
              <Save className="h-4 w-4" />保存版本
            </button>
          </div>
        </div>

        <section className="rounded-xl border border-[#E5E6EB] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <Field label="项目名称" value={name} onChange={setName} className="md:col-span-2" />
            <Field label="地区" value={region} onChange={setRegion} />
            <Field label="工程类型" value={projectType} onChange={setProjectType} />
            <Field label="施工月份" type="number" value={String(durationMonths)} onChange={v => updateDurationMonths(Number(v) || 0)} />
            <Field label="全局利润率(%)" type="number" value={String(globalProfitRate)} onChange={v => setGlobalProfitRate(Number(v) || 0)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-[#4E5969]">
              <input type="checkbox" checked={materialIncluded} onChange={e => setMaterialIncluded(e.target.checked)} />
              本次报价含材料
            </label>
            <input value={materialScopeNote} onChange={e => setMaterialScopeNote(e.target.value)} placeholder="材料范围备注，例如含钢化租赁、不含主材" className="h-9 min-w-[260px] flex-1 rounded-lg border border-[#D9DCE3] px-3 text-sm outline-none focus:border-[#165DFF]" />
            <button onClick={applyGlobalProfit} className="h-9 rounded-lg border border-[#D9DCE3] bg-white px-3 text-sm text-[#1D2129]">利润率应用到全部清单</button>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-5">
          <Kpi title="清单项" value={items.length} unit="项" />
          <Kpi title="匹配完成" value={matchedCount} unit="项" />
          <Kpi title="风险提示" value={riskCount} unit="项" danger={riskCount > 0} />
          <Kpi title="管理费率" value={Number(managementFeeRate.toFixed(2))} unit="%" />
          <Kpi title="最终报价" value={money(totalFinal)} unit="元" />
        </div>

        <section className="rounded-xl border border-[#E5E6EB] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div>
              <h2 className="font-semibold text-[#1D2129]">甲方清单与报价工作台</h2>
              <p className="mt-1 text-xs text-[#86909C]">建议报价 = 成本价或历史中标价 × (1 + 管理费率) × (1 + 利润率)。</p>
            </div>
            <div className="flex-1" />
            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
              <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索清单 / 标准编码" className="h-10 w-full rounded-lg border border-[#D9DCE3] pl-9 pr-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) parseBoq(e.target.files[0]); }} />
            <button onClick={() => fileRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D9DCE3] bg-white px-4 text-sm text-[#1D2129]">
              <Upload className="h-4 w-4" />上传清单
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-sm">
              <thead className="bg-[#F7F8FA] text-xs text-[#86909C]">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">甲方清单</th>
                  <th className="px-3 py-3 text-left font-medium">标准清单</th>
                  <th className="px-3 py-3 text-right font-medium">工程量</th>
                  <th className="px-3 py-3 text-right font-medium">历史中标价</th>
                  <th className="px-3 py-3 text-right font-medium">内部成本价</th>
                  <th className="px-3 py-3 text-right font-medium">利润率</th>
                  <th className="px-3 py-3 text-right font-medium">建议单价</th>
                  <th className="px-3 py-3 text-right font-medium">最终单价</th>
                  <th className="px-3 py-3 text-right font-medium">最终合价</th>
                  <th className="px-3 py-3 text-left font-medium">风险</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E6EB]">
                {visibleItems.map(item => (
                  <tr key={item.rowId} className={item.pricing_warning ? 'bg-[#FFFBF0]' : ''}>
                    <td className="px-3 py-3">
                      <div className="max-w-[260px] font-medium text-[#1D2129]">{item.boq_item_name}</div>
                      <div className="mt-1 text-xs text-[#86909C]">{item.unit || '-'} · 匹配度 {item.match_score}</div>
                    </td>
                    <td className="px-3 py-3">
                      <select value={item.standard_item_id || ''} onChange={e => applyStandard(item.rowId, Number(e.target.value))} className="h-9 w-[220px] rounded-lg border border-[#D9DCE3] px-2 text-sm outline-none focus:border-[#165DFF]">
                        <option value="">未匹配</option>
                        {standards.map(standard => <option key={standard.id} value={standard.id}>{standard.code} · {standard.name}</option>)}
                      </select>
                      {item.candidates.length > 0 && (
                        <div className="mt-1 text-xs text-[#86909C]">建议：{item.candidates[0].code} · {item.candidates[0].name}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(item.quantity)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.historical_bid_price ? money(item.historical_bid_price) : '-'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.cost_price ? money(item.cost_price) : '-'}</td>
                    <td className="px-3 py-3 text-right">
                      <input type="number" value={item.profit_rate} onChange={e => updateItem(item.rowId, { profit_rate: Number(e.target.value) || 0, is_manual_price: false })} className="h-9 w-20 rounded-lg border border-[#D9DCE3] px-2 text-right text-sm outline-none focus:border-[#165DFF]" />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#165DFF]">{item.suggested_price ? money(item.suggested_price) : '-'}</td>
                    <td className="px-3 py-3 text-right">
                      <input type="number" value={Number(item.final_price.toFixed(2)) || ''} onChange={e => updateItem(item.rowId, { final_price: Number(e.target.value) || 0, is_manual_price: true })} className="h-9 w-24 rounded-lg border border-[#D9DCE3] px-2 text-right text-sm outline-none focus:border-[#165DFF]" />
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{money(item.final_amount)}</td>
                    <td className="px-3 py-3 text-xs text-[#F59E0B]">{item.pricing_warning || '-'}</td>
                  </tr>
                ))}
                {visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-16 text-center text-[#86909C]">
                      <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-[#C9CDD4]" />
                      上传甲方清单后开始测算。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-[#1D2129]">管理费模板</h2>
              <button onClick={addFee} className="h-8 rounded-lg border border-[#D9DCE3] px-3 text-xs">新增岗位</button>
            </div>
            <div className="space-y-2">
              {fees.map((fee, index) => (
                <div key={index} className="grid grid-cols-5 gap-2">
                  <input value={fee.position} onChange={e => updateFee(index, { position: e.target.value })} placeholder="岗位" className="h-9 rounded-lg border border-[#D9DCE3] px-2 text-sm" />
                  <input type="number" value={fee.monthly_salary} onChange={e => updateFee(index, { monthly_salary: Number(e.target.value) || 0 })} placeholder="月工资" className="h-9 rounded-lg border border-[#D9DCE3] px-2 text-sm" />
                  <input type="number" value={fee.headcount} onChange={e => updateFee(index, { headcount: Number(e.target.value) || 0 })} placeholder="人数" className="h-9 rounded-lg border border-[#D9DCE3] px-2 text-sm" />
                  <input type="number" value={fee.months} onChange={e => updateFee(index, { months: Number(e.target.value) || 0 })} placeholder="月份" className="h-9 rounded-lg border border-[#D9DCE3] px-2 text-sm" />
                  <div className="flex h-9 items-center justify-end rounded-lg bg-[#F7F8FA] px-2 text-sm tabular-nums">{money(fee.amount)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
            <h2 className="mb-3 font-semibold text-[#1D2129]">测算汇总</h2>
            <Summary label="历史中标参考合计" value={totalHistory} />
            <Summary label="内部成本合计" value={totalCost} />
            <Summary label="管理费合计" value={totalMgmt} />
            <Summary label="管理费率" value={managementFeeRate} suffix="%" />
            <Summary label="建议报价合计" value={totalSuggested} />
            <div className="mt-3 border-t border-[#E5E6EB] pt-3">
              <Summary label="最终报价合计" value={totalFinal} strong />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function buildWarning(item: BoqItem, base: number) {
  if (!item.standard_item_id) return '未匹配标准清单';
  if (!item.cost_price && item.historical_bid_price) return '缺内部成本价，暂用历史中标价测算';
  if (!item.cost_price && !item.historical_bid_price) return '缺历史价和成本价，需手动报价';
  if (item.final_price > 0 && item.cost_price > 0 && item.final_price < item.cost_price) return '最终报价低于内部成本价';
  if (!base) return '缺可用基准价';
  return '';
}

function Field({ label, value, onChange, type = 'text', className = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-[#4E5969]">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-[#D9DCE3] px-3 text-sm outline-none focus:border-[#165DFF]" />
    </label>
  );
}

function Kpi({ title, value, unit, danger = false }: { title: string; value: string | number; unit: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
      <p className="text-xs text-[#86909C]">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${danger ? 'text-[#F59E0B]' : 'text-[#1D2129]'}`}>{value}<span className="ml-1 text-xs font-normal text-[#86909C]">{unit}</span></p>
    </div>
  );
}

function Summary({ label, value, suffix = '元', strong = false }: { label: string; value: number; suffix?: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${strong ? 'text-lg font-bold text-[#1D2129]' : 'text-[#4E5969]'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{suffix === '%' ? value.toFixed(2) : money(value)} {suffix}</span>
    </div>
  );
}
