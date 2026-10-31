'use client';

import { useConfirm } from '@/hooks/use-confirm';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

type Project = { id: number | string; name: string; status?: string };
type TeamGroup = {
  id: number;
  project_id: number;
  project_name?: string;
  name: string;
  leader_name?: string;
  work_type?: string;
};
type TeamSettlementLite = {
  id: number;
  settlement_no?: string;
  settlement_month: string;
  team_id?: number;
  payable_amount?: number;
};
type TeamSummaryRow = {
  team_id: number;
  team_name: string;
  work_type?: string;
  project_id?: number;
  project_name?: string;
  payable_amount: number;
  planned_payment?: number;
  retained_amount?: number;
  paid_amount: number;
  unpaid_amount: number;
};
type PaymentRow = {
  id: number;
  team_id: number;
  team_name?: string;
  work_type?: string;
  project_id?: number;
  project_name?: string;
  settlement_id?: number | null;
  settlement_no?: string;
  settlement_month?: string;
  payment_amount: number;
  payment_date?: string;
  method?: string;
  remark?: string;
  created_at?: string;
};

type ApiResp<T> = { success?: boolean; data?: T; error?: string; message?: string };

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number | null | undefined): string {
  const num = Number(value || 0);
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMethod(method?: string): string {
  const map: Record<string, string> = {
    bank: '银行转账',
    cash: '现金',
    wechat: '微信',
    alipay: '支付宝',
    other: '其他',
  };
  return map[String(method || '').toLowerCase()] || method || '-';
}

export function TeamPaymentsPageClient() {
  const confirmDialog = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<TeamGroup[]>([]);
  const [summaries, setSummaries] = useState<TeamSummaryRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');

  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterTeamId, setFilterTeamId] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formProjectId, setFormProjectId] = useState('');
  const [formTeamId, setFormTeamId] = useState('');
  const [formSettlementId, setFormSettlementId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formMethod, setFormMethod] = useState('bank');
  const [formRemark, setFormRemark] = useState('');
  const [teamSettlements, setTeamSettlements] = useState<TeamSettlementLite[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(false);

  const loadProjects = useCallback(async () => {
    const json = await readJson<ApiResp<Project[]> & { projects?: Project[] }>(
      await fetch('/api/projects', { credentials: 'include' }),
    );
    const list = Array.isArray(json?.projects)
      ? json.projects
      : Array.isArray(json?.data)
        ? json.data
        : [];
    setProjects(list);
  }, []);

  const loadTeams = useCallback(async () => {
    const json = await readJson<ApiResp<TeamGroup[] | { groups: TeamGroup[] }> & { groups?: TeamGroup[] }>(
      await fetch('/api/team-groups', { credentials: 'include' }),
    );
    const payload = json?.data;
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.groups)
        ? payload.groups
        : Array.isArray(json?.groups)
          ? json.groups
          : [];
    setTeams(list);
  }, []);

  const loadSummaries = useCallback(async () => {
    const params = new URLSearchParams({ mode: 'team-summary' });
    if (filterProjectId) params.set('projectId', filterProjectId);
    if (filterTeamId) params.set('teamId', filterTeamId);
    const json = await readJson<ApiResp<{ teams: TeamSummaryRow[] }>>(
      await fetch(`/api/team-settlement-payments?${params.toString()}`, { credentials: 'include' }),
    );
    setSummaries(Array.isArray(json?.data?.teams) ? json.data.teams : []);
  }, [filterProjectId, filterTeamId]);

  const loadPayments = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProjectId) params.set('projectId', filterProjectId);
    if (filterTeamId) params.set('teamId', filterTeamId);
    const json = await readJson<ApiResp<{ payments: PaymentRow[] }>>(
      await fetch(`/api/team-settlement-payments?${params.toString()}`, { credentials: 'include' }),
    );
    setPayments(Array.isArray(json?.data?.payments) ? json.data.payments : []);
  }, [filterProjectId, filterTeamId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadSummaries(), loadPayments()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadSummaries, loadPayments]);

  useEffect(() => {
    void loadProjects();
    void loadTeams();
  }, [loadProjects, loadTeams]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredTeams = useMemo(() => {
    if (!formProjectId) return [];
    return teams.filter((t) => String(t.project_id) === formProjectId);
  }, [teams, formProjectId]);

  const filteredSummaries = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return summaries;
    return summaries.filter((row) =>
      [row.team_name, row.project_name, row.work_type]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(kw)),
    );
  }, [summaries, keyword]);

  const filteredPayments = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return payments;
    return payments.filter((row) =>
      [row.team_name, row.project_name, row.settlement_no, row.remark]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(kw)),
    );
  }, [payments, keyword]);

  const totals = useMemo(() => {
    return {
      payable: round2(filteredSummaries.reduce((sum, row) => sum + Number(row.payable_amount || 0), 0)),
      paid: round2(filteredSummaries.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0)),
      unpaid: round2(filteredSummaries.reduce((sum, row) => sum + Number(row.unpaid_amount || 0), 0)),
    };
  }, [filteredSummaries]);

  const loadTeamSettlements = useCallback(async (teamId: string) => {
    if (!teamId) {
      setTeamSettlements([]);
      return;
    }
    setLoadingSettlements(true);
    try {
      const params = new URLSearchParams({ teamId });
      const json = await readJson<ApiResp<{ settlements: TeamSettlementLite[] }>>(
        await fetch(`/api/team-settlements?${params.toString()}`, { credentials: 'include' }),
      );
      setTeamSettlements(Array.isArray(json?.data?.settlements) ? json.data.settlements : []);
    } catch {
      setTeamSettlements([]);
    } finally {
      setLoadingSettlements(false);
    }
  }, []);

  useEffect(() => {
    setFormSettlementId('');
    void loadTeamSettlements(formTeamId);
  }, [formTeamId, loadTeamSettlements]);

  const openForm = () => {
    setFormProjectId(filterProjectId || '');
    setFormTeamId(filterTeamId || '');
    setFormSettlementId('');
    setFormAmount('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormMethod('bank');
    setFormRemark('');
    setShowForm(true);
  };

  const submitPayment = async () => {
    const amount = Number(formAmount);
    if (!formTeamId) {
      setError('请选择班组');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('请填写有效的付款金额');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const json = await readJson<ApiResp<unknown>>(
        await fetch('/api/team-settlement-payments', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_id: Number(formTeamId),
            settlement_id: formSettlementId ? Number(formSettlementId) : undefined,
            payment_amount: amount,
            payment_date: formDate || undefined,
            method: formMethod,
            remark: formRemark || undefined,
          }),
        }),
      );
      if (!json?.success) {
        throw new Error(json?.error || json?.message || '保存失败');
      }
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const deletePayment = async (row: PaymentRow) => {
    if (!(await confirmDialog({ title: '确认删除', description: `确认删除该笔付款（${formatMoney(row.payment_amount)} 元）？`, variant: 'destructive' }))) return;
    setError('');
    try {
      const json = await readJson<ApiResp<unknown>>(
        await fetch(`/api/team-settlement-payments?id=${row.id}`, {
          method: 'DELETE',
          credentials: 'include',
        }),
      );
      if (!json?.success) throw new Error(json?.error || '删除失败');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">班组付款</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            按班组维度滚动累计：未付 = 该班组结算实付累计 − 该班组付款累计
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </button>
          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            记付款
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">应付（结算实付累计）</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{formatMoney(totals.payable)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">已付（付款累计）</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(totals.paid)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">未付（轧差）</div>
          <div className="mt-1 text-2xl font-semibold text-amber-600">{formatMoney(totals.unpaid)}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-center gap-2">
        <select
          value={filterProjectId}
          onChange={(e) => {
            setFilterProjectId(e.target.value);
            setFilterTeamId('');
          }}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={String(p.id)} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={filterTeamId}
          onChange={(e) => setFilterTeamId(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">全部班组</option>
          {teams
            .filter((t) => !filterProjectId || String(t.project_id) === filterProjectId)
            .map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
                {t.work_type ? `（${t.work_type}）` : ''}
              </option>
            ))}
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索班组/项目/备注"
            className="w-full rounded-md border border-border bg-background pl-8 pr-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">班组汇总</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">班组</th>
                <th className="px-4 py-2 text-left font-medium">工种</th>
                <th className="px-4 py-2 text-left font-medium">所属项目</th>
                <th className="px-4 py-2 text-right font-medium">应付</th>
                <th className="px-4 py-2 text-right font-medium">本期计划付</th>
                <th className="px-4 py-2 text-right font-medium">尾款/预留</th>
                <th className="px-4 py-2 text-right font-medium">已付</th>
                <th className="px-4 py-2 text-right font-medium">未付</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    加载中...
                  </td>
                </tr>
              ) : filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    暂无班组结算/付款数据
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((row) => (
                  <tr key={row.team_id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 text-foreground">{row.team_name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.work_type || '-'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.project_name || '-'}</td>
                    <td className="px-4 py-2 text-right text-foreground">{formatMoney(row.payable_amount)}</td>
                    <td className="px-4 py-2 text-right text-emerald-600">{formatMoney(row.planned_payment ?? row.payable_amount)}</td>
                    <td className="px-4 py-2 text-right text-orange-600">{formatMoney(row.retained_amount ?? 0)}</td>
                    <td className="px-4 py-2 text-right text-emerald-600">{formatMoney(row.paid_amount)}</td>
                    <td className="px-4 py-2 text-right font-medium text-amber-600">{formatMoney(row.unpaid_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">付款记录</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">日期</th>
                <th className="px-4 py-2 text-left font-medium">班组</th>
                <th className="px-4 py-2 text-left font-medium">项目</th>
                <th className="px-4 py-2 text-left font-medium">关联结算单</th>
                <th className="px-4 py-2 text-left font-medium">方式</th>
                <th className="px-4 py-2 text-right font-medium">金额</th>
                <th className="px-4 py-2 text-left font-medium">备注</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    加载中...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    暂无付款记录
                  </td>
                </tr>
              ) : (
                filteredPayments.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground">{row.payment_date || (row.created_at || '').slice(0, 10) || '-'}</td>
                    <td className="px-4 py-2 text-foreground">{row.team_name || `班组#${row.team_id}`}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.project_name || '-'}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.settlement_id ? (row.settlement_no || `#${row.settlement_id}`) : <span className="text-muted-foreground/60">未关联</span>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{formatMethod(row.method)}</td>
                    <td className="px-4 py-2 text-right text-foreground">{formatMoney(row.payment_amount)}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[200px] truncate" title={row.remark || ''}>
                      {row.remark || '-'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void deletePayment(row)}
                        className="inline-flex items-center gap-1 text-destructive hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-card border border-border shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-base font-semibold text-foreground">记付款</div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">项目 *</label>
                <select
                  value={formProjectId}
                  onChange={(e) => {
                    setFormProjectId(e.target.value);
                    setFormTeamId('');
                  }}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="">请选择项目</option>
                  {projects.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">班组 *</label>
                <select
                  value={formTeamId}
                  onChange={(e) => setFormTeamId(e.target.value)}
                  disabled={!formProjectId}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">{formProjectId ? '请选择班组' : '先选项目'}</option>
                  {filteredTeams.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                      {t.work_type ? `（${t.work_type}）` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">关联结算单（可选，用于核销）</label>
                <select
                  value={formSettlementId}
                  onChange={(e) => setFormSettlementId(e.target.value)}
                  disabled={!formTeamId || loadingSettlements}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">{loadingSettlements ? '加载中...' : '不关联'}</option>
                  {teamSettlements.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.settlement_no || `#${s.id}`} · {s.settlement_month}
                      {typeof s.payable_amount === 'number' ? ` · 实付 ${formatMoney(s.payable_amount)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">金额 *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">付款日期</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">付款方式</label>
                <select
                  value={formMethod}
                  onChange={(e) => setFormMethod(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="bank">银行转账</option>
                  <option value="cash">现金</option>
                  <option value="wechat">微信</option>
                  <option value="alipay">支付宝</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">备注</label>
                <textarea
                  value={formRemark}
                  onChange={(e) => setFormRemark(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  placeholder="选填"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitPayment()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
