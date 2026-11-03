'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Upload, X } from 'lucide-react';

type Project = { id: number; name: string };
type Voucher = {
  id: number;
  project_id: number;
  project_name: string;
  year_month: string;
  doc_type: 'settlement' | 'attendance';
  page_count: number;
  amount_total?: number | null;
  remark?: string | null;
  status: 'uploaded' | 'confirmed' | 'approved' | 'voided';
  uploaded_by_name?: string | null;
  confirmed_by_name?: string | null;
  confirmed_at?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
};

// 暂不启用审批流程：上传即完成，只保留「已上传 / 已作废」两种状态
const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  uploaded: { text: '已上传', className: 'bg-[#E8FFEA] text-[#00A870]' },
  confirmed: { text: '已上传', className: 'bg-[#E8FFEA] text-[#00A870]' },
  approved: { text: '已上传', className: 'bg-[#E8FFEA] text-[#00A870]' },
  voided: { text: '已作废', className: 'bg-[#F2F3F5] text-[#86909C]' },
};

const DOC_LABEL: Record<string, string> = { settlement: '结算单', attendance: '考勤表' };

function currentMonth() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export default function VouchersPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [filterProject, setFilterProject] = useState('all');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [upProject, setUpProject] = useState('');
  const [upMonth, setUpMonth] = useState(currentMonth());
  const [upType, setUpType] = useState<'settlement' | 'attendance'>('settlement');
  const [upAmount, setUpAmount] = useState('');
  const [upRemark, setUpRemark] = useState('');
  const [upReplace, setUpReplace] = useState(false);
  const [upFiles, setUpFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);


  const loadVouchers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterProject !== 'all') params.set('project_id', filterProject);
      if (filterMonth) params.set('month', filterMonth);
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/vouchers?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setVouchers((json.data?.vouchers || []) as Voucher[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterMonth, filterType]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json.data) ? json.data : [];
        setProjects((list as Project[]).map((p) => ({ id: Number(p.id), name: String(p.name || '') })));
      } catch {
        setProjects([]);
      }
    })();
  }, []);

  useEffect(() => { void loadVouchers(); }, [loadVouchers]);

  const summary = useMemo(() => {
    const total = vouchers.length;
    const settlement = vouchers.filter((v) => v.doc_type === 'settlement').length;
    const attendance = vouchers.filter((v) => v.doc_type === 'attendance').length;
    return { total, settlement, attendance };
  }, [vouchers]);

  const patchVoucher = async (voucher: Voucher, action: 'confirm' | 'approve' | 'void') => {
    const confirmText = action === 'confirm' ? '确认本月凭证已核对无误？' : action === 'approve' ? '确认审批通过？通过后凭证锁定。' : '确认作废该凭证？作废后可重新上传。';
    if (!window.confirm(confirmText)) return;
    try {
      const res = await fetch(`/api/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '操作失败');
      setNotice(action === 'confirm' ? '已核对' : action === 'approve' ? '已审批' : '已作废');
      await loadVouchers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  const submitUpload = async () => {
    if (!upProject) { setError('请选择项目'); return; }
    if (!upMonth) { setError('请选择月份'); return; }
    if (upFiles.length === 0) { setError('请选择要上传的文件'); return; }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('project_id', upProject);
      form.append('year_month', upMonth);
      form.append('doc_type', upType);
      if (upAmount.trim()) form.append('amount_total', upAmount.trim());
      if (upRemark.trim()) form.append('remark', upRemark.trim());
      if (upReplace) form.append('replace', '1');
      upFiles.forEach((file) => form.append('files', file));
      let res = await fetch('/api/vouchers', { method: 'POST', credentials: 'include', body: form });
      let json = await res.json();
      // 已存在同类凭证：询问后自动替换
      if (!res.ok && String(json?.error || '').includes('已有同类凭证')) {
        if (!window.confirm('该项目本月已有同类凭证，是否替换为本次上传？（原凭证作废留痕）')) {
          setUploading(false);
          return;
        }
        form.append('replace', '1');
        res = await fetch('/api/vouchers', { method: 'POST', credentials: 'include', body: form });
        json = await res.json();
      }
      if (!res.ok || json.success === false) throw new Error(json.error || '上传失败');
      setNotice(`上传成功（${json.data?.pages || upFiles.length} 页），等待项目经理核对`);
      setUploadOpen(false);
      setUpFiles([]);
      setUpAmount('');
      setUpRemark('');
      setUpReplace(false);
      await loadVouchers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/hr-salary" className="text-sm text-[var(--color-primary)] hover:underline">← 返回人力与工资</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <FileText className="h-5 w-5 text-[var(--color-primary)]" /> 月度凭证（结算单 / 考勤表）
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              纸质单据扫描件按「项目 + 月份 + 类型」归档，只存原件、不重复录金额；仅用于查账留档，不影响成本计算。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white"
          >
            <Upload className="h-4 w-4" /> 上传凭证
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: '凭证总数', value: summary.total },
            { label: '结算单', value: summary.settlement },
            { label: '考勤表', value: summary.attendance },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-[var(--border)] bg-white p-3">
              <p className="text-xs text-[var(--color-text-3)]">{item.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{notice}</div> : null}

        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm">
              <option value="all">全部项目</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm">
              <option value="">全部类型</option>
              <option value="settlement">结算单</option>
              <option value="attendance">考勤表</option>
            </select>
            <button type="button" onClick={() => void loadVouchers()} className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm">刷新</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">项目 / 月份</th>
                  <th className="px-3 py-2 text-left font-medium">类型</th>
                  <th className="px-3 py-2 text-left font-medium">页数</th>
                  <th className="px-3 py-2 text-left font-medium">上传</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th className="px-3 py-2 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中…</td></tr>
                ) : vouchers.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]">暂无凭证，点右上角「上传凭证」</td></tr>
                ) : vouchers.map((voucher) => {
                  const meta = STATUS_LABEL[voucher.status] || STATUS_LABEL.uploaded;
                  return (
                    <tr key={voucher.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        <div className="font-medium">{voucher.project_name}</div>
                        <div className="text-xs text-[var(--color-text-3)]">{voucher.year_month}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-[#E8F3FF] px-2 py-0.5 text-xs text-[#165DFF]">{DOC_LABEL[voucher.doc_type] || voucher.doc_type}</span>
                      </td>
                      <td className="px-3 py-2">{voucher.page_count} 页</td>
                      <td className="px-3 py-2 text-xs">
                        <div>{voucher.uploaded_by_name || '-'}</div>
                        <div className="text-[var(--color-text-3)]">{voucher.created_at ? new Date(voucher.created_at).toLocaleString('zh-CN') : ''}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${meta.className}`}>{meta.text}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <a href={`/workers/vouchers/${voucher.id}`} className="inline-flex h-7 items-center rounded border border-[var(--border)] px-2 text-xs">
                            查看原件
                          </a>
                          <button type="button" onClick={() => void patchVoucher(voucher, 'void')} className="h-7 rounded border border-[#FFCCC7] px-2 text-xs text-[#CB2634]">作废重传</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 上传弹窗 */}
      {uploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">上传凭证</p>
              <button type="button" onClick={() => setUploadOpen(false)} className="text-[var(--color-text-3)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select value={upProject} onChange={(e) => setUpProject(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm">
                  <option value="">选择项目</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="month" value={upMonth} onChange={(e) => setUpMonth(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm" />
                <select value={upType} onChange={(e) => setUpType(e.target.value as 'settlement' | 'attendance')} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm">
                  <option value="settlement">结算单</option>
                  <option value="attendance">考勤表</option>
                </select>
                <input value={upAmount} onChange={(e) => setUpAmount(e.target.value)} placeholder="分账合计（选填）" className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm" />
              </div>
              <input value={upRemark} onChange={(e) => setUpRemark(e.target.value)} placeholder="备注（选填）" className="h-9 w-full rounded-lg border border-[var(--border)] px-2 text-sm" />
              <div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => setUpFiles(Array.from(e.target.files || []))}
                  className="w-full rounded-lg border border-dashed border-[#C9CDD4] px-3 py-6 text-sm"
                />
                <p className="mt-1 text-xs text-[var(--color-text-3)]">
                  可多选：图片按选择顺序作为第 1、2、3…页；PDF 作为单页文件。单份不超过 20MB。
                  {upFiles.length > 0 ? `　已选 ${upFiles.length} 个文件` : ''}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-2)]">
                <input type="checkbox" checked={upReplace} onChange={(e) => setUpReplace(e.target.checked)} />
                若该项目本月已有同类凭证，替换原凭证（原凭证作废留痕）
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setUploadOpen(false)} className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm">取消</button>
                <button type="button" disabled={uploading} onClick={() => void submitUpload()} className="h-9 rounded-lg bg-[var(--color-primary)] px-4 text-sm text-white disabled:opacity-60">
                  {uploading ? '上传中…' : '上传并提交核对'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
