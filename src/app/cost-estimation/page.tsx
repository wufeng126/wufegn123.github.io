'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Database, BarChart3, Search, X, Upload, TrendingUp, Download } from 'lucide-react';
import Link from 'next/link';

interface UnitPrice {
  id: number; work_type: string; unit: string; price: number; contract_type: string;
  quantity?: number; amount?: number; year?: number; notes?: string;
  project_id?: number; projects?: { name?: string };
}

interface PriceStat {
  work_type: string; unit: string; min_price: number; max_price: number;
  median_price: number; avg_price: number; samples: number;
  projects: string; years: string; category?: string; has_prices?: boolean; from_standard?: boolean;
}

interface Project { id: number; name: string; }

export default function CostEstimationPage() {
  const [tab, setTab] = useState<'prices' | 'stats'>('stats');
  const [prices, setPrices] = useState<UnitPrice[]>([]);
  const [stats, setStats] = useState<PriceStat[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ project_id: '', work_type: '', unit: '', price: '', contract_type: '包活', quantity: '', year: String(new Date().getFullYear()), notes: '' });
  const [saving, setSaving] = useState(false);
  const [selectedStat, setSelectedStat] = useState<PriceStat | null>(null);

  async function load() {
    try {
        const [pRes, sRes, projRes] = await Promise.all([
          fetch('/api/cost-estimation'),
          fetch('/api/cost-estimation/stats'),
          fetch('/api/projects'),
        ]);
        const pJ = await pRes.json(), sJ = await sRes.json(), projJ = await projRes.json();
      setPrices(Array.isArray(pJ.data) ? pJ.data : []);
      setStats(Array.isArray(sJ.data) ? sJ.data : []);
      setProjects(Array.isArray(projJ.projects) ? projJ.projects : []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.work_type || !form.price) return;
    setSaving(true);
    try {
      const res = await fetch('/api/cost-estimation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) { setShowForm(false); setForm({ project_id: '', work_type: '', unit: '', price: '', contract_type: '包活', quantity: '', year: String(new Date().getFullYear()), notes: '' }); load(); }
    } finally { setSaving(false); }
  }

  async function deletePrice(id: number) {
    if (!confirm('确认删除？')) return;
    await fetch(`/api/cost-estimation?id=${id}`, { method: 'DELETE' });
    load();
  }

  const filteredPrices = useMemo(() => {
    if (!search) return prices;
    const s = search.toLowerCase();
    return prices.filter(p => p.work_type.toLowerCase().includes(s) || p.notes?.toLowerCase().includes(s) || p.projects?.name?.toLowerCase().includes(s));
  }, [prices, search]);

  const projectMap = useMemo(() => {
    const m: Record<number, string> = {};
    projects.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  if (loading) return <div className="min-h-full bg-[#F5F6FA] p-6 flex items-center justify-center text-sm text-[#86909C]">加载中...</div>;

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129]">📊 成本测算</h1>
            <p className="text-sm text-[#86909C] mt-0.5">工序单价库 · 历史价格参考</p>
          </div>
          <button onClick={() => setShowForm(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm text-white shadow-md hover:bg-[#0E49D8]">
            <Plus className="h-4 w-4" />录入单价
          </button>
          <Link href="/cost-estimation/import" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#165DFF] bg-white px-4 text-sm text-[#165DFF] hover:bg-[#F0F5FF]">
            <Upload className="h-4 w-4" />批量导入
          </Link>
        </div>

        {/* 快捷入口 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
         <Link href="/cost-estimation/import" className="bg-white rounded-xl border border-[#E5E6EB] p-4 hover:border-[#165DFF]/30 transition text-center">
           <Upload className="h-5 w-5 text-[#165DFF] mx-auto mb-1.5" />
           <p className="text-xs font-medium text-[#1D2129]">批量导入</p>
           <p className="text-[10px] text-[#86909C] mt-0.5">Excel导入报价</p>
         </Link>
         <button onClick={async () => {
           const a = document.createElement('a');
           a.href = '/api/cost-estimation/export';
           a.download = '成本测算_价格参考库.xlsx';
           a.click();
         }} className="bg-white rounded-xl border border-[#E5E6EB] p-4 hover:border-[#165DFF]/30 transition text-center cursor-pointer">
           <Download className="h-5 w-5 text-[#00B42A] mx-auto mb-1.5" />
           <p className="text-xs font-medium text-[#1D2129]">导出参考价</p>
           <p className="text-[10px] text-[#86909C] mt-0.5">Excel导出</p>
         </button>
         <Link href="/cost-estimation/bid" className="bg-white rounded-xl border border-[#E5E6EB] p-4 hover:border-[#00A870]/30 transition text-center">
           <TrendingUp className="h-5 w-5 text-[#00A870] mx-auto mb-1.5" />
           <p className="text-xs font-medium text-[#1D2129]">投标测算</p>
           <p className="text-[10px] text-[#86909C] mt-0.5">引用单价→报价</p>
         </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#F2F3F5] rounded-xl p-1 mb-5">
          <button onClick={() => setTab('stats')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'stats' ? 'bg-white text-[#165DFF] shadow-sm' : 'text-[#4E5969]'}`}>
            <Database className="h-4 w-4 inline mr-1" />价格参考库
          </button>
          <button onClick={() => setTab('prices')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'prices' ? 'bg-white text-[#165DFF] shadow-sm' : 'text-[#4E5969]'}`}>
            <BarChart3 className="h-4 w-4 inline mr-1" />全部记录
          </button>

        </div>

        {/* 价格参考库 */}
        {tab === 'stats' && (
          <div className="space-y-3">
            {stats.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-[#E5E6EB] p-10 text-center">
                <Database className="h-10 w-10 text-[#C9CDD4] mx-auto mb-3" />
                <p className="text-sm text-[#86909C] mb-4">暂无单价数据，点击右上角"录入单价"开始积累</p>
              </div>
            )}
            {stats.map((s, i) => (
              <div key={i} className={`bg-white rounded-xl border overflow-hidden cursor-pointer transition ${s.has_prices === false ? 'border-dashed border-[#E5E6EB] opacity-60 hover:opacity-100' : 'border-[#E5E6EB] hover:border-[#165DFF]/30'}`} onClick={() => setSelectedStat(selectedStat?.work_type === s.work_type ? null : s)}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-[#1D2129]">{s.work_type}</h3>
                      <p className="text-xs text-[#86909C] mt-0.5">
                        {s.unit ? `${s.unit}` : ''}
                        {s.category ? ` · ${s.category}` : ''}
                        {s.from_standard && !s.has_prices ? ' · 暂无报价' : ''}
                        {s.years ? ` · ${s.years}` : ''}
                        {s.samples > 0 ? ` · ${s.samples}条记录` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      {s.has_prices ? (
                        <p className="text-lg font-bold text-[#165DFF]">{s.median_price}<span className="text-xs font-normal text-[#86909C]"> 中位价</span></p>
                      ) : (
                        <p className="text-xs text-[#C9CDD4]">待录入</p>
                      )}
                    </div>
                  </div>
                  {s.has_prices && s.min_price !== s.max_price && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs text-[#86909C]">最低 {s.min_price}</span>
                      <div className="flex-1 h-1.5 bg-[#E5E6EB] rounded-full overflow-hidden relative">
                        <div className="absolute h-full bg-gradient-to-r from-[#165DFF] to-[#7C3AED] rounded-full" style={{ width: `${Math.min(100, ((s.median_price - s.min_price) / (s.max_price - s.min_price || 1)) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-[#86909C]">最高 {s.max_price}</span>
                    </div>
                  )}
                  {s.has_prices && <p className="text-xs text-[#A9AEB8] mt-2">平均 {s.avg_price} · 参与项目: {s.projects}</p>}
                  {!s.from_standard && <p className="text-xs text-[#F59E0B] mt-2">⚠ 未归入标准工序</p>}
                </div>

                {/* 展开显示详细记录 */}
                {selectedStat?.work_type === s.work_type && (
                  <div className="border-t border-[#E5E6EB] bg-[#FAFBFC] px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-[#86909C]">相关记录</p>
                    {filteredPrices.filter(p => p.work_type === s.work_type).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm border-b border-[#F2F3F5] pb-2 last:border-0">
                        <div>
                          <span className="text-[#4E5969]">{projectMap[p.project_id || 0] || '未知项目'}</span>
                          <span className="text-[#A9AEB8] ml-2">{p.year}</span>
                          {p.notes && <span className="text-[#A9AEB8] ml-2">· {p.notes}</span>}
                        </div>
                        <span className="font-medium text-[#1D2129]">{p.price} 元{p.unit ? `/${p.unit}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 全部记录 */}
        {/* 全部记录 */}
        {tab === 'prices' && (
          <div>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索工序、项目、备注..."
                className="h-10 w-full rounded-xl border border-[#E5E6EB] bg-white pl-10 pr-4 text-sm outline-none focus:border-[#165DFF]" />
            </div>
            {filteredPrices.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-[#E5E6EB] p-10 text-center text-sm text-[#86909C]">暂无记录</div>
            ) : (
              <div className="space-y-2">
                {filteredPrices.map(p => (
                  <div key={p.id} className="bg-white rounded-xl border border-[#E5E6EB] p-4 flex items-center justify-between hover:border-[#165DFF]/20 transition group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1D2129]">{p.work_type}</p>
                      <p className="text-xs text-[#86909C] mt-0.5">
                        {projectMap[p.project_id || 0] || ''}
                        {p.unit ? ` · ${p.unit}` : ''}{p.year ? ` · ${p.year}` : ''}
                        {p.notes ? ` · ${p.notes}` : ''}
                        {p.contract_type ? ` · ${p.contract_type}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-[#1D2129]">{p.price}</span>
                      <span className="text-xs text-[#86909C]">元{p.unit ? `/${p.unit}` : ''}</span>
                      <button onClick={() => deletePrice(p.id)} className="text-[#C9CDD4] hover:text-[#F53F3F] opacity-0 group-hover:opacity-100 transition">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {/* 录入弹窗 */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E6EB]">
                <h2 className="font-semibold text-[#1D2129]">录入工序单价</h2>
                <button onClick={() => setShowForm(false)} className="text-[#86909C] hover:text-[#1D2129]"><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-[#86909C] mb-1">工序名称 *</label>
                    <input required value={form.work_type} onChange={e => setForm({ ...form, work_type: e.target.value })} placeholder="例：模板安装、钢筋制安"
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#86909C] mb-1">单价 *</label>
                    <input required type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00"
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#86909C] mb-1">单位</label>
                    <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="m²、m³、t"
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#86909C] mb-1">项目</label>
                    <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]">
                      <option value="">选择项目</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#86909C] mb-1">年份</label>
                    <input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#86909C] mb-1">合同类型</label>
                    <select value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]">
                      <option value="包活">包活</option>
                      <option value="点工">点工</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#86909C] mb-1">数量</label>
                    <input type="number" step="0.01" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-[#86909C] mb-1">备注</label>
                    <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="楼层、部位等"
                      className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
                  </div>
                </div>
                <div className="flex items-center gap-3 justify-end pt-2 border-t border-[#E5E6EB]">
                  <button type="button" onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg border text-sm text-[#4E5969]">取消</button>
                  <button type="submit" disabled={saving} className="h-9 px-4 rounded-lg bg-[#165DFF] text-sm text-white disabled:opacity-50">
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
