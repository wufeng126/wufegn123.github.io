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

interface StandardInsight {
  bidCount: number;
  costCount: number;
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
  const [tab, setTab] = useState<Tab>('standard');
  const [standards, setStandards] = useState<StandardItem[]>([]);
  const [bidPrices, setBidPrices] = useState<PriceRow[]>([]);
  const [costPrices, setCostPrices] = useState<PriceRow[]>([]);
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
        }
      });
  }, []);

  const activeRows = tab === 'bidPrice' ? bidPrices : costPrices;
  const priceTypeLabel = tab === 'bidPrice' ? '历史中标单价' : '内部结算单价';

  const standardInsights = useMemo(() => {
    const map: Record<number, StandardInsight> = {};
    standards.forEach(item => {
      map[item.id] = { bidCount: 0, costCount: 0, latestBidPrice: 0 };
    });
    bidPrices.forEach(row => {
      const current = map[row.standard_item_id] || { bidCount: 0, costCount: 0, latestBidPrice: 0 };
      current.bidCount += 1;
      const rowYear = Number(row.bid_year || 0);
      if (!current.latestBidYear || rowYear >= current.latestBidYear) {
        current.latestBidPrice = Number(row.price || 0);
        current.latestBidYear = row.bid_year;
      }
      map[row.standard_item_id] = current;
    });
    costPrices.forEach(row => {
      const current = map[row.standard_item_id] || { bidCount: 0, costCount: 0, latestBidPrice: 0 };
      current.costCount += 1;
      map[row.standard_item_id] = current;
    });
    return map;
  }, [standards, bidPrices, costPrices]);

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

  function findStandard(row: Record<string, unknown>) {
    const code = String(row['标准编码'] || row['编码'] || '').trim();
    if (code) {
      const exactCode = standards.find(item => normalize(item.code) === normalize(code));
      if (exactCode) return exactCode;
    }

    const name = String(row['标准清单名称'] || row['标准清单'] || row['清单名称'] || row['原始清单名称'] || '').trim();
    if (!name) return null;
    const scored = standards
      .map(item => ({ item, score: Math.max(fuzzyScore(name, item.name), fuzzyScore(name, item.code)) }))
      .sort((a, b) => b.score - a.score)[0];
    return scored && scored.score >= 72 ? scored.item : null;
  }

  function importPriceFile(file: File) {
    if (tab === 'standard') return;
    const reader = new FileReader();
    reader.onload = async event => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const type = tab === 'bidPrice' ? 'bidPrice' : 'costPrice';
      const unmatched: string[] = [];
      const payloads = rows.map(row => {
        const standard = findStandard(row);
        const price = toNumber(row['单价'] || row['中标单价'] || row['结算单价'] || row['人工成本价'] || row['成本价']);
        if (!standard || !price) {
          unmatched.push(String(row['标准清单名称'] || row['清单名称'] || row['原始清单名称'] || row['标准编码'] || '空白行'));
          return null;
        }
        const year = toNumber(row['年份'] || row['中标年份'] || row['结算年份'] || new Date().getFullYear());
        return {
          type,
          standard_item_id: standard.id,
          project_name: String(row['来源项目'] || row['项目名称'] || '').trim(),
          region: String(row['地区'] || '').trim(),
          project_type: String(row['工程类型'] || '').trim(),
          item_original_name: String(row['原始清单名称'] || row['清单名称'] || '').trim(),
          unit: String(row['单位'] || standard.unit || '').trim(),
          price,
          material_included: boolFromCell(row['是否含材料'] || row['含材料']),
          remark: String(row['备注'] || '').trim(),
          bid_year: year,
          cost_year: year,
        };
      }).filter(Boolean);

      if (!payloads.length) {
        alert('未识别到可导入的数据，请检查标准编码、标准清单名称和单价列');
        return;
      }

      setSaving(true);
      try {
        const results = await Promise.all(payloads.map(payload => fetch('/api/bid-estimations/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(res => res.json())));
        const failed = results.filter(result => !result.success);
        if (failed.length) throw new Error(failed[0].error || '部分数据导入失败');
        await load();
        const skipped = unmatched.length ? `，跳过 ${unmatched.length} 行未匹配数据：${unmatched.slice(0, 5).join('、')}` : '';
        alert(`已导入 ${payloads.length} 条${priceTypeLabel}${skipped}`);
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : '批量导入失败');
      } finally {
        setSaving(false);
        if (importRef.current) importRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
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

              <StandardTable standards={standards} insights={standardInsights} />
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
            <th className="px-3 py-3 text-right font-medium">最近中标价</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E6EB]">
          {standards.map(item => {
            const insight = insights[item.id] || { bidCount: 0, costCount: 0, latestBidPrice: 0 };
            return (
              <tr key={item.id}>
                <td className="px-3 py-3 font-medium text-[#165DFF]">{item.code}</td>
                <td className="px-3 py-3 text-[#1D2129]">{item.name}</td>
                <td className="px-3 py-3 text-[#4E5969]">{item.unit || '-'}</td>
                <td className="px-3 py-3 text-[#4E5969]">{item.category || '-'}</td>
                <td className="px-3 py-3 text-[#4E5969]">{item.material_included ? '含材料' : '不含材料'}</td>
                <td className="px-3 py-3 text-right text-[#4E5969]">{insight.bidCount}</td>
                <td className="px-3 py-3 text-right text-[#4E5969]">{insight.costCount}</td>
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
