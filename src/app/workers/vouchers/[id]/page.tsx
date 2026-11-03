'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';

type PageItem = { id: number; file_name?: string; content_type?: string; page_index: number };
type Voucher = {
  id: number;
  project_id: number;
  year_month: string;
  doc_type: 'settlement' | 'attendance';
  page_count: number;
  amount_total?: number | null;
  remark?: string | null;
  status: string;
  uploaded_by_name?: string | null;
  created_at?: string | null;
};

const DOC_LABEL: Record<string, string> = { settlement: '结算单', attendance: '考勤表' };

export default function VoucherDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/vouchers/${id}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setVoucher(json.data.voucher as Voucher);
      setPages((json.data.pages || []) as PageItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      if (!voucher?.project_id) return;
      try {
        const res = await fetch('/api/projects', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json.data) ? json.data : [];
        const found = (list as Array<{ id: number; name: string }>).find((p) => Number(p.id) === Number(voucher.project_id));
        setProjectName(found?.name || `项目#${voucher.project_id}`);
      } catch {
        setProjectName(`项目#${voucher.project_id}`);
      }
    })();
  }, [voucher?.project_id]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <Link href="/workers/vouchers" className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline">
            <ArrowLeft className="h-4 w-4" /> 返回月度凭证
          </Link>
          <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">
            {voucher ? `${projectName} · ${voucher.year_month} · ${DOC_LABEL[voucher.doc_type] || voucher.doc_type}` : '凭证详情'}
          </h1>
          {voucher ? (
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              共 {voucher.page_count} 页 · 上传：{voucher.uploaded_by_name || '-'}
              {voucher.created_at ? ` · ${new Date(voucher.created_at).toLocaleString('zh-CN')}` : ''}
              {voucher.amount_total ? ` · 分账合计 ${Number(voucher.amount_total).toLocaleString('zh-CN')} 元` : ''}
            </p>
          ) : null}
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : pages.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">没有可显示的文件</div>
        ) : (
          <div className="space-y-4">
            {pages.map((page) => {
              const url = `/api/vouchers/files/${page.id}`;
              const isPdf = String(page.content_type || '').includes('pdf');
              return (
                <div key={page.id} className="rounded-xl border border-[var(--border)] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
                    <p className="text-sm font-medium">第 {page.page_index} 页 · {page.file_name || ''}</p>
                    <div className="flex gap-2">
                      <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded border border-[var(--border)] px-2 text-xs">
                        新窗口打开
                      </a>
                      <a href={url} download={page.file_name || `page-${page.page_index}`} className="inline-flex h-7 items-center gap-1 rounded border border-[var(--border)] px-2 text-xs">
                        <Download className="h-3 w-3" /> 下载
                      </a>
                    </div>
                  </div>
                  <div className="p-3">
                    {isPdf ? (
                      <iframe src={url} title={`pdf-${page.page_index}`} className="h-[70vh] w-full rounded border-0" />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt={`第${page.page_index}页`} className="mx-auto max-h-[80vh] w-auto object-contain" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {voucher?.remark ? (
          <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--color-text-2)]">
            备注：{voucher.remark}
          </div>
        ) : null}
      </div>
    </div>
  );
}
