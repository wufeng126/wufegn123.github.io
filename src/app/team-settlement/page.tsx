'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
} from 'lucide-react';

type Project = { id: number | string; name: string; status?: string };
type TeamGroup = {
  id: number;
  project_id: number;
  project_name?: string;
  name: string;
  leader_name?: string;
  phone?: string;
  work_type?: string;
  status?: string;
  remark?: string;
};
type SettlementItem = {
  id?: number;
  content: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  amount?: number;
};
type SettlementSplit = {
  id?: number;
  worker_id: number;
  worker_name: string;
  work_type?: string;
  team_name?: string;
  work_hours: number;
  unit_price: number;
  amount?: number;
};
type TeamSettlement = {
  id: number;
  settlement_no?: string;
  settlement_month: string;
  period_start: string;
  period_end: string;
  project_name?: string;
  team_name?: string;
  status?: string;
  quantity_amount?: number;
  split_amount?: number;
  total_hours?: number;
  items?: SettlementItem[];
  splits?: SettlementSplit[];
};
type ItemTotal = {
  project_id: number;
  team_id: number | null;
  content: string;
  unit: string;
  quantity: number;
  amount: number;
};
type WorkerOption = {
  id: number;
  name: string;
  id_card?: string;
  work_type?: string;
  team_name?: string;
  attendance_hours: number;
};
type QuantityRow = {
  rowId: string;
  content: string;
  unit: string;
  quantity: string;
  unit_price: string;
};
type SplitRow = {
  rowId: string;
  worker_id: string;
  unit_price: string;
};

const emptySummary = { count: 0, quantity_amount: 0, split_amount: 0, total_hours: 0 };

function createRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newQuantityRow(): QuantityRow {
  return { rowId: createRowId(), content: '', unit: '', quantity: '', unit_price: '' };
}

function newSplitRow(): SplitRow {
  return { rowId: createRowId(), worker_id: '', unit_price: '' };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: unknown) {
  return `¥${toNumber(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value: unknown) {
  return toNumber(value).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  });
}

function statusText(status?: string) {
  if (status === 'inactive') return '停用';
  if (status === 'confirmed') return '已确认';
  if (status === 'draft') return '草稿';
  return '在场';
}

function maskIdCard(value?: string) {
  if (!value) return '-';
  if (value.length <= 8) return value;
  return `${value.slice(0, 3)}***********${value.slice(-4)}`;
}

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || '请求失败');
  }
  return json;
}

export default function TeamSettlementPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [settlements, setSettlements] = useState<TeamSettlement[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [itemTotals, setItemTotals] = useState<ItemTotal[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [projectId, setProjectId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [workType, setWorkType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [periodText, setPeriodText] = useState('');
  const [remark, setRemark] = useState('');
  const [quantityRows, setQuantityRows] = useState<QuantityRow[]>([newQuantityRow()]);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([newSplitRow()]);
  const [teamForm, setTeamForm] = useState({ name: '', leader_name: '', phone: '', work_type: '', remark: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectedProjectId = Number(projectId) || null;
  const selectedTeamId = Number(teamId) || null;

  const selectedTeam = useMemo(
    () => groups.find((group) => Number(group.id) === selectedTeamId),
    [groups, selectedTeamId],
  );

  const filteredGroups = useMemo(
    () => selectedProjectId ? groups.filter((group) => Number(group.project_id) === selectedProjectId) : groups,
    [groups, selectedProjectId],
  );

  const workerMap = useMemo(
    () => new Map(workers.map((worker) => [Number(worker.id), worker])),
    [workers],
  );

  const filteredWorkers = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return workers.filter((worker) => {
      if (workType && worker.work_type !== workType) return false;
      if (!text) return true;
      return [worker.name, worker.id_card, worker.work_type, worker.team_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [keyword, workType, workers]);

  const usedWorkerIds = useMemo(
    () => new Set(splitRows.map((row) => Number(row.worker_id)).filter(Boolean)),
    [splitRows],
  );

  const quantityPreview = useMemo(() => quantityRows.map((row) => {
    const quantity = toNumber(row.quantity);
    const unitPrice = toNumber(row.unit_price);
    const matchedTotal = itemTotals.find((item) => {
      const sameProject = !selectedProjectId || Number(item.project_id) === selectedProjectId;
      const sameTeam = !selectedTeamId || Number(item.team_id) === selectedTeamId;
      return sameProject
        && sameTeam
        && String(item.content || '') === row.content.trim()
        && String(item.unit || '') === row.unit.trim();
    });
    return {
      ...row,
      quantity,
      unitPrice,
      amount: round2(quantity * unitPrice),
      settledBefore: round2(toNumber(matchedTotal?.quantity)),
      cumulativeQuantity: round2(toNumber(matchedTotal?.quantity) + quantity),
    };
  }), [itemTotals, quantityRows, selectedProjectId, selectedTeamId]);

  const splitPreview = useMemo(() => splitRows.map((row) => {
    const worker = workerMap.get(Number(row.worker_id));
    const unitPrice = toNumber(row.unit_price);
    const hours = round2(toNumber(worker?.attendance_hours));
    return {
      ...row,
      worker,
      unitPrice,
      hours,
      amount: round2(hours * unitPrice),
    };
  }), [splitRows, workerMap]);

  const quantityTotal = useMemo(
    () => round2(quantityPreview.reduce((sum, row) => sum + row.amount, 0)),
    [quantityPreview],
  );
  const splitTotal = useMemo(
    () => round2(splitPreview.reduce((sum, row) => sum + row.amount, 0)),
    [splitPreview],
  );
  const totalHours = useMemo(
    () => round2(splitPreview.reduce((sum, row) => sum + row.hours, 0)),
    [splitPreview],
  );

  const loadProjects = useCallback(async () => {
    const json = await readJson(await fetch('/api/projects', { credentials: 'include' }));
    const list = Array.isArray(json.projects) ? json.projects : [];
    setProjects(list);
    setProjectId((current) => current || (list[0]?.id ? String(list[0].id) : ''));
  }, []);

  const loadGroups = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', String(selectedProjectId));
    const json = await readJson(await fetch(`/api/team-groups?${params.toString()}`, { credentials: 'include' }));
    const list = Array.isArray(json.data?.groups) ? json.data.groups : [];
    setGroups(list);
    setTeamId((current) => {
      if (current && list.some((group: TeamGroup) => String(group.id) === current)) return current;
      return list[0]?.id ? String(list[0].id) : '';
    });
  }, [selectedProjectId]);

  const loadSettlements = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', String(selectedProjectId));
    if (selectedTeamId) params.set('teamId', String(selectedTeamId));
    if (month) params.set('month', month);
    const json = await readJson(await fetch(`/api/team-settlements?${params.toString()}`, { credentials: 'include' }));
    setSettlements(Array.isArray(json.data?.settlements) ? json.data.settlements : []);
    setSummary(json.data?.summary || emptySummary);
    setItemTotals(Array.isArray(json.data?.item_totals) ? json.data.item_totals : []);
  }, [month, selectedProjectId, selectedTeamId]);

  const loadWorkers = useCallback(async () => {
    if (!selectedProjectId) {
      setWorkers([]);
      setWorkTypes([]);
      setPeriodText('');
      return;
    }
    const params = new URLSearchParams({
      mode: 'attendance',
      projectId: String(selectedProjectId),
      month,
    });
    const json = await readJson(await fetch(`/api/team-settlements?${params.toString()}`, { credentials: 'include' }));
    const data = json.data || {};
    setWorkers(Array.isArray(data.workers) ? data.workers : []);
    setWorkTypes(Array.isArray(data.work_types) ? data.work_types : []);
    setPeriodText(data.period_start && data.period_end ? `${data.period_start} 至 ${data.period_end}` : '');
  }, [month, selectedProjectId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      await Promise.all([loadGroups(), loadSettlements(), loadWorkers()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组结算数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadGroups, loadSettlements, loadWorkers]);

  useEffect(() => {
    void loadProjects().catch((error) => setMessage(error instanceof Error ? error.message : '项目加载失败'));
  }, [loadProjects]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (selectedTeam?.work_type && !workType) setWorkType(selectedTeam.work_type);
  }, [selectedTeam, workType]);

  function updateQuantity(rowId: string, field: keyof Omit<QuantityRow, 'rowId'>, value: string) {
    setQuantityRows((rows) => rows.map((row) => row.rowId === rowId ? { ...row, [field]: value } : row));
  }

  function updateSplit(rowId: string, field: keyof Omit<SplitRow, 'rowId'>, value: string) {
    setSplitRows((rows) => rows.map((row) => row.rowId === rowId ? { ...row, [field]: value } : row));
  }

  async function createTeam() {
    if (!selectedProjectId) {
      setMessage('请先选择项目');
      return;
    }
    if (!teamForm.name.trim()) {
      setMessage('请填写班组名称');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await readJson(await fetch('/api/team-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...teamForm, project_id: selectedProjectId }),
      }));
      setTeamForm({ name: '', leader_name: '', phone: '', work_type: '', remark: '' });
      await loadGroups();
      setMessage('班组档案已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组档案保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function createSettlement() {
    if (!selectedProjectId || !selectedTeamId) {
      setMessage('请先选择项目和班组');
      return;
    }
    const items = quantityRows
      .map((row) => ({
        content: row.content.trim(),
        unit: row.unit.trim(),
        quantity: toNumber(row.quantity),
        unit_price: toNumber(row.unit_price),
      }))
      .filter((row) => row.content && row.quantity > 0);
    const splits = splitRows
      .map((row) => ({
        worker_id: Number(row.worker_id),
        unit_price: toNumber(row.unit_price),
      }))
      .filter((row) => row.worker_id > 0);

    if (items.length === 0) {
      setMessage('请至少录入一条结算工程量');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await readJson(await fetch('/api/team-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_id: selectedProjectId,
          team_id: selectedTeamId,
          settlement_month: month,
          remark,
          items,
          splits,
        }),
      }));
      setQuantityRows([newQuantityRow()]);
      setSplitRows([newSplitRow()]);
      setRemark('');
      await Promise.all([loadSettlements(), loadWorkers()]);
      setMessage('班组结算单已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组结算单保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-3 text-[#1D2129] sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[#4E5969]">
              <FileSpreadsheet className="h-4 w-4 text-[#165DFF]" />
              独立班组结算
            </div>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">班组结算</h1>
            <p className="mt-1 text-sm text-[#86909C]">
              按项目建立班组档案，上部录结算工程量，下部分账自动带出施工日志出勤工时。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void reload()}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
            <button
              onClick={() => void createSettlement()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#165DFF] px-4 text-sm font-medium text-white hover:bg-[#0E49D8] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存结算单
            </button>
          </div>
        </header>

        {message && (
          <div className="rounded-md border border-[#CFE3FF] bg-[#F2F7FF] px-4 py-3 text-sm text-[#1D4ED8]">
            {message}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
            <div className="text-xs text-[#86909C]">本月结算单</div>
            <div className="mt-2 text-2xl font-semibold">{summary.count}</div>
            <div className="mt-1 text-xs text-[#4E5969]">{periodText || '按 26 日至次月 25 日统计'}</div>
          </div>
          <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
            <div className="text-xs text-[#86909C]">结算工程量金额</div>
            <div className="mt-2 text-2xl font-semibold">{formatMoney(summary.quantity_amount)}</div>
            <div className="mt-1 text-xs text-[#4E5969]">台账已确认金额</div>
          </div>
          <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
            <div className="text-xs text-[#86909C]">分账明细金额</div>
            <div className="mt-2 text-2xl font-semibold">{formatMoney(summary.split_amount)}</div>
            <div className="mt-1 text-xs text-[#4E5969]">工时 × 分账单价</div>
          </div>
          <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
            <div className="text-xs text-[#86909C]">出勤总工时</div>
            <div className="mt-2 text-2xl font-semibold">{formatNumber(summary.total_hours)}</div>
            <div className="mt-1 text-xs text-[#4E5969]">来自施工日志出勤</div>
          </div>
        </section>

        <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
          <div className="grid gap-3 border-b border-[#EEF0F5] p-4 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#86909C]">项目</span>
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]">
                <option value="">请选择项目</option>
                {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#86909C]">班组</span>
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]">
                <option value="">请选择班组</option>
                {filteredGroups.map((group) => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#86909C]">结算月份</span>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#86909C]">工种筛选</span>
              <select value={workType} onChange={(event) => setWorkType(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]">
                <option value="">全部工种</option>
                {workTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#EEF0F5] p-4">
              <div>
                <h2 className="font-semibold">班组档案</h2>
                <p className="mt-1 text-xs text-[#86909C]">班组必须归属当前项目。</p>
              </div>
              <Users className="h-5 w-5 text-[#165DFF]" />
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1">
              <input value={teamForm.name} onChange={(event) => setTeamForm((form) => ({ ...form, name: event.target.value }))} placeholder="班组名称" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
              <input value={teamForm.leader_name} onChange={(event) => setTeamForm((form) => ({ ...form, leader_name: event.target.value }))} placeholder="负责人" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
              <input value={teamForm.phone} onChange={(event) => setTeamForm((form) => ({ ...form, phone: event.target.value }))} placeholder="联系电话" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
              <input value={teamForm.work_type} onChange={(event) => setTeamForm((form) => ({ ...form, work_type: event.target.value }))} placeholder="工种" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
              <textarea value={teamForm.remark} onChange={(event) => setTeamForm((form) => ({ ...form, remark: event.target.value }))} placeholder="备注" className="min-h-20 rounded-md border border-[#DDE2EB] px-3 py-2 text-sm outline-none focus:border-[#165DFF] sm:col-span-2 xl:col-span-1" />
              <button onClick={() => void createTeam()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#165DFF] bg-white px-3 text-sm font-medium text-[#165DFF] hover:bg-[#F2F7FF] disabled:opacity-60 sm:col-span-2 xl:col-span-1">
                <Plus className="h-4 w-4" />
                新增班组
              </button>
            </div>
            <div className="max-h-[380px] divide-y divide-[#EEF0F5] overflow-auto border-t border-[#EEF0F5]">
              {loading ? (
                <div className="p-5 text-center text-sm text-[#86909C]">加载中...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="p-5 text-center text-sm text-[#86909C]">暂无班组档案</div>
              ) : filteredGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setTeamId(String(group.id))}
                  className={`block w-full px-4 py-3 text-left hover:bg-[#FAFBFF] ${String(group.id) === teamId ? 'bg-[#F2F7FF]' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{group.name}</div>
                      <div className="mt-1 truncate text-xs text-[#86909C]">{group.project_name || '当前项目'} / {group.work_type || '未填工种'}</div>
                    </div>
                    <span className="rounded-md bg-[#E8FFEA] px-2 py-1 text-xs text-[#00A870]">{statusText(group.status)}</span>
                  </div>
                  <div className="mt-2 text-xs text-[#4E5969]">
                    {group.leader_name || '未填负责人'} {group.phone ? ` · ${group.phone}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F5] p-4">
                <div>
                  <h2 className="font-semibold">新增结算单</h2>
                  <p className="mt-1 text-xs text-[#86909C]">结算周期：{periodText || '选择项目和月份后自动生成'}</p>
                </div>
                <div className="rounded-md bg-[#F2F7FF] px-3 py-2 text-right">
                  <div className="text-xs text-[#86909C]">本次合计金额</div>
                  <div className="mt-1 font-semibold text-[#165DFF]">{formatMoney(quantityTotal)}</div>
                </div>
              </div>

              <div className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">结算工程量</h3>
                    <p className="mt-1 text-xs text-[#86909C]">录入结算内容、工程量和单价，系统显示已结算工程量和累计结算量。</p>
                  </div>
                  <button onClick={() => setQuantityRows((rows) => [...rows, newQuantityRow()])} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#DDE2EB] px-3 text-xs font-medium text-[#165DFF]">
                    <Plus className="h-3.5 w-3.5" />
                    新增一行
                  </button>
                </div>
                <div className="overflow-x-auto rounded-md border border-[#EEF0F5]">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                      <tr>
                        <th className="px-3 py-3 text-left">结算内容</th>
                        <th className="px-3 py-3 text-left">单位</th>
                        <th className="px-3 py-3 text-right">本次工程量</th>
                        <th className="px-3 py-3 text-right">结算单价</th>
                        <th className="px-3 py-3 text-right">本次合计金额</th>
                        <th className="px-3 py-3 text-right">已结算工程量</th>
                        <th className="px-3 py-3 text-right">累计结算量</th>
                        <th className="px-3 py-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0F5]">
                      {quantityPreview.map((row) => (
                        <tr key={row.rowId}>
                          <td className="px-3 py-2"><input value={row.content} onChange={(event) => updateQuantity(row.rowId, 'content', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 outline-none focus:border-[#165DFF]" placeholder="如模板安装" /></td>
                          <td className="px-3 py-2"><input value={row.unit} onChange={(event) => updateQuantity(row.rowId, 'unit', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 outline-none focus:border-[#165DFF]" placeholder="m2" /></td>
                          <td className="px-3 py-2"><input value={row.quantity} onChange={(event) => updateQuantity(row.rowId, 'quantity', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 text-right outline-none focus:border-[#165DFF]" inputMode="decimal" /></td>
                          <td className="px-3 py-2"><input value={row.unit_price} onChange={(event) => updateQuantity(row.rowId, 'unit_price', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 text-right outline-none focus:border-[#165DFF]" inputMode="decimal" /></td>
                          <td className="px-3 py-2 text-right font-semibold text-[#165DFF]">{formatMoney(row.amount)}</td>
                          <td className="px-3 py-2 text-right text-[#4E5969]">{formatNumber(row.settledBefore)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatNumber(row.cumulativeQuantity)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => setQuantityRows((rows) => rows.length > 1 ? rows.filter((item) => item.rowId !== row.rowId) : rows)} aria-label="删除结算工程量" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#86909C] hover:bg-[#FFF1F0] hover:text-[#F53F3F]">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#FAFBFF] font-semibold">
                      <tr>
                        <td className="px-3 py-3" colSpan={4}>本次合计金额</td>
                        <td className="px-3 py-3 text-right text-[#165DFF]">{formatMoney(quantityTotal)}</td>
                        <td className="px-3 py-3" colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="border-t border-[#EEF0F5] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">分账明细</h3>
                    <p className="mt-1 text-xs text-[#86909C]">选择工人后自动显示结算周期内出勤总工时，分账金额 = 出勤总工时 × 单价。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86909C]" />
                      <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索工人" className="h-8 w-44 rounded-md border border-[#DDE2EB] pl-8 pr-2 text-xs outline-none focus:border-[#165DFF]" />
                    </div>
                    <button onClick={() => setSplitRows((rows) => [...rows, newSplitRow()])} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#DDE2EB] px-3 text-xs font-medium text-[#165DFF]">
                      <Plus className="h-3.5 w-3.5" />
                      新增分账
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-md border border-[#EEF0F5]">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                      <tr>
                        <th className="px-3 py-3 text-left">工人</th>
                        <th className="px-3 py-3 text-left">工种/班组</th>
                        <th className="px-3 py-3 text-left">身份证</th>
                        <th className="px-3 py-3 text-right">周期出勤总工时</th>
                        <th className="px-3 py-3 text-right">分账单价</th>
                        <th className="px-3 py-3 text-right">分账金额</th>
                        <th className="px-3 py-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0F5]">
                      {splitPreview.map((row) => (
                        <tr key={row.rowId}>
                          <td className="px-3 py-2">
                            <select value={row.worker_id} onChange={(event) => updateSplit(row.rowId, 'worker_id', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 outline-none focus:border-[#165DFF]">
                              <option value="">请选择工人</option>
                              {filteredWorkers.map((worker) => (
                                <option key={worker.id} value={String(worker.id)} disabled={usedWorkerIds.has(worker.id) && String(worker.id) !== row.worker_id}>
                                  {worker.name} / {worker.work_type || '未填工种'} / {formatNumber(worker.attendance_hours)} 小时
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-[#4E5969]">{[row.worker?.work_type, row.worker?.team_name].filter(Boolean).join(' / ') || '-'}</td>
                          <td className="px-3 py-2 text-[#4E5969]">{maskIdCard(row.worker?.id_card)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-[#165DFF]">{formatNumber(row.hours)}</td>
                          <td className="px-3 py-2"><input value={row.unit_price} onChange={(event) => updateSplit(row.rowId, 'unit_price', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 text-right outline-none focus:border-[#165DFF]" inputMode="decimal" /></td>
                          <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.amount)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => setSplitRows((rows) => rows.length > 1 ? rows.filter((item) => item.rowId !== row.rowId) : rows)} aria-label="删除分账人员" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#86909C] hover:bg-[#FFF1F0] hover:text-[#F53F3F]">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#FAFBFF] font-semibold">
                      <tr>
                        <td className="px-3 py-3" colSpan={3}>分账明细合计</td>
                        <td className="px-3 py-3 text-right text-[#165DFF]">{formatNumber(totalHours)}</td>
                        <td className="px-3 py-3"></td>
                        <td className="px-3 py-3 text-right">{formatMoney(splitTotal)}</td>
                        <td className="px-3 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <textarea value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="结算备注，可填写扣款、争议事项或现场说明" className="mt-3 min-h-20 w-full rounded-md border border-[#DDE2EB] px-3 py-2 text-sm outline-none focus:border-[#165DFF]" />
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EEF0F5] p-4">
            <div>
              <h2 className="font-semibold">班组结算台账</h2>
              <p className="mt-1 text-xs text-[#86909C]">按项目、班组和月份记录历史结算。</p>
            </div>
            <ClipboardList className="h-5 w-5 text-[#165DFF]" />
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                <tr>
                  <th className="px-4 py-3 text-left">结算单号</th>
                  <th className="px-4 py-3 text-left">项目</th>
                  <th className="px-4 py-3 text-left">班组</th>
                  <th className="px-4 py-3 text-left">月份</th>
                  <th className="px-4 py-3 text-left">周期</th>
                  <th className="px-4 py-3 text-right">结算金额</th>
                  <th className="px-4 py-3 text-right">分账金额</th>
                  <th className="px-4 py-3 text-right">总工时</th>
                  <th className="px-4 py-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF0F5]">
                {loading ? (
                  <tr><td colSpan={9} className="py-10 text-center text-[#86909C]">加载中...</td></tr>
                ) : settlements.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-[#86909C]">暂无班组结算记录</td></tr>
                ) : settlements.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3 font-medium">{row.settlement_no || `#${row.id}`}</td>
                    <td className="px-4 py-3 text-[#4E5969]">{row.project_name || '-'}</td>
                    <td className="px-4 py-3 text-[#4E5969]">{row.team_name || '-'}</td>
                    <td className="px-4 py-3 text-[#4E5969]">{row.settlement_month}</td>
                    <td className="px-4 py-3 text-[#4E5969]">{row.period_start} 至 {row.period_end}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.quantity_amount)}</td>
                    <td className="px-4 py-3 text-right text-[#4E5969]">{formatMoney(row.split_amount)}</td>
                    <td className="px-4 py-3 text-right text-[#4E5969]">{formatNumber(row.total_hours)}</td>
                    <td className="px-4 py-3 text-center"><span className="rounded-md bg-[#E8F3FF] px-2 py-1 text-xs text-[#165DFF]">{statusText(row.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-[#EEF0F5] md:hidden">
            {loading ? (
              <div className="p-5 text-center text-sm text-[#86909C]">加载中...</div>
            ) : settlements.length === 0 ? (
              <div className="p-5 text-center text-sm text-[#86909C]">暂无班组结算记录</div>
            ) : settlements.map((row) => (
              <article key={row.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{row.team_name || row.settlement_no || `#${row.id}`}</h3>
                    <p className="mt-1 truncate text-xs text-[#86909C]">{row.project_name || '-'} / {row.settlement_month}</p>
                  </div>
                  <span className="rounded-md bg-[#E8F3FF] px-2 py-1 text-xs text-[#165DFF]">{statusText(row.status)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-xs text-[#86909C]">结算金额</dt><dd className="mt-0.5 font-semibold">{formatMoney(row.quantity_amount)}</dd></div>
                  <div><dt className="text-xs text-[#86909C]">分账金额</dt><dd className="mt-0.5 text-[#4E5969]">{formatMoney(row.split_amount)}</dd></div>
                  <div><dt className="text-xs text-[#86909C]">总工时</dt><dd className="mt-0.5 text-[#4E5969]">{formatNumber(row.total_hours)}</dd></div>
                  <div><dt className="text-xs text-[#86909C]">周期</dt><dd className="mt-0.5 text-[#4E5969]">{row.period_start} 至 {row.period_end}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
