'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, Play, ShieldCheck } from 'lucide-react';

type Capability = { mode: 'postgres' | 'rpc' | 'none'; detail: string; functionName?: string };

type EnvCheck = {
  database: {
    url_configured: boolean;
    service_role_key_configured: boolean;
    anon_key_configured: boolean;
    effective_key_role: string;
    using_service_role: boolean;
  };
  storage: {
    mode: string;
    backup_encryption_configured: boolean;
    approval_link_secret_configured: boolean;
    cron_token_configured: boolean;
  };
  rls_safety: { safe_to_enable: boolean; reason: string };
};

const SCRIPTS: Array<{ file: string; label: string; desc: string; level: '必做' | '建议' | '可选' }> = [
  { file: 'add_data_backups.sql', label: '① 创建数据备份表', desc: '备份功能依赖；缺表时备份页会报错', level: '必做' },
  { file: 'add_api_timing_logs.sql', label: '② 创建慢接口监控表', desc: '数据健康页的慢接口榜依赖；缺表时不显示数据', level: '必做' },
  { file: 'client_reports_auto_review.sql', label: '③ 甲方报量历史草稿转已审核', desc: '回填历史 draft/NULL 状态，修复产值统计为 0', level: '建议' },
  { file: 'add_dingtalk_todo_tasks.sql', label: '④ 创建钉钉待办映射表', desc: '钉钉待办功能依赖（不用待办可不执行）', level: '建议' },
  { file: 'enable_rls_core_tables.sql', label: '⑤ 开启核心表行级安全（RLS）', desc: '执行后 anon key 无法直接读写业务数据，仅服务端 service_role 可访问', level: '建议' },
  { file: 'add_project_role_boss.sql', label: '⑥ 项目角色补充老板注释', desc: '仅更新字段注释，无数据结构变化', level: '可选' },
];

export default function SecurityPage() {
  const [capability, setCapability] = useState<Capability | null>(null);
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [envError, setEnvError] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [sqlView, setSqlView] = useState<{ file: string; sql: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/system/sql', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '探测失败');
      setCapability(json.data as Capability);
    } catch (e) {
      setError(e instanceof Error ? e.message : '探测失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/system/env-check', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.success === false) {
          if (!cancelled) setEnvError(json.error || '需要超级管理员权限');
          return;
        }
        if (!cancelled) setEnvCheck(json.data as EnvCheck);
      } catch (e) {
        if (!cancelled) setEnvError(e instanceof Error ? e.message : '自检失败');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const viewSql = useCallback(async (file: string) => {
    try {
      const res = await fetch(`/api/system/sql?file=${encodeURIComponent(file)}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '读取失败');
      setSqlView({ file, sql: json.data.sql });
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    }
  }, []);

  const copySql = useCallback(async () => {
    if (!sqlView) return;
    try {
      await navigator.clipboard.writeText(sqlView.sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败，请手动全选复制');
    }
  }, [sqlView]);

  const run = useCallback(async (file: string) => {
    setPendingFile(null);
    setRunning(file);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/system/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ file, confirm: 'EXECUTE', backupFirst: true }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '执行失败');
      setNotice(`${file} 执行成功（${json.data.mode}）：${json.data.detail}；${json.data.backup?.message || ''}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(null);
    }
  }, [load]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/system-management" className="text-sm text-[var(--color-primary)] hover:underline">← 返回系统管理</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <ShieldCheck className="h-5 w-5 text-[var(--color-primary)]" /> 安全加固
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              没有数据库连接串时，可通过平台提供的 SQL 执行能力运行迁移脚本（执行前自动备份）。
              <span className="ml-1 text-[#B35B00]">绿色只代表具备执行条件，脚本仍需按 ①→⑥ 逐个执行。</span>
            </p>
          </div>
        </div>

        {envCheck ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${envCheck.rls_safety.safe_to_enable ? 'border-[#B7EB8F] bg-[#F6FFED] text-[#237804]' : 'border-[#FFCCC7] bg-[#FFF2F0] text-[#CB2634]'}`}>
            <p className="font-medium">
              {envCheck.rls_safety.safe_to_enable ? '✅ 可以安全开启 RLS' : '⛔ 暂不要开启 RLS'}
            </p>
            <p className="mt-1">{envCheck.rls_safety.reason}</p>
            <p className="mt-1 text-xs opacity-80">
              数据库 key：{envCheck.database.effective_key_role}
              （service_role {envCheck.database.service_role_key_configured ? '已配置' : '未配置'} / anon {envCheck.database.anon_key_configured ? '已配置' : '未配置'}）
              　存储：{envCheck.storage.mode}
              　备份加密：{envCheck.storage.backup_encryption_configured ? '已开启' : '未开启'}
            </p>
          </div>
        ) : envError ? (
          <div className="rounded-xl border border-[#FFE7BA] bg-[#FFFBE6] px-4 py-3 text-sm text-[#874D00]">
            环境自检：{envError}（仅超级管理员可查看）
          </div>
        ) : null}

        <div className={`rounded-xl border px-4 py-3 text-sm ${capability?.mode === 'none' ? 'border-[#FFE7BA] bg-[#FFFBE6] text-[#874D00]' : 'border-[#B7EB8F] bg-[#F6FFED] text-[#237804]'}`}>
          {loading ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 正在探测数据库执行能力…</span>
          ) : capability ? (
            <span className="inline-flex items-center gap-2">
              {capability.mode === 'none' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {capability.detail}
            </span>
          ) : null}
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{notice}</div> : null}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {SCRIPTS.map((script) => (
            <div key={script.file} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  {script.label}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${script.level === '必做' ? 'bg-[#FFECE8] text-[#CB2634]' : script.level === '建议' ? 'bg-[#FFF7E8] text-[#B35B00]' : 'bg-[var(--color-muted)] text-[var(--color-text-3)]'}`}>
                    {script.level}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-3)]">{script.desc}</p>
                <p className="mt-0.5 font-mono text-[11px] text-[var(--color-text-3)]">migrations/{script.file}</p>
              </div>
              <button
                type="button"
                onClick={() => void viewSql(script.file)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--color-text-2)]"
              >
                查看 SQL
              </button>
              <button
                type="button"
                disabled={running !== null || capability?.mode === 'none'}
                onClick={() => setPendingFile(script.file)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                {running === script.file ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                执行
              </button>
            </div>
          ))}
        </div>

        {sqlView ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-[var(--foreground)]">{sqlView.file}</p>
                <button
                  type="button"
                  onClick={() => void copySql()}
                  className="inline-flex h-8 items-center rounded-lg bg-[var(--color-primary)] px-3 text-xs font-medium text-white"
                >
                  {copied ? '已复制' : '复制全部'}
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-3)]">
                把下面内容粘贴到云控制台的 SQL 窗口执行（数据库 → SQL 查询）。
              </p>
              <pre className="mt-3 flex-1 overflow-auto rounded-lg bg-[var(--color-muted)] p-3 text-[11px] leading-5">{sqlView.sql}</pre>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSqlView(null)}
                  className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-sm"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pendingFile ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
              <p className="text-base font-semibold text-[var(--foreground)]">确认执行这个脚本？</p>
              <p className="mt-2 text-sm text-[var(--color-text-2)]">
                脚本：<span className="font-mono">{pendingFile}</span>
              </p>
              <p className="mt-2 text-xs text-[var(--color-text-3)]">
                执行前会自动做一次完整备份；脚本是幂等的（可重复执行）。确定后立即执行，不可撤销。
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void run(pendingFile)}
                  className="inline-flex h-9 items-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white"
                >
                  确认执行
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-[var(--color-text-3)]">
          如果显示「平台未提供 SQL 执行函数」，请把对应脚本内容复制到云控制台的 SQL 窗口执行（脚本在仓库 migrations/ 目录）。
        </p>
      </div>
    </div>
  );
}
