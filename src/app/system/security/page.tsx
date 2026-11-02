'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, Play, ShieldCheck } from 'lucide-react';

type Capability = { mode: 'postgres' | 'rpc' | 'none'; detail: string; functionName?: string };

const SCRIPTS = [
  { file: 'enable_rls_core_tables.sql', label: '开启核心表行级安全（RLS）', desc: '执行后 anon key 无法直接读写业务数据，仅服务端 service_role 可访问' },
  { file: 'add_data_backups.sql', label: '创建数据备份表', desc: '数据备份功能依赖，缺表时备份会失败' },
  { file: 'add_dingtalk_todo_tasks.sql', label: '创建钉钉待办映射表', desc: '钉钉待办功能依赖' },
  { file: 'add_project_role_boss.sql', label: '项目角色补充老板注释', desc: '仅更新字段注释，无数据结构变化' },
  { file: 'client_reports_auto_review.sql', label: '甲方报量历史草稿转已审核', desc: '回填历史 draft/NULL 状态，修复产值统计为 0' },
];

export default function SecurityPage() {
  const [capability, setCapability] = useState<Capability | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
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

  const run = useCallback(async (file: string) => {
    const input = window.prompt(`即将执行 ${file}（会先自动备份一次）。\n\n请输入 EXECUTE 确认：`);
    if (input !== 'EXECUTE') return;
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
            </p>
          </div>
        </div>

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
                <p className="text-sm font-medium text-[var(--foreground)]">{script.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-3)]">{script.desc}</p>
                <p className="mt-0.5 font-mono text-[11px] text-[var(--color-text-3)]">migrations/{script.file}</p>
              </div>
              <button
                type="button"
                disabled={running !== null || capability?.mode === 'none'}
                onClick={() => void run(script.file)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                {running === script.file ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                执行
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--color-text-3)]">
          如果显示「平台未提供 SQL 执行函数」，请把对应脚本内容复制到云控制台的 SQL 窗口执行（脚本在仓库 migrations/ 目录）。
        </p>
      </div>
    </div>
  );
}
