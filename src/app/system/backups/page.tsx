'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Database, Download, Loader2, Play, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';

type BackupRow = {
  id: number;
  backup_date: string;
  status: string;
  table_count: number;
  row_count: number;
  size_bytes: number;
  encrypted: boolean;
  error?: string | null;
  started_at: string;
  finished_at?: string | null;
};

type Manifest = {
  date: string;
  createdAt: string;
  encrypted: boolean;
  tables: Array<{ table: string; rows: number; bytes: number; sha256: string; key: string }>;
  skipped: Array<{ table: string; reason: string }>;
  totalRows: number;
  totalBytes: number;
};

function formatBytes(value: number) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export default function DataBackupPage() {
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [nas, setNas] = useState<null | { endpoint: string; bucket: string; region: string; configured: boolean; rcloneConfig: string; syncCommand: string; notes: string[] }>(null);
  const [copied, setCopied] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);

  const load = useCallback(async (auto = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/system/backups${auto ? '?auto=1' : ''}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setRows(json.data.backups || []);
      setEncryptionEnabled(Boolean(json.data.encryptionEnabled));
      setLastSuccessAt(json.data.lastSuccessAt || null);
      if (json.data.autoRun?.ran) setNotice(json.data.autoRun.message || '已自动备份');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);


  const loadNas = useCallback(async () => {
    try {
      const res = await fetch('/api/system/backup/nas-config', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success !== false) setNas(json.data);
    } catch {
      // 忽略
    }
  }, []);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      // 忽略
    }
  };

  useEffect(() => { void load(true); void loadNas(); }, [load, loadNas]);

  const runNow = useCallback(async () => {
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/system/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '备份失败');
      setNotice(`备份完成：${json.data.tableCount} 张表 / ${json.data.rowCount} 行 / ${formatBytes(json.data.bytes)}${json.data.cleaned ? `，清理过期文件 ${json.data.cleaned} 个` : ''}`);
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '备份失败');
    } finally {
      setRunning(false);
    }
  }, [load]);

  const openManifest = useCallback(async (date: string) => {
    if (openDate === date) { setOpenDate(null); setManifest(null); return; }
    setOpenDate(date);
    setManifest(null);
    setManifestLoading(true);
    try {
      const res = await fetch(`/api/system/backups/manifest?date=${date}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '读取清单失败');
      setManifest(json.data as Manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取清单失败');
    } finally {
      setManifestLoading(false);
    }
  }, [openDate]);

  const restore = useCallback(async (date: string, table: string) => {
    const input = window.prompt(`将从 ${date} 的备份恢复表「${table}」（按 id 覆盖同名记录，不会删除其他数据）。\n\n请输入 RESTORE 确认：`);
    if (input !== 'RESTORE') return;
    try {
      const res = await fetch('/api/system/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date, table, confirm: 'RESTORE' }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '恢复失败');
      setNotice(`已恢复 ${table}：${json.data.restored} 条记录`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢复失败');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/system-management" className="text-sm text-[var(--color-primary)] hover:underline">← 返回系统管理</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <Database className="h-5 w-5 text-[var(--color-primary)]" /> 数据备份
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              每日自动把全部业务表导出并上传到对象存储（阿里云 OSS）；可下载、可按表恢复。每天保留 30 天，每月 1 号保留 1 年。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} 立即备份
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${encryptionEnabled ? 'bg-[#E8FFEA] text-[#00A870]' : 'bg-[#FFF7E8] text-[#B35B00]'}`}>
            {encryptionEnabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {encryptionEnabled ? '已开启 AES-256 加密' : '未加密（建议配置 BACKUP_ENCRYPTION_KEY）'}
          </span>
          {lastSuccessAt ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-muted)] px-2 py-1 text-[var(--color-text-2)]">
              <CheckCircle2 className="h-3.5 w-3.5" /> 最近成功：{new Date(lastSuccessAt).toLocaleString('zh-CN')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF1F0] px-2 py-1 text-[#CB2634]">
              <AlertTriangle className="h-3.5 w-3.5" /> 还没有成功备份过
            </span>
          )}
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{notice}</div> : null}

        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">NAS 本地备份（由 NAS 主动拉取）</p>
              <p className="mt-1 text-xs text-[var(--color-text-3)]">
                云端文件（照片/合同/结算单/凭证）都在对象存储里，NAS 用 rclone 每天拉取一份到本地盘即可；云端无需开放端口。
              </p>
            </div>
            {nas ? (
              <span className={`rounded px-2 py-1 text-xs ${nas.configured ? 'bg-[#E8FFEA] text-[#00A870]' : 'bg-[#FFF7E8] text-[#B35B00]'}`}>
                {nas.configured ? `已配置：${nas.bucket}` : '对象存储未配置，当前回退 Supabase Storage'}
              </span>
            ) : null}
          </div>

          {nas ? (
            <div className="mt-3 space-y-3 text-xs">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-[var(--color-muted)] px-3 py-2">
                  <p className="text-[var(--color-text-3)]">Endpoint</p>
                  <p className="mt-0.5 break-all font-medium">{nas.endpoint || '-'}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-muted)] px-3 py-2">
                  <p className="text-[var(--color-text-3)]">Bucket</p>
                  <p className="mt-0.5 break-all font-medium">{nas.bucket || '-'}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-muted)] px-3 py-2">
                  <p className="text-[var(--color-text-3)]">Region</p>
                  <p className="mt-0.5 font-medium">{nas.region}</p>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium">① 在 NAS 上保存 rclone 配置</p>
                  <button type="button" onClick={() => void copyText(nas.rcloneConfig, 'config')} className="text-[var(--color-primary)] hover:underline">
                    {copied === 'config' ? '已复制' : '复制配置'}
                  </button>
                </div>
                <pre className="max-h-44 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">{nas.rcloneConfig}</pre>
                <p className="mt-1 text-[var(--color-text-3)]">把 YOUR_ACCESS_KEY_ID / YOUR_ACCESS_KEY_SECRET 换成对象存储的密钥（建议只读子账号）。</p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium">② 在 NAS 上执行一次同步（之后设为每日计划任务）</p>
                  <button type="button" onClick={() => void copyText(nas.syncCommand, 'cmd')} className="text-[var(--color-primary)] hover:underline">
                    {copied === 'cmd' ? '已复制' : '复制命令'}
                  </button>
                </div>
                <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">{nas.syncCommand}</pre>
                <p className="mt-1 text-[var(--color-text-3)]">路径按你 NAS 的共享目录调整（群晖一般是 /volume1/xxx，威联通是 /share/xxx）。</p>
              </div>

              <ul className="list-disc space-y-1 pl-5 text-[var(--color-text-3)]">
                {nas.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">备份日期</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">表数</th>
                <th className="px-3 py-2 text-right font-medium">行数</th>
                <th className="px-3 py-2 text-right font-medium">大小</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]">加载中…</td></tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]">还没有备份记录，点右上角「立即备份」</td></tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">{row.backup_date}</td>
                  <td className="px-3 py-2">
                    {row.status === 'success' ? (
                      <span className="inline-flex items-center gap-1 text-[#00A870]"><CheckCircle2 className="h-3.5 w-3.5" />成功</span>
                    ) : row.status === 'failed' ? (
                      <span className="inline-flex items-center gap-1 text-[#CB2634]" title={row.error || ''}><XCircle className="h-3.5 w-3.5" />失败</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#B35B00]"><Loader2 className="h-3.5 w-3.5 animate-spin" />进行中</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.table_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.row_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBytes(Number(row.size_bytes || 0))}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void openManifest(row.backup_date)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--color-primary)]"
                    >
                      {openDate === row.backup_date ? '收起' : '查看内容'}
                    </button>
                    <a
                      className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                      href={`/api/system/backups/download?date=${row.backup_date}&table=manifest`}
                    >
                      <Download className="h-3.5 w-3.5" />清单
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {openDate ? (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {openDate} 备份内容
                {manifest ? `（${manifest.tables.length} 张表 / ${manifest.totalRows} 行 / ${formatBytes(manifest.totalBytes)}）` : ''}
              </p>
              {manifest?.encrypted ? <span className="text-xs text-[#00A870]">已加密</span> : null}
            </div>
            {manifestLoading ? <p className="py-6 text-center text-sm text-[var(--color-text-3)]">读取清单…</p> : null}
            {manifest ? (
              <div className="mt-3 max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-[var(--color-text-3)]">
                    <tr>
                      <th className="px-2 py-1 text-left">表名</th>
                      <th className="px-2 py-1 text-right">行数</th>
                      <th className="px-2 py-1 text-right">大小</th>
                      <th className="px-2 py-1 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.tables.map((item) => (
                      <tr key={item.table} className="border-t border-[var(--border)]">
                        <td className="px-2 py-1 font-mono">{item.table}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{item.rows}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatBytes(item.bytes)}</td>
                        <td className="px-2 py-1 text-right">
                          <a
                            className="mr-2 inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                            href={`/api/system/backups/download?date=${openDate}&table=${item.table}`}
                          >
                            <Download className="h-3 w-3" />下载
                          </a>
                          <button
                            type="button"
                            onClick={() => void restore(openDate, item.table)}
                            className="inline-flex items-center gap-1 text-[#B35B00] hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" />恢复
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {manifest.skipped.length > 0 ? (
                  <p className="mt-2 text-xs text-[#B35B00]">
                    跳过 {manifest.skipped.length} 张表（不存在或无权限）：{manifest.skipped.map((item) => item.table).join('、')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-[var(--color-text-3)]">
          说明：备份文件存放在对象存储 <code>backup/日期/表名.jsonl.gz(.enc)</code>；下载后用 gzip 解压即是每行一条 JSON 的文本。
          恢复为「按 id 覆盖」，不会删除备份里没有的数据。
        </p>
      </div>
    </div>
  );
}
