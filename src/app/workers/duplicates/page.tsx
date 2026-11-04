'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, Users } from 'lucide-react';

type Member = {
  id: number;
  name: string;
  phone: string;
  idCard: string;
  workType: string;
  projectName: string;
  status: string;
  salaryCount: number;
  salaryGross: number;
  paymentCount: number;
  paymentAmount: number;
};
type Group = { key: string; mode: 'auto' | 'manual'; suggestedKeepId: number; members: Member[] };

export default function WorkerDuplicatesPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [summary, setSummary] = useState({ groups: 0, auto: 0, manual: 0, workers: 0 });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keepChoices, setKeepChoices] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workers/duplicates', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '检测失败');
      const list = (json.data?.groups || []) as Group[];
      setGroups(list);
      setSummary(json.data?.summary || { groups: 0, auto: 0, manual: 0, workers: 0 });
      const choices: Record<string, number> = {};
      list.forEach((group) => { choices[group.key] = group.suggestedKeepId; });
      setKeepChoices(choices);
    } catch (e) {
      setError(e instanceof Error ? e.message : '检测失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const merge = async (group: Group, keepId: number) => {
    const members = group.members.filter((member) => member.id !== keepId);
    const affectedPayments = members.reduce((sum, member) => sum + member.paymentCount, 0);
    const affectedSalaries = members.reduce((sum, member) => sum + member.salaryCount, 0);
    const keepMember = group.members.find((member) => member.id === keepId);
    const confirmText = [
      `保留「${keepMember?.name || keepId}」，合并 ${members.length} 个重复人员？`,
      `被合并人员名下有：月度工资 ${affectedSalaries} 条、已发放记录 ${affectedPayments} 条`,
      '工资与发放记录会自动改挂到保留人员；同项目同月份的工资将合并金额。',
    ].join('\n');
    if (!window.confirm(confirmText)) return;

    setWorking(group.key);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/workers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ keepId, mergeIds: members.map((member) => member.id) }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '合并失败');
      const data = json.data || {};
      setNotice(`已合并 ${data.mergedCount || members.length} 人：迁移工资 ${data.movedSalaries || 0} 条、合并同月工资 ${data.mergedSalaries || 0} 条`
        + (Array.isArray(data.failures) && data.failures.length ? `；部分失败：${data.failures.slice(0, 2).join('；')}` : ''));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '合并失败');
    } finally {
      setWorking('');
    }
  };

  const autoMergeAll = async () => {
    const autoGroups = groups.filter((group) => group.mode === 'auto');
    if (autoGroups.length === 0) return;
    if (!window.confirm(`将自动合并 ${autoGroups.length} 组「姓名+电话+身份证完全一致」的重复人员，继续？`)) return;
    setWorking('auto-all');
    setError('');
    setNotice('');
    try {
      let merged = 0;
      for (const group of autoGroups) {
        const keepId = keepChoices[group.key] || group.suggestedKeepId;
        const members = group.members.filter((member) => member.id !== keepId);
        const res = await fetch('/api/workers/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ keepId, mergeIds: members.map((member) => member.id) }),
        });
        const json = await res.json();
        if (res.ok && json.success !== false) merged += members.length;
      }
      setNotice(`自动合并完成，共整理 ${merged} 个重复人员`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '自动合并失败');
    } finally {
      setWorking('');
    }
  };

  const autoCount = useMemo(() => groups.filter((group) => group.mode === 'auto').length, [groups]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/workers/roster" className="text-sm text-[var(--color-primary)] hover:underline">← 返回花名册</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <Users className="h-5 w-5 text-[var(--color-primary)]" /> 花名册重复人员
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              同一项目内，姓名 / 电话 / 身份证号任一相同即归为一组；三项完全一致的可一键自动合并，其余需人工确认。跨项目同名同电话（同一人在不同项目任职）属正常，不会出现在这里。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void load()} className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
              {loading ? '检测中…' : '重新检测'}
            </button>
            <button
              type="button"
              disabled={autoCount === 0 || working !== ''}
              onClick={() => void autoMergeAll()}
              className="h-9 rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white disabled:opacity-50"
            >
              {working === 'auto-all' ? '合并中…' : `一键自动合并（${autoCount} 组）`}
            </button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{notice}</div> : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: '重复组', value: summary.groups },
            { label: '可自动合并', value: summary.auto },
            { label: '需人工确认', value: summary.manual },
            { label: '涉及人员', value: summary.workers },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-3)]">{card.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> 正在检测重复人员…
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[#00A870]">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6" /> 没有发现重复人员
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.key} className="rounded-xl border border-[var(--border)] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    {group.mode === 'auto' ? (
                      <span className="rounded bg-[#E8FFEA] px-2 py-0.5 text-xs text-[#00A870]">三项完全一致 · 可自动合并</span>
                    ) : (
                      <span className="flex items-center gap-1 rounded bg-[#FFF7E8] px-2 py-0.5 text-xs text-[#B35B00]">
                        <AlertTriangle className="h-3 w-3" /> 有重复项 · 需人工确认
                      </span>
                    )}
                    <span className="text-[var(--color-text-3)]">{group.members.length} 人</span>
                  </div>
                  <button
                    type="button"
                    disabled={working !== ''}
                    onClick={() => void merge(group, keepChoices[group.key] || group.suggestedKeepId)}
                    className="h-8 rounded-lg bg-[var(--color-primary)] px-3 text-xs text-white disabled:opacity-50"
                  >
                    {working === group.key ? '合并中…' : '合并为一人'}
                  </button>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {group.members.map((member) => {
                    const checked = (keepChoices[group.key] || group.suggestedKeepId) === member.id;
                    return (
                      <label key={member.id} className={`flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2 text-sm ${checked ? 'bg-[#E8F3FF]' : ''}`}>
                        <input
                          type="radio"
                          name={group.key}
                          checked={checked}
                          onChange={() => setKeepChoices((prev) => ({ ...prev, [group.key]: member.id }))}
                        />
                        <span className="w-40 font-medium">{member.name} <span className="text-xs text-[var(--color-text-3)]">#{member.id}</span></span>
                        <span className="w-32 text-xs text-[var(--color-text-3)]">{member.phone || '无电话'}</span>
                        <span className="w-44 text-xs text-[var(--color-text-3)]">{member.idCard || '无身份证'}</span>
                        <span className="w-28 text-xs">{member.projectName || '未分配项目'}</span>
                        <span className="text-xs text-[var(--color-text-2)]">
                          工资 {member.salaryCount} 条 / ¥{member.salaryGross.toLocaleString('zh-CN')}
                        </span>
                        <span className="text-xs text-[var(--color-text-2)]">
                          已发 {member.paymentCount} 条 / ¥{member.paymentAmount.toLocaleString('zh-CN')}
                        </span>
                        {member.salaryCount > 0 || member.paymentCount > 0 ? (
                          <span className="rounded bg-[#FFF7E8] px-1.5 py-0.5 text-[10px] text-[#B35B00]">有工资/发放记录</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
