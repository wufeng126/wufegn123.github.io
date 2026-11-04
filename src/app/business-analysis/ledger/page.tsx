'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BookOpen, CheckCircle2, Download, FileText, Loader2, Search, TrendingUp } from 'lucide-react';

type Project = { id: number; name: string };
type Voucher = { project_id: number; doc_type: string };
type Labor = { project_id: number; total_hours?: number | null; status: string };

function monthOf(offset = 0) {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  now.setUTCMonth(now.getUTCMonth() + offset);
  return now.toISOString().slice(0, 7);
}

async function fetchMonthData(month: string) {
  const [voucherRes, laborRes] = await Promise.all([
    fetch(`/api/vouchers?month=${month}`, { credentials: 'include', cache: 'no-store' }),
    fetch(`/api/labor-analysis?filter_month=${month}`, { credentials: 'include', cache: 'no-store' }),
  ]);
  const voucherJson = await voucherRes.json();
  const laborJson = await laborRes.json();
  return {
    vouchers: (voucherJson.data?.vouchers || []) as Voucher[],
    labor: (laborJson.data?.list || []) as Labor[],
  };
}

type Row = {
  project: Project;
  hasSettlement: boolean;
  hasAttendance: boolean;
  laborHours: number | null;
  laborStatus: string;
  done: number;
  missing: string[];
};

export default function LedgerOverviewPage() {
  const [month, setMonth] = useState(monthOf());
  const [projects, setProjects] = useState<Project[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [labor, setLabor] = useState<Labor[]>([]);
  const [prevStat, setPrevStat] = useState<{ voucherReady: number; laborFilled: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const projRes = await fetch('/api/projects', { credentials: 'include', cache: 'no-store' });
      const projJson = await projRes.json();
      const list = Array.isArray(projJson.projects) ? projJson.projects : Array.isArray(projJson.data) ? projJson.data : [];
      const mapped = (list as Project[]).map((p) => ({ id: Number(p.id), name: String(p.name || '') }));
      setProjects(mapped);

      const [current, previous] = await Promise.all([fetchMonthData(month), fetchMonthData(monthOf(-1))]);
      setVouchers(current.vouchers);
      setLabor(current.labor);

      const prevReady = mapped.filter((project) => {
        const rows = previous.vouchers.filter((v) => Number(v.project_id) === project.id);
        return rows.some((v) => v.doc_type === 'settlement') && rows.some((v) => v.doc_type === 'attendance');
      }).length;
      setPrevStat({
        voucherReady: prevReady,
        laborFilled: mapped.filter((project) => previous.labor.some((l) => Number(l.project_id) === project.id)).length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo<Row[]>(() => {
    return projects.map((project) => {
      const voucherRows = vouchers.filter((v) => Number(v.project_id) === project.id);
      const hasSettlement = voucherRows.some((v) => v.doc_type === 'settlement');
      const hasAttendance = voucherRows.some((v) => v.doc_type === 'attendance');
      const laborRow = labor.find((l) => Number(l.project_id) === project.id);
      const missing: string[] = [];
      if (!hasSettlement) missing.push('结算单');
      if (!hasAttendance) missing.push('考勤表');
      if (!laborRow) missing.push('用工分析');
      return {
        project,
        hasSettlement,
        hasAttendance,
        laborHours: laborRow ? Number(laborRow.total_hours || 0) : null,
        laborStatus: laborRow?.status || '',
        done: 3 - missing.length,
        missing,
      };
    });
  }, [projects, vouchers, labor]);

  const filtered = useMemo(() => {
    const key = keyword.trim();
    return rows
      .filter((row) => (onlyMissing ? row.missing.length > 0 : true))
      .filter((row) => (key ? row.project.name.includes(key) : true))
      .sort((a, b) => a.done - b.done || a.project.name.localeCompare(b.project.name, 'zh-CN'));
  }, [rows, keyword, onlyMissing]);

  const summary = useMemo(() => {
    const total = rows.length;
    const ready = rows.filter((r) => r.missing.length === 0).length;
    const voucherReady = rows.filter((r) => r.hasSettlement && r.hasAttendance).length;
    const laborFilled = rows.filter((r) => r.laborHours !== null).length;
    return { total, ready, voucherReady, laborFilled, missingCount: total - ready };
  }, [rows]);

  const pendingList = useMemo(() => rows.filter((r) => r.missing.length > 0), [rows]);

  const delta = (current: number, previous?: number) => {
    if (previous === undefined) return null;
    const diff = current - previous;
    if (diff === 0) return { text: '与上月持平', tone: 'text-muted-foreground' };
    return diff > 0
      ? { text: `比上月多 ${diff}`, tone: 'text-[var(--color-success)]' }
      : { text: `比上月少 ${Math.abs(diff)}`, tone: 'text-[var(--color-danger)]' };
  };

  const exportCsv = () => {
    const headers = ['项目', '结算单', '考勤表', '用工分析工时', '用工分析状态', '缺项'];
    const lines = rows.map((row) => [
      row.project.name,
      row.hasSettlement ? '已上传' : '未上传',
      row.hasAttendance ? '已上传' : '未上传',
      row.laborHours === null ? '' : String(row.laborHours),
      row.laborHours === null ? '未填报' : row.laborStatus === 'submitted' ? '已提交' : row.laborStatus === 'confirmed' ? '已确认' : '草稿',
      row.missing.join('、') || '齐全',
    ]);
    const csv = [headers, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `经营台账_${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: '应报项目', value: summary.total, delta: null as null | { text: string; tone: string } },
    { label: '资料齐全', value: summary.ready, tone: 'text-[var(--color-success)]', delta: delta(summary.voucherReady, prevStat?.voucherReady) },
    { label: '凭证齐全（结算+考勤）', value: summary.voucherReady, tone: 'text-[var(--color-primary)]', delta: null },
    { label: '已填用工分析', value: summary.laborFilled, tone: 'text-[#B35B00]', delta: delta(summary.laborFilled, prevStat?.laborFilled) },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <BookOpen className="h-5 w-5 text-[var(--color-primary)]" /> 经营台账总览
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按月核对各项目资料齐全度：月度经营月报、月度用工分析、月度凭证（查账）。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm" />
            <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 刷新
            </button>
            <button type="button" onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white">
              <Download className="h-4 w-4" /> 导出台账
            </button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-3)]">{card.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${card.tone || 'text-[var(--foreground)]'}`}>{card.value}</p>
              {card.delta ? <p className={`mt-1 text-xs ${card.delta.tone}`}>{card.delta.text}</p> : <p className="mt-1 text-xs text-transparent">-</p>}
            </div>
          ))}
        </div>

        {summary.missingCount > 0 ? (
          <div className="rounded-xl border border-[#FFE7BA] bg-[#FFFBE6] px-4 py-3 text-sm text-[#874D00]">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" /> 本月还有 {summary.missingCount} 个项目资料不齐
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingList.slice(0, 8).map((row) => (
                <Link
                  key={row.project.id}
                  href={`/workers/labor-analysis/${row.project.id}/${month}`}
                  className="rounded border border-[#FFE7BA] bg-white px-2 py-1 text-xs text-[#874D00] hover:border-[#FF7D00]"
                >
                  {row.project.name} · 缺{row.missing.join('、')}
                </Link>
              ))}
              {pendingList.length > 8 ? <span className="self-center text-xs">等 {pendingList.length} 个项目</span> : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/reports/monthly" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
            <FileText className="h-4 w-4" /> 月度经营月报
          </Link>
          <Link href="/workers/labor-analysis" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
            <TrendingUp className="h-4 w-4" /> 月度用工分析
          </Link>
          <Link href="/workers/vouchers" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
            <FileText className="h-4 w-4" /> 月度凭证（查账）
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] px-2 sm:max-w-xs">
              <Search className="h-4 w-4 text-[var(--color-text-3)]" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索项目名称"
                className="h-full w-full bg-transparent text-sm outline-none"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-2)]">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              只看缺资料
            </label>
            <span className="ml-auto text-xs text-[var(--color-text-3)]">共 {filtered.length} 个项目</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">项目</th>
                  <th className="px-3 py-2 text-left font-medium">资料完成度</th>
                  <th className="px-3 py-2 text-left font-medium">结算单</th>
                  <th className="px-3 py-2 text-left font-medium">考勤表</th>
                  <th className="px-3 py-2 text-left font-medium">用工分析</th>
                  <th className="px-3 py-2 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]">没有符合条件的项目</td></tr>
                ) : filtered.map((row) => {
                  const color = row.done === 3 ? 'bg-[var(--color-success)]' : row.done === 0 ? 'bg-[var(--color-danger)]' : 'bg-[#FF7D00]';
                  return (
                    <tr key={row.project.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-medium">{row.project.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-muted)]">
                            <div className={`h-full ${color}`} style={{ width: `${(row.done / 3) * 100}%` }} />
                          </div>
                          <span className="text-xs text-[var(--color-text-3)]">{row.done}/3</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {row.hasSettlement ? <span className="rounded bg-[#E8FFEA] px-2 py-0.5 text-xs text-[#00A870]">已上传</span> : <span className="rounded bg-[#FFF1F0] px-2 py-0.5 text-xs text-[#CB2634]">未上传</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.hasAttendance ? <span className="rounded bg-[#E8FFEA] px-2 py-0.5 text-xs text-[#00A870]">已上传</span> : <span className="rounded bg-[#FFF1F0] px-2 py-0.5 text-xs text-[#CB2634]">未上传</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.laborHours === null ? (
                          <span className="rounded bg-[#FFF7E8] px-2 py-0.5 text-xs text-[#B35B00]">未填报</span>
                        ) : (
                          <span className="text-xs">
                            {row.laborHours} 小时
                            <span className="ml-1 text-[var(--color-text-3)]">
                              {row.laborStatus === 'submitted' ? '已提交' : row.laborStatus === 'confirmed' ? '已确认' : '草稿'}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Link className="text-[var(--color-primary)] hover:underline" href={`/workers/labor-analysis/${row.project.id}/${month}`}>用工分析</Link>
                          <Link className="text-[var(--color-primary)] hover:underline" href="/workers/vouchers">凭证</Link>
                          <Link className="text-[var(--color-primary)] hover:underline" href={`/reports/monthly?projectId=${row.project.id}`}>月报</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {summary.missingCount === 0 && !loading ? (
            <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--color-success)]">
              <CheckCircle2 className="h-4 w-4" /> 本月全部项目资料齐全
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
