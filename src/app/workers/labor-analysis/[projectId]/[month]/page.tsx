'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';

type Item = {
  key: string;
  category: string;
  work_content: string;
  worker_type: string;
  hours: string;
  hourly_rate: string;
  amount: string;
  remark: string;
};
type Analysis = {
  id: number;
  status: string;
  total_hours?: number | null;
  total_amount?: number | null;
  submitted_by_name?: string | null;
  submitted_at?: string | null;
  confirmed_by_name?: string | null;
  confirmed_at?: string | null;
  remark?: string | null;
};

const DEFAULT_CATEGORIES = ['文明施工', '安全防护', '装卸车', '清理搬运', '材料倒运', '甲方用工', '砼工帮工', '钢筋帮工', '外架帮工', '返工修补', '临时设施', '其他'];

function newRow(category = '文明施工'): Item {
  return {
    key: Math.random().toString(36).slice(2),
    category,
    work_content: '',
    worker_type: '普工',
    hours: '',
    hourly_rate: '',
    amount: '',
    remark: '',
  };
}
const num = (value: string) => {
  const n = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function LaborAnalysisDetailPage() {
  const params = useParams<{ projectId: string; month: string }>();
  const projectId = params?.projectId || '';
  const month = params?.month || '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const copyFrom = searchParams?.get('copyFrom') || '';

  const [items, setItems] = useState<Item[]>([newRow()]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [reconciliation, setReconciliation] = useState<{ salaryHours: number; salaryGross: number; managementGross?: number } | null>(null);
  const [byCategory, setByCategory] = useState<Array<{ category: string; hours: number; amount: number }>>([]);
  const [remark, setRemark] = useState('');
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!projectId || !month) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/labor-analysis?project_id=${projectId}&month=${month}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '读取失败');
      const data = json.data;
      setCategories(data.categories || DEFAULT_CATEGORIES);
      setReconciliation(data.reconciliation);
      setByCategory(data.byCategory || []);
      setAnalysis(data.analysis || null);
      if (data.analysis) {
        setRemark(data.analysis.remark || '');
        const rows = (data.items || []).map((item: Record<string, unknown>) => ({
          key: Math.random().toString(36).slice(2),
          category: String(item.category || '其他'),
          work_content: String(item.work_content || ''),
          worker_type: String(item.worker_type || '普工'),
          hours: item.hours != null ? String(item.hours) : '',
          hourly_rate: item.hourly_rate != null ? String(item.hourly_rate) : '',
          amount: item.amount != null ? String(item.amount) : '',
          remark: String(item.remark || ''),
        }));
        setItems(rows.length > 0 ? rows : [newRow()]);
      } else if (copyFrom && /^\d{4}-\d{2}$/.test(copyFrom)) {
        // 复制上月：只带分类与事项，工时/金额清零
        const copyRes = await fetch(`/api/labor-analysis?project_id=${projectId}&month=${copyFrom}`, { credentials: 'include', cache: 'no-store' });
        const copyJson = await copyRes.json();
        const copied = ((copyJson.data?.items || []) as Array<Record<string, unknown>>).map((item) => ({
          key: Math.random().toString(36).slice(2),
          category: String(item.category || '其他'),
          work_content: String(item.work_content || ''),
          worker_type: String(item.worker_type || '普工'),
          hours: '',
          hourly_rate: item.hourly_rate != null ? String(item.hourly_rate) : '',
          amount: '',
          remark: '',
        }));
        setItems(copied.length > 0 ? copied : [newRow()]);
        setRemark('');
        setNotice(`已带入 ${copyFrom} 的分类行，请填写本月工时`);
      } else {
        setItems([newRow()]);
        setRemark('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, month, copyFrom]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json.data) ? json.data : [];
        const found = (list as Array<{ id: number; name: string }>).find((p) => String(p.id) === String(projectId));
        setProjectName(found?.name || `项目#${projectId}`);
      } catch {
        setProjectName(`项目#${projectId}`);
      }
    })();
  }, [projectId]);

  const totals = useMemo(() => {
    const hours = items.reduce((sum, item) => sum + num(item.hours), 0);
    const amount = items.reduce((sum, item) => {
      const explicit = num(item.amount);
      return sum + (explicit > 0 ? explicit : num(item.hours) * num(item.hourly_rate));
    }, 0);
    return { hours, amount };
  }, [items]);

  const updateItem = (key: string, patch: Partial<Item>) => {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const save = async (status: 'draft' | 'submitted') => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/labor-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_id: Number(projectId),
          year_month: month,
          status,
          remark,
          items: items.map(({ key: _key, ...rest }) => rest),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '保存失败');
      setNotice(status === 'submitted' ? '已提交' : '已保存草稿');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const statusText = (status?: string) => status === 'confirmed' ? '已确认' : status === 'submitted' ? '已提交待确认' : '草稿';

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/workers/labor-analysis/${projectId}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline">
              <ArrowLeft className="h-4 w-4" /> 返回用工分析列表
            </Link>
            <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">{projectName} · {month} 用工分析</h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              仅用于成本分析与查账，<b>金额不计入项目成本</b>（成本以工资表/结算单为准）。
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-3)]">填报月份</span>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  const next = event.target.value;
                  if (/^\d{4}-\d{2}$/.test(next)) router.push(`/workers/labor-analysis/${projectId}/${next}`);
                }}
                className="h-8 rounded-lg border border-[var(--border)] px-2 text-sm"
              />
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-3)]">
              状态：{statusText(analysis?.status)}
              {analysis?.submitted_by_name ? ` · 提交人 ${analysis.submitted_by_name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setItems((rows) => [...rows, newRow()])} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
              <Plus className="h-4 w-4" /> 加一行
            </button>
            <button type="button" onClick={() => void save('draft')} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存草稿
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
              打印
            </button>
            <button type="button" onClick={() => void save('submitted')} disabled={saving} className="inline-flex h-9 items-center rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white disabled:opacity-60">
              提交
            </button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{notice}</div> : null}

        {reconciliation ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${Math.abs((reconciliation.salaryHours || 0) - totals.hours) > 0.5 ? 'border-[#FFE7BA] bg-[#FFFBE6] text-[#874D00]' : 'border-[#B7EB8F] bg-[#F6FFED] text-[#237804]'}`}>
            对账：生产工人工时 <b>{reconciliation.salaryHours}</b> 小时 · 填报合计 <b>{totals.hours}</b> 小时
            {Math.abs((reconciliation.salaryHours || 0) - totals.hours) > 0.5
              ? ` · 差异 ${Math.round((totals.hours - (reconciliation.salaryHours || 0)) * 100) / 100} 小时（请核对）`
              : ' · 一致 ✓'}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: '填报总工时', value: totals.hours },
            { label: '填报总金额', value: totals.amount },
            { label: '生产工人总工时', value: reconciliation?.salaryHours ?? 0 },
            { label: '生产工人应发', value: reconciliation?.salaryGross ?? 0 },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-[var(--border)] bg-white p-3">
              <p className="text-xs text-[var(--color-text-3)]">{card.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{card.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</p>
            </div>
          ))}
        </div>

        {reconciliation && (reconciliation.managementGross || 0) > 0 ? (
          <div className="rounded-xl border border-[#FFE7BA] bg-[#FFFBE6] px-4 py-3 text-sm text-[#874D00]">
            本月另有管理人员工资 <b>¥{(reconciliation.managementGross || 0).toLocaleString('zh-CN')}</b>（不计入下方点工工时统计，单列管理成本）
          </div>
        ) : null}

        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">按工作内容统计</p>
            <span className="text-xs text-[var(--color-text-3)]">合计 {totals.hours.toLocaleString('zh-CN')} 小时 / ¥{totals.amount.toLocaleString('zh-CN')}</span>
          </div>
          {byCategory.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-3)]">暂无数据，请在下方明细中填写</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {byCategory.map((row) => {
                const ratio = totals.hours > 0 ? (row.hours / totals.hours) * 100 : 0;
                return (
                  <div key={row.category} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{row.category}</span>
                      <span className="text-xs text-[var(--color-text-3)]">{ratio.toFixed(1)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                      <div className="h-full bg-[var(--color-primary)]" style={{ width: `${ratio}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-[var(--color-text-2)]">
                      <span>{row.hours.toLocaleString('zh-CN')} 小时</span>
                      <span>¥{row.amount.toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-semibold">用工明细（点工按工作内容）</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">工作内容分类</th>
                  <th className="px-2 py-2 text-left font-medium">具体事项</th>
                  <th className="px-2 py-2 text-left font-medium">工种</th>
                  <th className="px-2 py-2 text-right font-medium">工时</th>
                  <th className="px-2 py-2 text-right font-medium">单价</th>
                  <th className="px-2 py-2 text-right font-medium">金额</th>
                  <th className="px-2 py-2 text-left font-medium">备注</th>
                  <th className="px-2 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-text-3)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中…</td></tr>
                ) : items.map((item) => (
                  <tr key={item.key} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1.5">
                      <select value={item.category} onChange={(e) => updateItem(item.key, { category: e.target.value })} className="h-8 w-32 rounded border border-[var(--border)] px-1 text-xs">
                        {(categories.includes(item.category) ? categories : [item.category, ...categories]).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={item.work_content} onChange={(e) => updateItem(item.key, { work_content: e.target.value })} placeholder="如：清理楼层垃圾" className="h-8 w-44 rounded border border-[var(--border)] px-2 text-xs" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={item.worker_type} onChange={(e) => updateItem(item.key, { worker_type: e.target.value })} className="h-8 w-20 rounded border border-[var(--border)] px-1 text-xs">
                        <option value="普工">普工</option>
                        <option value="技工">技工</option>
                        <option value="其他">其他</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input value={item.hours} onChange={(e) => updateItem(item.key, { hours: e.target.value })} inputMode="decimal" className="h-8 w-20 rounded border border-[var(--border)] px-2 text-right text-xs" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input value={item.hourly_rate} onChange={(e) => updateItem(item.key, { hourly_rate: e.target.value })} inputMode="decimal" className="h-8 w-20 rounded border border-[var(--border)] px-2 text-right text-xs" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        value={item.amount}
                        onChange={(e) => updateItem(item.key, { amount: e.target.value })}
                        placeholder={String(Number((num(item.hours) * num(item.hourly_rate)).toFixed(2)))}
                        className="h-8 w-24 rounded border border-[var(--border)] px-2 text-right text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={item.remark} onChange={(e) => updateItem(item.key, { remark: e.target.value })} className="h-8 w-28 rounded border border-[var(--border)] px-2 text-xs" />
                    </td>
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => setItems((rows) => rows.filter((row) => row.key !== item.key))} className="text-[#CB2634]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm font-semibold">备注</p>
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm" placeholder="本月用工情况说明（选填）" />
        </div>
      </div>
    </div>
  );
}
