'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save, ChevronRight, ChevronLeft, Upload, Search, Sparkles, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface WorkType { name: string; unit: string; category?: string; }
interface BoqItem {
  boq_item_name: string; boq_content: string; unit: string; quantity: number;
  work_type: string; standard_price: number; bid_price: number;
  candidates: { name: string; score: number; }[];
}
interface MgmtFee { position: string; monthly_salary: number; headcount: number; months: number; amount: number; }

function normalize(s: string) { return s.replace(/[（(].*?[）)]/g, '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase(); }
function fuzzyScore(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  let common = 0; for (const ch of na) { if (nb.includes(ch)) common++; }
  return Math.round((common / Math.max(na.length, nb.length)) * 60);
}

export default function NewBidPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [bidId, setBidId] = useState<number | null>(null);

  // Step 1: Project info
  const [name, setName] = useState('');
  const [projectType, setProjectType] = useState('');
  const [durationMonths, setDurationMonths] = useState(6);
  const [profitRate, setProfitRate] = useState(5);

  // Step 2: BOQ upload & match
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [standards, setStandards] = useState<WorkType[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, number>>({});
  const [searchFilter, setSearchFilter] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 3: Management fees (keep same)
  const [fees, setFees] = useState<MgmtFee[]>([
    { position: '项目经理', monthly_salary: 15000, headcount: 1, months: 6, amount: 90000 },
    { position: '施工员', monthly_salary: 8000, headcount: 2, months: 6, amount: 96000 },
    { position: '安全员', monthly_salary: 7000, headcount: 1, months: 6, amount: 42000 },
  ]);

  useEffect(() => {
    Promise.all([
      fetch('/api/cost-estimation/work-types').then(r => r.json()),
      fetch('/api/cost-estimation/stats').then(r => r.json()),
    ]).then(([wJ, sJ]) => {
      if (wJ.success) setStandards(wJ.data || []);
      if (sJ.success) {
        const m: Record<string, number> = {};
        (sJ.data || []).forEach((s: any) => { if (s.median_price > 0) m[s.work_type] = s.median_price; });
        setStatsMap(m);
      }
    });
  }, []);

  // Parse BOQ Excel
  function parseBoq(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
      const headers = Object.keys(rows[0] || {});

      const nameKey = headers.find(h => /清单|名称|项目|分部分项|工程内容/i.test(h)) || headers[0];
      const contentKey = headers.find(h => /内容|描述|特征|说明/i.test(h)) || '';
      const unitKey = headers.find(h => /单位/i.test(h)) || '';
      const qtyKey = headers.find(h => /数量|工程量|工程数量|工程量/i.test(h)) || headers[1];

      const items: BoqItem[] = rows.map((row: any) => {
        const rawName = String(row[nameKey] || '').trim();
        const rawContent = contentKey ? String(row[contentKey] || '').trim() : '';
        const unit = unitKey ? String(row[unitKey] || '').trim() : '';
        const qty = parseFloat(String(row[qtyKey] || '0').replace(/[^0-9.-]/g, '')) || 0;

        const candidates = standards.map(w => ({ name: w.name, score: fuzzyScore(rawName, w.name) }))
          .filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
        const best = candidates[0];
        const matchedWorkType = best && best.score >= 40 ? best.name : '';
        const stdPrice = statsMap[matchedWorkType] || 0;

        return {
          boq_item_name: rawName, boq_content: rawContent, unit, quantity: qty,
          work_type: matchedWorkType, standard_price: stdPrice, bid_price: stdPrice || Math.round(qty > 0 ? 0 : 0),
          candidates,
        };
      }).filter(i => i.boq_item_name && i.quantity > 0);

      setBoqItems(items);
      setStep(2); // Jump to review step
    };
    reader.readAsArrayBuffer(file);
  }

  function matchItem(i: number, wt: string) {
    setBoqItems(prev => {
      const next = [...prev];
      const stdPrice = statsMap[wt] || 0;
      next[i] = { ...next[i], work_type: wt, standard_price: stdPrice, bid_price: stdPrice || next[i].bid_price };
      return next;
    });
  }

  function updateBidPrice(i: number, val: number) {
    setBoqItems(prev => { const next = [...prev]; next[i].bid_price = val; return next; });
  }

  function autoMatchAll() {
    setBoqItems(prev => prev.map(item => {
      if (item.work_type) return item;
      const best = item.candidates[0];
      if (best && best.score >= 40) {
        const stdPrice = statsMap[best.name] || 0;
        return { ...item, work_type: best.name, standard_price: stdPrice, bid_price: stdPrice || item.bid_price };
      }
      return item;
    }));
  }

  // Management fee helpers
  function updateFee(i: number, field: string, val: number) {
    setFees(prev => {
      const next = [...prev];
      (next[i] as any)[field] = val;
      next[i].amount = next[i].monthly_salary * next[i].headcount * next[i].months;
      return next;
    });
  }
  function addFee() { setFees(prev => [...prev, { position: '', monthly_salary: 8000, headcount: 1, months: durationMonths, amount: 0 }]); }
  function removeFee(i: number) { setFees(prev => prev.filter((_, idx) => idx !== i)); }

  // Calculations
  const matchedCount = useMemo(() => boqItems.filter(i => i.work_type).length, [boqItems]);
  const totalStdAmount = useMemo(() => boqItems.reduce((s, i) => s + i.standard_price * i.quantity, 0), [boqItems]);
  const totalBidAmount = useMemo(() => boqItems.reduce((s, i) => s + i.bid_price * i.quantity, 0), [boqItems]);
  const totalMgmt = useMemo(() => fees.reduce((s, f) => s + f.amount, 0), [fees]);
  const subtotal = totalBidAmount + totalMgmt;
  const profit = subtotal * (profitRate / 100);
  const totalAmount = subtotal + profit;

  const filteredItems = boqItems.filter(i => !searchFilter || i.boq_item_name.includes(searchFilter) || i.work_type.includes(searchFilter));

  async function saveBid() {
    setSaving(true);
    try {
      let id = bidId;
      if (!id) {
        const res = await fetch('/api/bid-estimations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, project_type: projectType, duration_months: durationMonths, profit_rate: profitRate }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        id = json.data.id;
        setBidId(id);
      }
      const items = boqItems.map(i => ({
        boq_item_name: i.boq_item_name, boq_content: i.boq_content,
        work_type: i.work_type, unit: i.unit, quantity: i.quantity,
        standard_price: i.standard_price, bid_price: i.bid_price,
        standard_amount: i.standard_price * i.quantity,
        bid_amount: i.bid_price * i.quantity,
        price_source: i.standard_price > 0 ? 'auto' : 'manual',
      }));
      await Promise.all([
        fetch('/api/bid-estimations/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bidId: id, type: 'items', items }) }),
        fetch('/api/bid-estimations/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bidId: id, type: 'fees', items: fees.filter(f => f.position && f.monthly_salary > 0) }) }),
        fetch('/api/bid-estimations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, total_labor_cost: totalBidAmount, management_fee: totalMgmt, total_amount: totalAmount, status: '测算中' }) }),
      ]);
      router.push(`/cost-estimation/bid/${id}`);
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/cost-estimation/bid" className="h-9 w-9 rounded-lg border border-[#E5E6EB] flex items-center justify-center hover:bg-[#F2F3F5]">
            <ArrowLeft className="h-4 w-4 text-[#4E5969]" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#1D2129]">新建投标</h1>
            <p className="text-xs text-[#86909C] mt-0.5">
              {step === 0 ? '项目信息' : step === 1 ? '上传甲方清单' : step === 2 ? '匹配工序与报价' : step === 3 ? '管理费用' : '利润与汇总'}
            </p>
          </div>
        </div>

        {/* Steps progress */}
        <div className="flex gap-1 mb-6">
          {['项目信息', '甲方清单', '工序匹配', '管理费', '汇总'].map((s, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition ${i <= step ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'}`} />
          ))}
        </div>

        {/* Step 1: 项目信息 */}
        {step === 0 && (
          <div className="bg-white rounded-xl border border-[#E5E6EB] p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1D2129] mb-1">项目名称</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="例：中交智慧港二期" className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#1D2129] mb-1">项目类型</label>
                <select value={projectType} onChange={e => setProjectType(e.target.value)} className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]">
                  <option value="">选择</option>
                  <option value="住宅">住宅</option>
                  <option value="公建">公建</option>
                  <option value="厂房">厂房</option>
                  <option value="学校">学校</option>
                  <option value="医院">医院</option>
                  <option value="商业">商业</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1D2129] mb-1">工期（月）</label>
                <input type="number" value={durationMonths} onChange={e => setDurationMonths(parseInt(e.target.value) || 0)} className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1D2129] mb-1">利润率 (%)</label>
                <input type="number" step="0.5" value={profitRate} onChange={e => setProfitRate(parseFloat(e.target.value) || 0)} className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: 上传甲方清单 */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-dashed border-[#E5E6EB] p-14 text-center">
            <FileSpreadsheet className="h-16 w-16 text-[#165DFF] mx-auto mb-4" />
            <p className="text-lg font-medium text-[#1D2129] mb-2">上传甲方工程量清单</p>
            <p className="text-sm text-[#86909C] mb-6">上传 Excel 清单后，系统自动匹配工序库参考价</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) parseBoq(e.target.files[0]); }} />
            <button onClick={() => fileRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#165DFF] px-6 text-sm text-white shadow-md hover:bg-[#0E49D8]">
              <Upload className="h-4 w-4" />选择Excel文件
            </button>
          </div>
        )}

        {/* Step 3: 匹配工序与报价 */}
        {step === 2 && (
          <div>
            <div className="bg-white rounded-xl border border-[#E5E6EB] p-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
                  <input value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="筛选..."
                    className="h-9 w-full rounded-lg border border-[#E5E6EB] pl-9 pr-3 text-sm outline-none focus:border-[#165DFF]" />
                </div>
                <span className="text-xs text-[#86909C]">{boqItems.length} 项 · {matchedCount} 已匹配</span>
                <button onClick={autoMatchAll} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#165DFF] px-3 text-xs text-[#165DFF] hover:bg-[#F0F5FF]">
                  <Sparkles className="h-3.5 w-3.5" />自动匹配
                </button>
                <span className="text-xs text-[#A9AEB8]">工序库合价: {totalStdAmount.toLocaleString()} 元</span>
              </div>
            </div>

            {/* 对比表格 */}
            <div className="bg-white rounded-xl border border-[#E5E6EB] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#FAFBFC] border-b border-[#E5E6EB]">
                    <th className="text-left px-3 py-3 text-[#86909C] font-medium w-8">#</th>
                    <th className="text-left px-3 py-3 text-[#86909C] font-medium">甲方清单项</th>
                    <th className="text-center px-2 py-3 text-[#165DFF] font-medium">工序库单价</th>
                    <th className="text-center px-2 py-3 text-[#1D2129] font-medium">本次报价</th>
                    <th className="text-center px-2 py-3 text-[#F59E0B] font-medium">差额</th>
                    <th className="text-right px-2 py-3 text-[#165DFF] font-medium">工序库合价</th>
                    <th className="text-right px-2 py-3 text-[#1D2129] font-medium">本次合价</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E6EB]">
                  {filteredItems.map((item, i) => (
                    <tr key={i} className="hover:bg-[#FAFBFC]">
                      <td className="px-3 py-3 text-[#A9AEB8] text-center">{i + 1}</td>
                      <td className="px-3 py-3 min-w-[160px]">
                        <p className="text-[#1D2129] font-medium">{item.boq_item_name}</p>
                        {item.boq_content && <p className="text-[10px] text-[#86909C] mt-0.5 truncate max-w-[200px]" title={item.boq_content}>{item.boq_content}</p>}
                        <p className="text-[10px] text-[#A9AEB8] mt-0.5">{item.unit} · {item.quantity}</p>
                        {/* 匹配选择器 */}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.candidates.slice(0, 3).map((c, ci) => (
                            <button key={ci} onClick={() => matchItem(i, c.name)}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition ${item.work_type === c.name ? 'bg-[#165DFF] text-white border-[#165DFF]' : 'border-[#E5E6EB] text-[#86909C] hover:border-[#165DFF]/40'}`}>
                              {c.name}
                            </button>
                          ))}
                          {!item.work_type && item.candidates.length === 0 && (
                            <span className="text-[10px] text-[#F53F3F]">未匹配</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className="text-[#165DFF] font-medium">{item.standard_price > 0 ? item.standard_price.toFixed(2) : '-'}</span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <input type="number" step="0.01" value={item.bid_price} onChange={e => updateBidPrice(i, parseFloat(e.target.value) || 0)}
                          className="w-20 h-8 rounded border border-[#E5E6EB] px-2 text-right text-xs text-center outline-none focus:border-[#165DFF]" />
                      </td>
                      <td className="px-2 py-3 text-center">
                        {item.standard_price > 0 && item.bid_price > 0 ? (() => {
                          const diff = item.bid_price - item.standard_price;
                          const pct = ((diff / item.standard_price) * 100);
                          return (
                            <span className={`text-xs font-medium ${diff < 0 ? 'text-[#F53F3F]' : diff > 0 ? 'text-[#00A870]' : 'text-[#86909C]'}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                              <br /><span className="text-[10px]">({diff > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                            </span>
                          );
                        })() : <span className="text-[#C9CDD4]">-</span>}
                      </td>
                      <td className="px-2 py-3 text-right text-[#165DFF]">{(item.standard_price * item.quantity).toLocaleString()}</td>
                      <td className="px-2 py-3 text-right font-medium text-[#1D2129]">{(item.bid_price * item.quantity).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {/* 合计行 */}
                <tfoot>
                  <tr className="bg-[#FAFBFC] border-t-2 border-[#E5E6EB] font-medium">
                    <td colSpan={4} className="px-3 py-3 text-right text-sm text-[#1D2129]">合计</td>
                    <td className="px-2 py-3 text-center text-xs text-[#F59E0B]">
                      {(() => {
                        const totalDiff = totalBidAmount - totalStdAmount;
                        const totalPct = totalStdAmount > 0 ? (totalDiff / totalStdAmount * 100) : 0;
                        return <span className={totalDiff < 0 ? 'text-[#F53F3F]' : 'text-[#00A870]'}>{totalDiff > 0 ? '+' : ''}{totalDiff.toLocaleString()} ({totalDiff > 0 ? '+' : ''}{totalPct.toFixed(1)}%)</span>;
                      })()}
                    </td>
                    <td className="px-2 py-3 text-right text-sm text-[#165DFF]">{totalStdAmount.toLocaleString()}</td>
                    <td className="px-2 py-3 text-right text-sm font-bold text-[#1D2129]">{totalBidAmount.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Step 4: 管理费用 */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-[#E5E6EB] p-4 flex items-center justify-between">
              <p className="text-sm text-[#4E5969]">项目管理团队配置</p>
              <button onClick={addFee} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#165DFF] px-3 text-xs text-[#165DFF] hover:bg-[#F0F5FF]">
                <Plus className="h-3.5 w-3.5" /> 添加岗位
              </button>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E6EB] overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#FAFBFC] text-[#86909C] text-xs">
                  <tr>
                    <th className="text-left px-4 py-3">岗位</th>
                    <th className="text-right px-3 py-3">月薪</th>
                    <th className="text-center px-3 py-3">人数</th>
                    <th className="text-center px-3 py-3">月数</th>
                    <th className="text-right px-3 py-3">小计</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E6EB]">
                  {fees.map((f, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><input value={f.position} onChange={e => { const n = [...fees]; n[i].position = e.target.value; setFees(n); }} className="w-28 h-8 rounded border border-[#E5E6EB] px-2 text-sm outline-none" placeholder="岗位名称" /></td>
                      <td className="px-3 py-3"><input type="number" value={f.monthly_salary} onChange={e => updateFee(i, 'monthly_salary', parseFloat(e.target.value) || 0)} className="w-24 h-8 rounded border border-[#E5E6EB] px-2 text-right text-sm outline-none" /></td>
                      <td className="px-3 py-3 text-center"><input type="number" value={f.headcount} onChange={e => updateFee(i, 'headcount', parseInt(e.target.value) || 1)} className="w-16 h-8 rounded border border-[#E5E6EB] px-2 text-center text-sm outline-none" /></td>
                      <td className="px-3 py-3 text-center text-[#86909C]">{f.months}</td>
                      <td className="px-3 py-3 text-right font-medium text-[#1D2129]">{f.amount.toLocaleString()}</td>
                      <td className="px-3 py-3"><button onClick={() => removeFee(i)} className="text-[#C9CDD4] hover:text-[#F53F3F]"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 5: 利润与汇总 */}
        {step === 4 && (
          <div className="bg-white rounded-xl border border-[#E5E6EB] p-6 space-y-4">
            <h3 className="font-semibold text-[#1D2129]">报价汇总</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[#E5E6EB]">
                <span className="text-sm text-[#4E5969]">人工费合计（{boqItems.length} 项，{matchedCount} 项已匹配）</span>
                <span className="text-base font-semibold text-[#1D2129]">{totalBidAmount.toLocaleString()} 元</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E5E6EB]">
                <span className="text-sm text-[#4E5969]">按工序库参考价计算</span>
                <span className="text-sm text-[#165DFF]">{totalStdAmount.toLocaleString()} 元</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E5E6EB]">
                <span className="text-sm text-[#4E5969]">管理费合计（{fees.filter(f => f.position).length} 个岗位）</span>
                <span className="text-base font-semibold text-[#1D2129]">{totalMgmt.toLocaleString()} 元</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E5E6EB]">
                <span className="text-sm text-[#4E5969]">小计（人工+管理）</span>
                <span className="text-base font-semibold text-[#1D2129]">{subtotal.toLocaleString()} 元</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E5E6EB]">
                <span className="text-sm text-[#4E5969]">利润（{profitRate}%）</span>
                <span className="text-base font-semibold text-[#00A870]">+{profit.toLocaleString()} 元</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-base font-bold text-[#1D2129]">投标总价</span>
                <span className="text-2xl font-bold text-[#165DFF]">{totalAmount.toLocaleString()} 元</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E5E6EB] px-4 text-sm text-[#4E5969] disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />上一步
          </button>

          {step === 0 && (
            <button onClick={() => setStep(1)} disabled={!name}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#165DFF] px-5 text-sm text-white disabled:opacity-40">
              上传清单<ChevronRight className="h-4 w-4" />
            </button>
          )}
          {step === 1 && (
            <div className="flex gap-2">
              {boqItems.length > 0 && (
                <button onClick={() => setStep(2)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#165DFF] px-5 text-sm text-white">
                  下一步（{boqItems.length} 项）<ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {step === 2 && (
            <button onClick={() => setStep(3)} disabled={matchedCount === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#165DFF] px-5 text-sm text-white disabled:opacity-40">
              下一步（管理费）<ChevronRight className="h-4 w-4" />
            </button>
          )}
          {step === 3 && (
            <button onClick={() => setStep(4)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#165DFF] px-5 text-sm text-white">
              下一步（汇总）<ChevronRight className="h-4 w-4" />
            </button>
          )}
          {step === 4 && (
            <button onClick={saveBid} disabled={saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#00A870] px-5 text-sm text-white">
              {saving ? '保存中...' : <><Save className="h-4 w-4" />保存投标</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
