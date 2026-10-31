'use client';

import { useConfirm } from '@/hooks/use-confirm';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Check,
  ClipboardList,
  Download,
  FileSpreadsheet,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Send,
  Search,
  Trash2,
  Upload,
  Users,
  Eye,
  FileText,
  Paperclip,
} from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
  project_id?: number;
  team_id?: number;
  project_name?: string;
  team_name?: string;
  status?: string;
  remark?: string;
  created_by_name?: string;
  quantity_amount?: number;
  split_amount?: number;
  total_hours?: number;
  advance_deduct?: number;
  labor_insurance_deduct?: number;
  helper_deduct?: number;
  safety_fund_deduct?: number;
  deduction_total?: number;
  payable_amount?: number;
  payment_ratio?: number;
  planned_payment?: number;
  retained_amount?: number;
  paid_amount?: number;
  unpaid_amount?: number;
  paid_ratio?: number;
  team_paid_total?: number;
  team_unpaid_total?: number;
  items?: SettlementItem[];
  splits?: SettlementSplit[];
  // 审批流字段
  submitted_at?: string | null;
  submitted_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reject_reason?: string | null;
};
type TeamSettlementPayment = {
  id: number;
  settlement_id?: number;
  payment_amount?: number;
  method?: string;
  method_desc?: string;
  payment_date?: string;
  remark?: string;
  created_by_name?: string;
  created_at?: string;
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
  status?: string;
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
  amount: string;
};

const emptySummary = { count: 0, quantity_amount: 0, split_amount: 0, total_hours: 0, deduction_total: 0, payable_amount: 0, planned_payment: 0, retained_amount: 0, paid_amount: 0, unpaid_amount: 0 };

function createRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isInactiveWorker(status?: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return false;
  return !['in_service', 'active', '在场', '在岗'].includes(normalized);
}

type SettlementAttachment = {
  key: string;
  name: string;
  size?: number;
  type?: string;
  uploadedAt?: string;
};

function isImageFile(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
}

function formatFileSize(size?: number): string {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExt(name: string): string {
  const m = name.split('.').pop();
  return m ? m.toUpperCase() : 'FILE';
}

function newQuantityRow(): QuantityRow {
  return { rowId: createRowId(), content: '', unit: '', quantity: '', unit_price: '' };
}

function newSplitRow(): SplitRow {
  return { rowId: createRowId(), worker_id: '', amount: '' };
}

function DeductField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[#4E5969]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="h-10 w-full rounded-md border border-[#DDE2EB] px-3 text-right text-sm outline-none focus:border-[var(--color-primary)]"
      />
    </label>
  );
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 本地当天日期（YYYY-MM-DD），用于日期输入框默认值（避免 toISOString 的 UTC 偏差） */
function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
  return toNumber(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

/** 结算单状态配色：草稿灰 / 待审批橙 / 已审批绿 / 已驳回红 */
function statusBadgeClass(status?: string) {
  if (status === 'pending') return 'bg-[#FFF7E8] text-[#B35B00]';
  if (status === 'reviewed' || status === 'confirmed') return 'bg-[#E8FFEA] text-[#00A870]';
  if (status === 'rejected') return 'bg-[#FFECE8] text-[#CB2634]';
  if (status === 'draft') return 'bg-[#F2F3F5] text-[#4E5969]';
  return 'bg-[#E8F3FF] text-[var(--color-primary)]';
}

function statusText(status?: string) {
  if (status === 'inactive') return '停用';
  if (status === 'pending') return '待审批';
  if (status === 'reviewed') return '已审批';
  if (status === 'rejected') return '已驳回';
  if (status === 'confirmed') return '已审批';
  if (status === 'draft') return '草稿';
  return '在场';
}

const TAG_PALETTE = [
  { bg: '#E8F3FF', fg: '#165DFF' },
  { bg: '#E8FFEA', fg: '#00875A' },
  { bg: '#FFF4E8', fg: '#D25F00' },
  { bg: '#F0ECFF', fg: '#165DFF' },
  { bg: '#E6FFFB', fg: '#008B82' },
  { bg: '#FFE8F1', fg: '#C41D6B' },
  { bg: '#FFFBE6', fg: '#A96200' },
  { bg: '#E9F2FF', fg: '#3869D1' },
];

function tagColor(key?: string) {
  const value = String(key || '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length] || TAG_PALETTE[0];
}

function ColorTag({ label }: { label?: string }) {
  const text = label || '-';
  const palette = tagColor(text);
  return (
    <span className="inline-flex max-w-[220px] items-center rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: palette.bg, color: palette.fg }}>
      <span className="truncate">{text}</span>
    </span>
  );
}

function formatMethod(method?: string) {
  const map: Record<string, string> = {
    bank: '银行转账',
    cash: '现金',
    check: '支票',
    transfer: '转账',
    wechat: '微信',
    alipay: '支付宝',
    other: '其他',
  };
  return method ? map[method] || method : '-';
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

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[#F5F6FA] p-3 text-[#1D2129] sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">{children}</div>
    </div>
  );
}

function SubNav() {
  const pathname = usePathname();
  const items = [
    { href: '/team-management/groups', label: '班组档案', icon: Users },
    { href: '/team-management/settlements', label: '班组结算', icon: FileSpreadsheet },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium ${
              active
                ? 'border-[var(--color-primary)] bg-[#F2F7FF] text-[var(--color-primary)]'
                : 'border-[#DDE2EB] bg-white text-[#4E5969] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm text-[#4E5969]">
          <FileSpreadsheet className="h-4 w-4 text-[var(--color-primary)]" />
          {eyebrow}
        </div>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-[#86909C]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubNav />
        {action}
      </div>
    </header>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-md border border-[#CFE3FF] bg-[#F2F7FF] px-4 py-3 text-sm text-[#1D4ED8]">
      {children}
    </div>
  );
}

function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState('');

  const loadProjects = useCallback(async () => {
    const json = await readJson(await fetch('/api/projects', { credentials: 'include' }));
    setProjects(Array.isArray(json.projects) ? json.projects : []);
  }, []);

  useEffect(() => {
    void loadProjects().catch((error) => setMessage(error instanceof Error ? error.message : '项目加载失败'));
  }, [loadProjects]);

  return { projects, projectMessage: message, reloadProjects: loadProjects };
}

export function TeamGroupsPageClient() {
  const { projects, projectMessage } = useProjects();
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [projectId, setProjectId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [teamForm, setTeamForm] = useState({ name: '', leader_name: '', phone: '', work_type: '', remark: '' });
  const [formProjectId, setFormProjectId] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');

  const selectedProjectId = Number(projectId) || null;

  const loadGroups = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', String(selectedProjectId));
    const json = await readJson(await fetch(`/api/team-groups?${params.toString()}`, { credentials: 'include' }));
    setGroups(Array.isArray(json.data?.groups) ? json.data.groups : []);
  }, [selectedProjectId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      await loadGroups();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组档案加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadGroups]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredGroups = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return groups.filter((group) => {
      if (!text) return true;
      return [group.name, group.project_name, group.leader_name, group.phone, group.work_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [groups, keyword]);

  const projectCount = useMemo(() => new Set(filteredGroups.map((group) => group.project_id).filter(Boolean)).size, [filteredGroups]);

  function openCreate() {
    setEditingGroupId(null);
    setTeamForm({ name: '', leader_name: '', phone: '', work_type: '', remark: '' });
    setFormProjectId(selectedProjectId ? String(selectedProjectId) : (projects[0]?.id ? String(projects[0].id) : ''));
    setMessage('');
    setDialogOpen(true);
  }

  function startEdit(group: TeamGroup) {
    setEditingGroupId(group.id);
    setConfirmDeleteId(null);
    setFormProjectId(String(group.project_id || ''));
    setTeamForm({
      name: group.name || '',
      leader_name: group.leader_name || '',
      phone: group.phone || '',
      work_type: group.work_type || '',
      remark: group.remark || '',
    });
    setMessage('');
    setDialogOpen(true);
  }

  function cancelEdit() {
    setDialogOpen(false);
    setEditingGroupId(null);
    setTeamForm({ name: '', leader_name: '', phone: '', work_type: '', remark: '' });
    setMessage('');
  }

  async function saveTeam() {
    const pid = Number(formProjectId) || null;
    if (!pid) {
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
      if (editingGroupId) {
        await readJson(await fetch('/api/team-groups', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...teamForm, id: editingGroupId, project_id: pid }),
        }));
        setMessage('班组档案已更新');
      } else {
        await readJson(await fetch('/api/team-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...teamForm, project_id: pid }),
        }));
        setMessage('班组档案已保存');
      }
      setDialogOpen(false);
      setEditingGroupId(null);
      setTeamForm({ name: '', leader_name: '', phone: '', work_type: '', remark: '' });
      await loadGroups();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组档案保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(group: TeamGroup) {
    setDeleting(true);
    setMessage('');
    try {
      await readJson(await fetch(`/api/team-groups?id=${group.id}`, {
        method: 'DELETE',
        credentials: 'include',
      }));
      setConfirmDeleteId(null);
      if (editingGroupId === group.id) cancelEdit();
      await loadGroups();
      setMessage('班组档案已删除');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组档案删除失败');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageShell>
      <Header
        eyebrow="班组管理"
        title="班组档案"
        description="班组先归属到具体项目，后续结算单按项目和班组独立建账。"
        action={(
          <>
            <button onClick={() => void reload()} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)]">
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
            <button onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]">
              <Plus className="h-4 w-4" />
              新增班组
            </button>
          </>
        )}
      />
      <Message>{projectMessage || message}</Message>

      <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#EEF0F5] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="group-project-filter" className="shrink-0 text-xs font-medium text-[#86909C]">全部项目</label>
              <select
                id="group-project-filter"
                aria-label="按项目筛选"
                value={projectId}
                onChange={(event) => { setProjectId(event.target.value); }}
                className="h-9 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">全部项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={String(project.id)}>{project.name}</option>
                ))}
              </select>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索班组、负责人、工种" className="h-9 w-full rounded-md border border-[#DDE2EB] pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
          <p className="text-xs text-[#86909C]">共 {filteredGroups.length} 个班组 · 涉及 {projectCount} 个项目</p>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
              <tr>
                <th className="px-4 py-3 text-left">班组名称</th>
                <th className="px-4 py-3 text-left">所属项目</th>
                <th className="px-4 py-3 text-left">负责人</th>
                <th className="px-4 py-3 text-left">联系电话</th>
                <th className="px-4 py-3 text-left">工种</th>
                <th className="px-4 py-3 text-center">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF0F5]">
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-[#86909C]">加载中...</td></tr>
              ) : filteredGroups.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-[#86909C]">暂无班组档案</td></tr>
              ) : filteredGroups.map((group) => (
                <tr key={group.id} className="hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{group.name}</td>
                  <td className="px-4 py-3"><ColorTag label={group.project_name} /></td>
                  <td className="px-4 py-3 text-[#4E5969]">{group.leader_name || '-'}</td>
                  <td className="px-4 py-3 text-[#4E5969]">{group.phone || '-'}</td>
                  <td className="px-4 py-3"><ColorTag label={group.work_type} /></td>
                  <td className="px-4 py-3 text-center"><span className="rounded-md bg-[#E8FFEA] px-2 py-1 text-xs text-[#00A870]">{statusText(group.status)}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {confirmDeleteId === group.id ? (
                        <>
                          <button onClick={() => void confirmDelete(group)} disabled={deleting} className="inline-flex h-7 items-center rounded px-2 text-xs text-white bg-[var(--color-danger)] hover:bg-[#D92D20] disabled:opacity-60">
                            {deleting ? '删除中' : '确认删除'}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} disabled={deleting} className="inline-flex h-7 items-center rounded px-2 text-xs text-[#4E5969] hover:bg-[#F2F3F5]">
                            取消
                          </button>
                        </>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button aria-label="更多操作" className="inline-flex h-7 w-7 items-center justify-center rounded px-1 text-[#4E5969] hover:bg-[#F2F3F5] hover:text-[var(--color-primary)]">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[120px]">
                            <DropdownMenuItem onSelect={() => startEdit(group)}>
                              <Pencil className="mr-2 h-4 w-4" />编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-[var(--color-danger)]" onSelect={() => setConfirmDeleteId(group.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#EEF0F5] md:hidden">
          {loading ? (
            <div className="p-5 text-center text-sm text-[#86909C]">加载中...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-5 text-center text-sm text-[#86909C]">暂无班组档案</div>
          ) : filteredGroups.map((group) => (
            <article key={group.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{group.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ColorTag label={group.project_name} />
                    <ColorTag label={group.work_type} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-md bg-[#E8FFEA] px-2 py-1 text-xs text-[#00A870]">{statusText(group.status)}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button aria-label="更多操作" className="inline-flex h-7 w-7 items-center justify-center rounded px-1 text-[#4E5969] hover:bg-[#F2F3F5] hover:text-[var(--color-primary)]">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[120px]">
                      <DropdownMenuItem onSelect={() => startEdit(group)}>
                        <Pencil className="mr-2 h-4 w-4" />编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-[var(--color-danger)]" onSelect={() => setConfirmDeleteId(group.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="mt-2 text-sm text-[#4E5969]">{group.leader_name || '未填负责人'} {group.phone ? ` · ${group.phone}` : ''}</div>
              {confirmDeleteId === group.id ? (
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => void confirmDelete(group)} disabled={deleting} className="inline-flex h-9 items-center rounded-md bg-[var(--color-danger)] px-3 text-xs text-white hover:bg-[#D92D20] disabled:opacity-60">
                    {deleting ? '删除中' : '确认删除'}
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} disabled={deleting} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] px-3 text-xs text-[#4E5969]">
                    取消
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) cancelEdit(); else setDialogOpen(true); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGroupId ? '编辑班组' : '新增班组'}</DialogTitle>
            <DialogDescription className="text-xs text-[#86909C]">每个班组必须归属一个项目。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#86909C]">所属项目 *</span>
              <select value={formProjectId} onChange={(event) => setFormProjectId(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
                <option value="">请选择项目</option>
                {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
              </select>
            </label>
            <input value={teamForm.name} onChange={(event) => setTeamForm((form) => ({ ...form, name: event.target.value }))} placeholder="班组名称 *" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input value={teamForm.leader_name} onChange={(event) => setTeamForm((form) => ({ ...form, leader_name: event.target.value }))} placeholder="负责人" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input value={teamForm.phone} onChange={(event) => setTeamForm((form) => ({ ...form, phone: event.target.value }))} placeholder="联系电话" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input value={teamForm.work_type} onChange={(event) => setTeamForm((form) => ({ ...form, work_type: event.target.value }))} placeholder="工种（如：泥工、钢筋工）" className="h-10 rounded-md border border-[#DDE2EB] px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
            <textarea value={teamForm.remark} onChange={(event) => setTeamForm((form) => ({ ...form, remark: event.target.value }))} placeholder="备注" className="min-h-20 rounded-md border border-[#DDE2EB] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button onClick={cancelEdit} disabled={saving} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-4 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)] disabled:opacity-60">
              取消
            </button>
            <button onClick={() => void saveTeam()} disabled={saving} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingGroupId ? '保存修改' : '新增班组'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function SettlementFilters({
  projects,
  groups,
  projectId,
  teamId,
  month,
  onProjectId,
  onTeamId,
  onMonth,
}: {
  projects: Project[];
  groups: TeamGroup[];
  projectId: string;
  teamId: string;
  month: string;
  onProjectId: (value: string) => void;
  onTeamId: (value: string) => void;
  onMonth: (value: string) => void;
}) {
  return (
    <section className="grid gap-3 rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm md:grid-cols-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[#86909C]">项目</span>
        <select value={projectId} onChange={(event) => onProjectId(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
          <option value="">全部项目</option>
          {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[#86909C]">班组</span>
        <select value={teamId} onChange={(event) => onTeamId(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
          <option value="">全部班组</option>
          {groups.map((group) => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[#86909C]">结算月份 <span className="text-[#C0C6CF]">（留空=全部）</span></span>
        <input type="month" value={month} onChange={(event) => onMonth(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
      </label>
    </section>
  );
}

export function TeamSettlementLedgerPageClient() {
  const { projects, projectMessage } = useProjects();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [settlements, setSettlements] = useState<TeamSettlement[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'detail' || urlView === 'summary') return urlView;
    // 手机默认进「结算明细」卡片视图，避免一进来就是需要左右拖的宽表
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return 'detail';
    return 'summary';
  });
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [teamId, setTeamId] = useState(searchParams.get('teamId') || '');
  // 月份默认空（全部月份），仅用户主动选择时才按月份筛选
  const [month, setMonth] = useState(searchParams.get('month') || '');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [paySettlement, setPaySettlement] = useState<TeamSettlement | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bank');
  const [payDate, setPayDate] = useState(todayISO());
  const [payRemark, setPayRemark] = useState('');
  const [payMessage, setPayMessage] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  // 审批流：驳回弹窗 + 状态筛选 + 当前用户权限（提交/审批/删除按钮按权限显示）
  const confirmDialog = useConfirm();
  const [rejectSettlement, setRejectSettlement] = useState<TeamSettlement | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  // 提交审批：选择下一级审批人
  const [approverTarget, setApproverTarget] = useState<TeamSettlement | null>(null);
  const [approverOptions, setApproverOptions] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [selectedApproverId, setSelectedApproverId] = useState(0);
  const [approverLoading, setApproverLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const selectedProjectId = Number(projectId) || null;
  const selectedTeamId = Number(teamId) || null;

  useEffect(() => {
    (async () => {
      try {
        const json = await readJson(await fetch('/api/auth/me', { credentials: 'include' }));
        const user = json?.user || json?.data;
        setPermissions(Array.isArray(user?.permissions) ? user.permissions : []);
        setIsSuperAdmin(user?.role === 'super_admin');
      } catch {
        // 权限加载失败按无权限处理（后端仍会二次校验）
      }
    })();
  }, []);

  const canSubmitSettlement = isSuperAdmin || permissions.includes('team_settlements:submit');
  const canApproveSettlement = isSuperAdmin || permissions.includes('team_settlements:approve');
  const canDeleteSettlement = isSuperAdmin || permissions.includes('team_settlements:delete');
  const canEditSettlement = isSuperAdmin || permissions.includes('team_settlements:edit');

  const loadGroups = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', String(selectedProjectId));
    const json = await readJson(await fetch(`/api/team-groups?${params.toString()}`, { credentials: 'include' }));
    const list = Array.isArray(json.data?.groups) ? json.data.groups : [];
    setGroups(list);
    setTeamId((current) => current && list.some((group: TeamGroup) => String(group.id) === current) ? current : '');
  }, [selectedProjectId]);

  const loadSettlements = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', String(selectedProjectId));
    if (selectedTeamId) params.set('teamId', String(selectedTeamId));
    // 汇总视图展示全项目累计，不按月份过滤；仅明细视图按月份筛选
    if (viewMode !== 'summary' && month) params.set('month', month);
    const json = await readJson(await fetch(`/api/team-settlements?${params.toString()}`, { credentials: 'include' }));
    setSettlements(Array.isArray(json.data?.settlements) ? json.data.settlements : []);
    setSummary(json.data?.summary || emptySummary);
  }, [month, selectedProjectId, selectedTeamId, viewMode]);

  const reload = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      await Promise.all([loadGroups(), loadSettlements()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组结算加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadGroups, loadSettlements]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const projectSummary = useMemo(() => {
    const map = new Map<string, { project_name: string; count: number; quantity_amount: number; paid_amount: number; unpaid_amount: number }>();
    const teamSeen = new Map<string, Set<number>>();
    settlements.forEach((row) => {
      const name = row.project_name || '未分配项目';
      const entry = map.get(name) || { project_name: name, count: 0, quantity_amount: 0, paid_amount: 0, unpaid_amount: 0 };
      entry.count += 1;
      entry.quantity_amount += toNumber(row.quantity_amount);
      const tid = Number(row.team_id || 0);
      if (tid > 0) {
        const seen = teamSeen.get(name) || new Set<number>();
        if (!seen.has(tid)) {
          seen.add(tid);
          teamSeen.set(name, seen);
          entry.paid_amount += toNumber(row.team_paid_total);
          entry.unpaid_amount += toNumber(row.team_unpaid_total);
        }
      } else {
        entry.paid_amount += toNumber(row.paid_amount);
        entry.unpaid_amount += toNumber(row.unpaid_amount);
      }
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.unpaid_amount - a.unpaid_amount);
  }, [settlements]);

  const visibleSettlements = statusFilter
    ? settlements.filter((row) => (row.status || 'draft') === statusFilter)
    : settlements;

  async function handleSettlementWorkflow(settlement: TeamSettlement, action: 'submit' | 'withdraw' | 'approve' | 'unapprove') {
    // 提交审批：先选下一级审批人
    if (action === 'submit') {
      setApproverTarget(settlement);
      setSelectedApproverId(0);
      if (approverOptions.length === 0) {
        try {
          const json = await readJson(await fetch('/api/users/options', { credentials: 'include' }));
          const options = ((json as { data?: { options?: Array<{ id: number; name: string; role: string }> } })?.data?.options || []);
          setApproverOptions(Array.isArray(options) ? options : []);
        } catch {
          setApproverOptions([]);
        }
      }
      return;
    }
    if (action === 'approve' && !(await confirmDialog({ title: '确认审批通过', description: `确认审批通过结算单 ${settlement.settlement_no || `#${settlement.id}`}？通过后将计入成本并生成分账应发工资`, variant: 'default' }))) return;
    if (action === 'unapprove' && !(await confirmDialog({ title: '确认反审核', description: `确认反审核结算单 ${settlement.settlement_no || `#${settlement.id}`}？将退回待审批状态，并撤销该结算生成的分账工资`, variant: 'destructive' }))) return;
    setMessage('');
    try {
      const json = await readJson(await fetch('/api/team-settlements/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settlement_id: settlement.id, action }),
      }));
      const revoked = Number((json as { revoked_salary_count?: number })?.revoked_salary_count || 0);
      setMessage(
        action === 'approve' ? '审批通过，已计入成本'
          : action === 'unapprove' ? `已反审核，退回待审批${revoked > 0 ? `（已撤销 ${revoked} 条分账工资）` : ''}`
          : '已撤回',
      );
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  }

  async function submitWithApprover() {
    if (!approverTarget) return;
    if (!selectedApproverId) { setMessage('请选择下一级审批人'); return; }
    setApproverLoading(true);
    setMessage('');
    try {
      const approver = approverOptions.find((option) => option.id === selectedApproverId);
      await readJson(await fetch('/api/team-settlements/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          settlement_id: approverTarget.id,
          action: 'submit',
          approverUserId: selectedApproverId,
          approverName: approver?.name || '',
        }),
      }));
      setApproverTarget(null);
      setSelectedApproverId(0);
      setMessage(`已提交审批，审批人：${approver?.name || ''}`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败');
    } finally {
      setApproverLoading(false);
    }
  }

  async function submitReject() {
    if (!rejectSettlement) return;
    if (!rejectReason.trim()) { setMessage('请填写驳回原因'); return; }
    setRejectLoading(true);
    try {
      await readJson(await fetch('/api/team-settlements/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settlement_id: rejectSettlement.id, action: 'reject', reason: rejectReason.trim() }),
      }));
      setRejectSettlement(null);
      setRejectReason('');
      setMessage('已驳回，预算员可修改后重新提交');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '驳回失败');
    } finally {
      setRejectLoading(false);
    }
  }

  async function handleDeleteSettlement(settlement: TeamSettlement) {
    if (!(await confirmDialog({
      title: '确认删除结算单',
      description: `确认删除结算单 ${settlement.settlement_no || `#${settlement.id}`}？删除后不可恢复`,
      variant: 'destructive',
    }))) return;
    try {
      await readJson(await fetch(`/api/team-settlements/${settlement.id}`, { method: 'DELETE', credentials: 'include' }));
      setMessage('结算单已删除');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    }
  }

  function drillToProject(projectName: string) {
    const project = projects.find((item) => item.name === projectName);
    if (project) setProjectId(String(project.id));
    setViewMode('detail');
  }

  async function submitLedgerPayment() {
    if (!paySettlement) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setPayMessage('请输入有效付款金额');
      return;
    }
    setPayLoading(true);
    setPayMessage('');
    try {
      await readJson(await fetch('/api/team-settlement-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          team_id: paySettlement.team_id,
          settlement_id: paySettlement.id,
          payment_amount: amount,
          method: payMethod,
          payment_date: payDate || undefined,
          remark: payRemark || undefined,
        }),
      }));
      setPaySettlement(null);
      setPayAmount('');
      setPayRemark('');
      setPayMethod('bank');
      setPayMessage('');
      await reload();
    } catch (error) {
      setPayMessage(error instanceof Error ? error.message : '付款保存失败');
    } finally {
      setPayLoading(false);
    }
  }

  return (
    <PageShell>
      <Header
        eyebrow="班组管理"
        title="班组结算台账"
        description="台账只保留历史结算记录；新增结算单和详情查看进入独立页面。"
        action={(
          <>
            <button onClick={() => void reload()} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)]">
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
            <Link href="/team-management/settlements/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]">
              <Plus className="h-4 w-4" />
              新增结算单
            </Link>
          </>
        )}
      />
      <Message>{projectMessage || message}</Message>

      <div className="inline-flex rounded-lg border border-[#E5E8EF] bg-white p-1 shadow-sm">
        <button
          onClick={() => { setViewMode('summary'); setProjectId(''); }}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${viewMode === 'summary' ? 'bg-[var(--color-primary)] text-white' : 'text-[#4E5969] hover:bg-[#F7F8FA]'}`}
        >
          <BarChart3 className="h-3.5 w-3.5" />按项目汇总
        </button>
        <button
          onClick={() => setViewMode('detail')}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${viewMode === 'detail' ? 'bg-[var(--color-primary)] text-white' : 'text-[#4E5969] hover:bg-[#F7F8FA]'}`}
        >
          <List className="h-3.5 w-3.5" />结算明细
        </button>
      </div>

      {viewMode === 'detail' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#86909C]">状态筛选：</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
            <option value="">全部</option>
            <option value="draft">草稿</option>
            <option value="pending">待审批</option>
            <option value="reviewed">已审批</option>
            <option value="rejected">已驳回</option>
          </select>
          <span className="text-xs text-[#86909C]">审批流：草稿 → 提交审批 → 老板通过后计入成本</span>
        </div>
      )}

      {viewMode === 'detail' && settlements.filter((row) => ['draft', 'rejected'].includes(row.status || 'draft')).length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#FFE4BA] bg-[#FFF7E8] px-3 py-2 text-xs text-[#B35B00]">
          <span>
            有 {settlements.filter((row) => ['draft', 'rejected'].includes(row.status || 'draft')).length} 张结算单是草稿/已驳回，尚未提交审批
          </span>
          <button type="button" onClick={() => setStatusFilter('draft')} className="font-medium text-[var(--color-primary)]">
            只看未提交
          </button>
        </div>
      )}

      {viewMode === 'summary' ? (
        <section className="mt-3 rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EEF0F5] p-4">
            <div>
              <h2 className="font-semibold">按项目汇总（全项目累计）</h2>
              <p className="mt-1 text-xs text-[#86909C]">每个项目各班组按结算累计值汇总；点击项目可下钻查看该项目结算明细。</p>
            </div>
            <ClipboardList className="h-5 w-5 text-[var(--color-primary)]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                <tr>
                  <th className="px-4 py-3 text-left">项目</th>
                  <th className="px-4 py-3 text-right">结算单数</th>
                  <th className="px-4 py-3 text-right">结算金额</th>
                  <th className="px-4 py-3 text-right">累计已付</th>
                  <th className="px-4 py-3 text-right">累计未付</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF0F5]">
                {loading ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#86909C]">加载中...</td></tr>
                ) : projectSummary.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#86909C]">暂无班组结算记录</td></tr>
                ) : projectSummary.map((row) => (
                  <tr key={row.project_name} className="hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3 font-medium">{row.project_name}</td>
                    <td className="px-4 py-3 text-right">{row.count}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.quantity_amount)}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-success)]">{formatMoney(row.paid_amount)}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-danger)]">{formatMoney(row.unpaid_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => drillToProject(row.project_name)} className="text-sm font-medium text-[var(--color-primary)] hover:underline">查看明细</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">结算单数</div>
          <div className="mt-2 text-2xl font-semibold">{summary.count}</div>
        </div>
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">结算工程量金额</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(summary.quantity_amount)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">分账明细金额</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(summary.split_amount)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">出勤总工时</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(summary.total_hours)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">扣款合计</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-danger)]">{formatMoney(summary.deduction_total)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">实付金额</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(summary.payable_amount)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">本期计划付款</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-success)]">{formatMoney(summary.planned_payment)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm">
          <div className="text-xs text-[#86909C]">尾款/预留款</div>
          <div className="mt-2 text-2xl font-semibold text-[#FF7D00]">{formatMoney(summary.retained_amount)}</div>
        </div>
      </section>

      {viewMode === 'detail' && (<>
      <SettlementFilters
        projects={projects}
        groups={groups}
        projectId={projectId}
        teamId={teamId}
        month={month}
        onProjectId={setProjectId}
        onTeamId={setTeamId}
        onMonth={setMonth}
      />

      <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EEF0F5] p-4">
          <div>
            <h2 className="font-semibold">结算台账</h2>
            <p className="mt-1 text-xs text-[#86909C]">点击查看可进入结算单详情、下载和打印。</p>
          </div>
          <ClipboardList className="h-5 w-5 text-[var(--color-primary)]" />
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
              <tr>
                <th className="px-4 py-3 text-left">结算单号</th>
                <th className="px-4 py-3 text-left">项目</th>
                <th className="px-4 py-3 text-left">班组</th>
                <th className="px-4 py-3 text-left">月份</th>
                <th className="px-4 py-3 text-left">周期</th>
                <th className="px-4 py-3 text-right">结算金额</th>
                <th className="px-4 py-3 text-right">扣款合计</th>
                <th className="px-4 py-3 text-right">实付金额</th>
                <th className="px-4 py-3 text-right">付款比例</th>
                <th className="px-4 py-3 text-right">本期计划付</th>
                <th className="px-4 py-3 text-right">尾款/预留</th>
                <th className="px-4 py-3 text-right">班组已付</th>
                <th className="px-4 py-3 text-right">班组未付</th>
                <th className="px-4 py-3 text-right">分账金额</th>
                <th className="px-4 py-3 text-right">总工时</th>
                <th className="px-4 py-3 text-center">状态</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF0F5]">
              {loading ? (
                <tr><td colSpan={17} className="py-10 text-center text-[#86909C]">加载中...</td></tr>
              ) : visibleSettlements.length === 0 ? (
                <tr><td colSpan={17} className="py-10 text-center text-[#86909C]">暂无班组结算记录</td></tr>
              ) : visibleSettlements.map((row) => (
                <tr key={row.id} className="hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{row.settlement_no || `#${row.id}`}</td>
                  <td className="px-4 py-3 text-[#4E5969]">{row.project_name || '-'}</td>
                  <td className="px-4 py-3 text-[#4E5969]">{row.team_name || '-'}</td>
                  <td className="px-4 py-3 text-[#4E5969]">{row.settlement_month}</td>
                  <td className="px-4 py-3 text-[#4E5969]">{row.period_start} 至 {row.period_end}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.quantity_amount)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-danger)]">{formatMoney(row.deduction_total)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.payable_amount)}</td>
                  <td className="px-4 py-3 text-right text-[#4E5969]">{formatNumber(row.payment_ratio ?? 100)}%</td>
                  <td className="px-4 py-3 text-right text-[var(--color-success)]">{formatMoney(row.planned_payment ?? row.payable_amount)}</td>
                  <td className="px-4 py-3 text-right text-[#FF7D00]">{formatMoney(row.retained_amount ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-success)]">{formatMoney(row.team_paid_total ?? row.paid_amount ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-danger)]">{formatMoney(row.team_unpaid_total ?? row.unpaid_amount ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-[#4E5969]">{formatMoney(row.split_amount)}</td>
                  <td className="px-4 py-3 text-right text-[#4E5969]">{formatNumber(row.total_hours)}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-md px-2 py-1 text-xs ${statusBadgeClass(row.status)}`}>{statusText(row.status)}</span></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Link href={`/team-management/settlements/${row.id}`} className="text-sm font-medium text-[var(--color-primary)] hover:underline">查看详情</Link>
                      {(['draft', 'rejected'].includes(row.status || 'draft')) && canEditSettlement && (
                        <Link href={`/team-management/settlements/${row.id}/edit`} className="text-sm font-medium text-[var(--color-primary)] hover:underline">编辑</Link>
                      )}
                      {(row.status || 'draft') !== 'pending' && (row.status || 'draft') !== 'reviewed' && canSubmitSettlement && (
                        <button onClick={() => handleSettlementWorkflow(row, 'submit')} className="text-sm font-medium text-[var(--color-primary)] hover:underline">提交审批</button>
                      )}
                      {row.status === 'pending' && canSubmitSettlement && (
                        <button onClick={() => handleSettlementWorkflow(row, 'withdraw')} className="text-sm font-medium text-[#86909C] hover:underline">撤回</button>
                      )}
                      {row.status === 'pending' && canApproveSettlement && (
                        <>
                          <button onClick={() => handleSettlementWorkflow(row, 'approve')} className="text-sm font-medium text-[var(--color-success)] hover:underline">通过</button>
                          <button onClick={() => { setRejectSettlement(row); setRejectReason(''); }} className="text-sm font-medium text-[var(--color-danger)] hover:underline">驳回</button>
                        </>
                      )}
                      {row.status === 'reviewed' && canApproveSettlement && (
                        <button onClick={() => handleSettlementWorkflow(row, 'unapprove')} className="text-sm font-medium text-[#86909C] hover:underline">反审核</button>
                      )}
                      {row.status === 'reviewed' && (
                        <button onClick={() => { setPaySettlement(row); setPayAmount(String(row.planned_payment ?? row.unpaid_amount ?? '')); setPayRemark(''); setPayMethod('bank'); setPayDate(todayISO()); setPayMessage(''); }} className="text-sm font-medium text-[var(--color-success)] hover:underline">记付款</button>
                      )}
                      {(['draft', 'rejected', 'pending'].includes(row.status || 'draft')) && canDeleteSettlement && (
                        <button onClick={() => handleDeleteSettlement(row)} className="text-sm font-medium text-[var(--color-danger)] hover:underline">删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#EEF0F5] md:hidden">
          {loading ? (
            <div className="p-5 text-center text-sm text-[#86909C]">加载中...</div>
          ) : visibleSettlements.length === 0 ? (
            <div className="p-5 text-center text-sm text-[#86909C]">暂无班组结算记录</div>
          ) : visibleSettlements.map((row) => (
            <article key={row.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{row.team_name || row.settlement_no || `#${row.id}`}</h3>
                  <p className="mt-1 truncate text-xs text-[#86909C]">{row.project_name || '-'} / {row.settlement_month}</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs ${statusBadgeClass(row.status)}`}>{statusText(row.status)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-[#86909C]">结算金额（计入成本）</dt><dd className="mt-0.5 font-semibold">{formatMoney(row.quantity_amount)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">扣款合计</dt><dd className="mt-0.5 text-[var(--color-danger)]">{formatMoney(row.deduction_total)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">实付金额</dt><dd className="mt-0.5 font-semibold">{formatMoney(row.payable_amount)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">付款比例/计划付</dt><dd className="mt-0.5 text-[var(--color-success)]">{formatNumber(row.payment_ratio ?? 100)}% / {formatMoney(row.planned_payment ?? row.payable_amount)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">尾款/预留</dt><dd className="mt-0.5 text-[#FF7D00]">{formatMoney(row.retained_amount ?? 0)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">分账金额</dt><dd className="mt-0.5 text-[#4E5969]">{formatMoney(row.split_amount)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">总工时</dt><dd className="mt-0.5 text-[#4E5969]">{formatNumber(row.total_hours)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">周期</dt><dd className="mt-0.5 text-[#4E5969]">{row.period_start} 至 {row.period_end}</dd></div>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/team-management/settlements/${row.id}`} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] px-3 text-sm font-medium text-[var(--color-primary)]">查看详情</Link>
                {(row.status || 'draft') !== 'pending' && (row.status || 'draft') !== 'reviewed' && canSubmitSettlement && (
                  <button onClick={() => handleSettlementWorkflow(row, 'submit')} className="inline-flex h-9 items-center rounded-md border border-[var(--color-primary)] bg-white px-3 text-sm font-medium text-[var(--color-primary)]">提交审批</button>
                )}
                {(['draft', 'rejected'].includes(row.status || 'draft')) && canEditSettlement && (
                  <Link href={`/team-management/settlements/${row.id}/edit`} className="inline-flex h-9 items-center rounded-md border border-[var(--color-primary)] bg-white px-3 text-sm font-medium text-[var(--color-primary)]">编辑</Link>
                )}
                {row.status === 'pending' && canSubmitSettlement && (
                  <button onClick={() => handleSettlementWorkflow(row, 'withdraw')} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#86909C]">撤回</button>
                )}
                {row.status === 'pending' && canApproveSettlement && (
                  <>
                    <button onClick={() => handleSettlementWorkflow(row, 'approve')} className="inline-flex h-9 items-center rounded-md border border-[#00B42A] bg-white px-3 text-sm font-medium text-[var(--color-success)]">通过</button>
                    <button onClick={() => { setRejectSettlement(row); setRejectReason(''); }} className="inline-flex h-9 items-center rounded-md border border-[#F53F3F] bg-white px-3 text-sm font-medium text-[var(--color-danger)]">驳回</button>
                  </>
                )}
                {row.status === 'reviewed' && canApproveSettlement && (
                  <button onClick={() => handleSettlementWorkflow(row, 'unapprove')} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#86909C]">反审核</button>
                )}
                {row.status === 'reviewed' && (
                  <button onClick={() => { setPaySettlement(row); setPayAmount(String(row.planned_payment ?? row.unpaid_amount ?? '')); setPayRemark(''); setPayMethod('bank'); setPayDate(todayISO()); setPayMessage(''); }} className="inline-flex h-9 items-center rounded-md border border-[#00B42A] bg-white px-3 text-sm font-medium text-[var(--color-success)] hover:bg-[#E8FFEA]">记付款</button>
                )}
                {(['draft', 'rejected', 'pending'].includes(row.status || 'draft')) && canDeleteSettlement && (
                  <button onClick={() => handleDeleteSettlement(row)} className="inline-flex h-9 items-center rounded-md border border-[#F53F3F] bg-white px-3 text-sm font-medium text-[var(--color-danger)]">删除</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      </>)}
      {paySettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!payLoading) setPaySettlement(null); }}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold">记班组付款</h3>
            <p className="mt-1 text-sm text-[#86909C]">
              {paySettlement.team_name || `#${paySettlement.id}`} · {paySettlement.settlement_month} ·
              待付 <b className={Number(paySettlement.unpaid_amount) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}>{formatMoney(paySettlement.unpaid_amount || 0)}</b>
              {Number(paySettlement.payment_ratio ?? 100) < 100 && (
                <> · 约定 {formatNumber(paySettlement.payment_ratio ?? 100)}%，本期计划付 <b className="text-[var(--color-success)]">{formatMoney(paySettlement.planned_payment)}</b>，尾款 <b className="text-[#FF7D00]">{formatMoney(paySettlement.retained_amount)}</b></>
              )}
            </p>
            {payMessage && <div className="mt-3 rounded-md bg-[#FFF7E8] px-3 py-2 text-xs text-[#E88012]">{payMessage}</div>}
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">付款金额</span>
                <input type="number" min="0" step="0.01" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} placeholder="请输入付款金额" className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">付款方式</span>
                <select value={payMethod} onChange={(event) => setPayMethod(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
                  <option value="bank">银行转账</option>
                  <option value="cash">现金</option>
                  <option value="check">支票</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">付款日期</span>
                <input type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">备注</span>
                <input value={payRemark} onChange={(event) => setPayRemark(event.target.value)} placeholder="选填" className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPaySettlement(null)} disabled={payLoading} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-4 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)] disabled:opacity-50">取消</button>
              <button onClick={() => void submitLedgerPayment()} disabled={payLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                <Save className="h-4 w-4" />{payLoading ? '保存中…' : '保存付款'}
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!rejectLoading) setRejectSettlement(null); }}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold">驳回结算单</h3>
            <p className="mt-1 text-sm text-[#86909C]">
              {rejectSettlement.team_name || `#${rejectSettlement.id}`} · {rejectSettlement.settlement_month} ·
              实付 <b>{formatMoney(rejectSettlement.payable_amount || 0)}</b>
            </p>
            <div className="mt-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">驳回原因（必填）</span>
                <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} placeholder="请说明需要修改的内容，预算员据此修改后重新提交" className="w-full rounded-md border border-[#DDE2EB] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setRejectSettlement(null)} disabled={rejectLoading} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-4 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)] disabled:opacity-50">取消</button>
              <button onClick={() => void submitReject()} disabled={rejectLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-danger)] px-4 text-sm font-medium text-white hover:bg-[#D9363E] disabled:opacity-50">
                {rejectLoading ? '提交中…' : '确认驳回'}
              </button>
            </div>
          </div>
        </div>
      )}
      {approverTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!approverLoading) setApproverTarget(null); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold">提交审批</h3>
            <p className="mt-1 text-sm text-[#86909C]">
              {approverTarget.team_name || `#${approverTarget.id}`} · {approverTarget.settlement_month} ·
              实付 <b>{formatMoney(approverTarget.payable_amount || 0)}</b>
            </p>
            <div className="mt-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">下一级审批人（必选）</span>
                <select
                  value={selectedApproverId}
                  onChange={(event) => setSelectedApproverId(Number(event.target.value) || 0)}
                  className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value={0}>请选择审批人</option>
                  {approverOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}{option.role ? `（${option.role}）` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-[#86909C]">提交后只有该审批人（或老板/超管）可以审批通过或驳回。</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setApproverTarget(null)}
                disabled={approverLoading}
                className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-4 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void submitWithApprover()}
                disabled={approverLoading}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {approverLoading ? '提交中…' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export function TeamSettlementNewPageClient({ editSettlementId }: { editSettlementId?: number } = {}) {
  const router = useRouter();
  const { projects, projectMessage } = useProjects();
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [itemTotals, setItemTotals] = useState<ItemTotal[]>([]);
  const [projectId, setProjectId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [workType, setWorkType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [splitKeyword, setSplitKeyword] = useState('');
  const [periodText, setPeriodText] = useState('');
  const [remark, setRemark] = useState('');
  const [deductAdvance, setDeductAdvance] = useState('');
  const [deductLaborInsurance, setDeductLaborInsurance] = useState('');
  const [deductHelper, setDeductHelper] = useState('');
  const [deductSafetyFund, setDeductSafetyFund] = useState('');
  const [paymentRatio, setPaymentRatio] = useState('100');
  const [quantityRows, setQuantityRows] = useState<QuantityRow[]>([newQuantityRow()]);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([newSplitRow()]);
  const [splitPickerOpenId, setSplitPickerOpenId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<SettlementAttachment[]>([]);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  // 暂存后 / 提交审批：选择审批人
  const [wfDialogOpen, setWfDialogOpen] = useState(false);
  const [wfSettlementId, setWfSettlementId] = useState<number | null>(null);
  const [wfOptions, setWfOptions] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [wfApproverId, setWfApproverId] = useState(0);
  const [wfLoading, setWfLoading] = useState(false);

  useEffect(() => {
    setProjectId((current) => current || (projects[0]?.id ? String(projects[0].id) : ''));
  }, [projects]);

  // 有未保存内容时，离开页面提醒（防止在工地录一半误触返回全丢）
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const hasInput = quantityRows.some((row) => row.content.trim()) || splitRows.some((row) => Number(row.worker_id) > 0);
      if (!hasInput) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [quantityRows, splitRows]);

  // 编辑模式：加载结算单并预填表单（仅草稿/已驳回可编辑，后端会再次校验状态）
  const isEditMode = Boolean(editSettlementId && editSettlementId > 0);
  useEffect(() => {
    if (!isEditMode || !editSettlementId) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await readJson(await fetch(`/api/team-settlements?id=${encodeURIComponent(String(editSettlementId))}`, { credentials: 'include' }));
        const row = Array.isArray(json.data?.settlements) ? json.data.settlements[0] : null;
        if (!row) throw new Error('未找到该结算单');
        if (cancelled) return;
        setProjectId(String(row.project_id || ''));
        setTeamId(String(row.team_id || ''));
        setMonth(String(row.settlement_month || currentMonth()));
        setRemark(String(row.remark || ''));
        setDeductAdvance(row.advance_deduct != null ? String(row.advance_deduct) : '');
        setDeductLaborInsurance(row.labor_insurance_deduct != null ? String(row.labor_insurance_deduct) : '');
        setDeductHelper(row.helper_deduct != null ? String(row.helper_deduct) : '');
        setDeductSafetyFund(row.safety_fund_deduct != null ? String(row.safety_fund_deduct) : '');
        setPaymentRatio(String(row.payment_ratio ?? 100));
        setAttachments(Array.isArray(row.attachments) ? row.attachments : []);
        const items = Array.isArray(row.items) ? row.items : [];
        setQuantityRows(items.length > 0
          ? items.map((item: { content?: unknown; unit?: unknown; quantity?: unknown; unit_price?: unknown }) => ({
              rowId: createRowId(),
              content: String(item.content || ''),
              unit: String(item.unit || ''),
              quantity: String(item.quantity ?? ''),
              unit_price: String(item.unit_price ?? ''),
            }))
          : [newQuantityRow()]);
        const splits = Array.isArray(row.splits) ? row.splits : [];
        setSplitRows(splits.length > 0
          ? splits.map((split: { worker_id?: unknown; amount?: unknown }) => ({
              rowId: createRowId(),
              worker_id: String(split.worker_id ?? ''),
              amount: String(split.amount ?? ''),
            }))
          : [newSplitRow()]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '结算单加载失败');
      }
    })();
    return () => { cancelled = true; };
  }, [isEditMode, editSettlementId]);

  const selectedProjectId = Number(projectId) || null;
  const selectedTeamId = Number(teamId) || null;

  const selectedTeam = useMemo(() => groups.find((group) => Number(group.id) === selectedTeamId), [groups, selectedTeamId]);
  const workerMap = useMemo(() => new Map(workers.map((worker) => [Number(worker.id), worker])), [workers]);
  const usedWorkerIds = useMemo(() => new Set(splitRows.map((row) => Number(row.worker_id)).filter(Boolean)), [splitRows]);

  // 工种筛选下拉（顶部筛选栏）
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

  // 分账明细的工人选择：严格匹配所选班组工种（班组未设工种则不限），并支持在分账区内搜索
  const splitTeamWorkType = selectedTeam?.work_type?.trim() || '';
  const splitWorkers = useMemo(() => {
    const text = splitKeyword.trim().toLowerCase();
    return workers.filter((worker) => {
      if (splitTeamWorkType) {
        const workerType = String(worker.work_type || '').trim();
        if (workerType !== splitTeamWorkType) return false;
      }
      if (!text) return true;
      return [worker.name, worker.id_card, worker.work_type, worker.team_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [splitKeyword, splitTeamWorkType, workers]);

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
    const hours = round2(toNumber(worker?.attendance_hours));
    const amount = round2(toNumber(row.amount));
    return { ...row, worker, hours, amount };
  }), [splitRows, workerMap]);

  const quantityTotal = useMemo(() => round2(quantityPreview.reduce((sum, row) => sum + row.amount, 0)), [quantityPreview]);
  const splitTotal = useMemo(() => round2(splitPreview.reduce((sum, row) => sum + row.amount, 0)), [splitPreview]);
  const totalHours = useMemo(() => round2(splitPreview.reduce((sum, row) => sum + row.hours, 0)), [splitPreview]);
  const deductionTotal = useMemo(
    () => round2(toNumber(deductAdvance) + toNumber(deductLaborInsurance) + toNumber(deductHelper) + toNumber(deductSafetyFund)),
    [deductAdvance, deductLaborInsurance, deductHelper, deductSafetyFund],
  );
  const payableAmount = useMemo(() => round2(Math.max(0, quantityTotal - deductionTotal)), [quantityTotal, deductionTotal]);
  const normalizedRatio = useMemo(() => {
    const num = toNumber(paymentRatio);
    if (!Number.isFinite(num)) return 100;
    return Math.min(100, Math.max(0, num));
  }, [paymentRatio]);
  const plannedPayment = useMemo(() => round2((payableAmount * normalizedRatio) / 100), [payableAmount, normalizedRatio]);
  const retainedAmount = useMemo(() => round2(Math.max(0, payableAmount - plannedPayment)), [payableAmount, plannedPayment]);

  const loadGroups = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', String(selectedProjectId));
    const json = await readJson(await fetch(`/api/team-groups?${params.toString()}`, { credentials: 'include' }));
    const list = Array.isArray(json.data?.groups) ? json.data.groups : [];
    setGroups(list);
    setTeamId((current) => current && list.some((group: TeamGroup) => String(group.id) === current) ? current : (list[0]?.id ? String(list[0].id) : ''));
  }, [selectedProjectId]);

  const loadSettledTotals = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', String(selectedProjectId));
    if (selectedTeamId) params.set('teamId', String(selectedTeamId));
    const json = await readJson(await fetch(`/api/team-settlements?${params.toString()}`, { credentials: 'include' }));
    setItemTotals(Array.isArray(json.data?.item_totals) ? json.data.item_totals : []);
  }, [selectedProjectId, selectedTeamId]);

  const loadWorkers = useCallback(async () => {
    if (!selectedProjectId) {
      setWorkers([]);
      setWorkTypes([]);
      setPeriodText('');
      return;
    }
    const params = new URLSearchParams({ mode: 'attendance', projectId: String(selectedProjectId), month });
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
      await Promise.all([loadGroups(), loadSettledTotals(), loadWorkers()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '新增结算单数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadGroups, loadSettledTotals, loadWorkers]);

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

  async function handleUploadAttachment(file: File) {
    if (attachmentsUploading) return;
    setAttachmentsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/team-settlements/attachments/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const json = await readJson(res);
      if (!json.success) throw new Error(json.error || '附件上传失败');
      const attachment = json.attachment as SettlementAttachment;
      if (!attachment?.key) throw new Error('附件上传失败');
      setAttachments((prev) => [...prev, attachment]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '附件上传失败');
    } finally {
      setAttachmentsUploading(false);
    }
  }

  async function handleRemoveAttachment(attachmentKey: string) {
    setAttachments((prev) => prev.filter((att) => att.key !== attachmentKey));
  }

  async function handlePreviewAttachment(attachmentKey: string) {
    try {
      const json = await readJson(await fetch('/api/team-settlements/attachments/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: attachmentKey, expireTime: 3600 }),
      }));
      if (json.success && json.url) window.open(json.url, '_blank');
    } catch {
      setMessage('附件预览失败');
    }
  }

  /** 暂存（草稿，可留空工程量）或保存并提交审批 */
  async function saveSettlement(mode: 'draft' | 'submit') {
    if (!selectedProjectId || !selectedTeamId) {
      setMessage('请先选择项目和班组');
      return;
    }
    const items = quantityRows
      .map((row) => ({ content: row.content.trim(), unit: row.unit.trim(), quantity: toNumber(row.quantity), unit_price: toNumber(row.unit_price) }))
      .filter((row) => row.content && row.quantity > 0);
    const splits = splitRows
      .map((row) => ({ worker_id: Number(row.worker_id), amount: toNumber(row.amount) }))
      .filter((row) => row.worker_id > 0);

    if (mode === 'submit' && items.length === 0) {
      setMessage('提交审批前请至少录入一条结算工程量');
      return;
    }
    if (items.some((item) => item.quantity < 0 || item.unit_price < 0)) {
      setMessage('工程量、单价不能为负数，请检查');
      return;
    }
    if (deductionTotal > quantityTotal + 0.005) {
      setMessage('扣款合计不能大于结算金额，请检查借支/劳保/帮工/安全基金');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const url = isEditMode && editSettlementId ? `/api/team-settlements/${editSettlementId}` : '/api/team-settlements';
      const payloadBase = {
        settlement_month: month,
        remark,
        items,
        splits,
        attachments,
        partial: mode === 'draft',
        advance_deduct: toNumber(deductAdvance),
        labor_insurance_deduct: toNumber(deductLaborInsurance),
        helper_deduct: toNumber(deductHelper),
        safety_fund_deduct: toNumber(deductSafetyFund),
        payment_ratio: normalizedRatio,
      };
      const json = await readJson(await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(isEditMode
          ? payloadBase
          : { project_id: selectedProjectId, team_id: selectedTeamId, ...payloadBase }),
      }));
      const settlementId = isEditMode ? editSettlementId : json.data?.settlement?.id;
      if (!settlementId) {
        setMessage('保存成功');
        return;
      }
      if (mode === 'draft') {
        setMessage('已暂存，可继续修改');
        if (!isEditMode) router.replace(`/team-management/settlements/${settlementId}/edit`);
        return;
      }
      await openWorkflowDialog(Number(settlementId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '班组结算单保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function openWorkflowDialog(settlementId: number) {
    setWfSettlementId(settlementId);
    setWfApproverId(0);
    setWfDialogOpen(true);
    if (wfOptions.length === 0) {
      try {
        const json = await readJson(await fetch('/api/users/options', { credentials: 'include' }));
        const options = (json.data?.options || []);
        setWfOptions(Array.isArray(options) ? options : []);
      } catch {
        setWfOptions([]);
      }
    }
  }

  async function confirmSubmitWorkflow() {
    if (!wfSettlementId) return;
    if (!wfApproverId) {
      setMessage('请选择审批人');
      return;
    }
    setWfLoading(true);
    setMessage('');
    try {
      const approver = wfOptions.find((option) => option.id === wfApproverId);
      await readJson(await fetch('/api/team-settlements/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          settlement_id: wfSettlementId,
          action: 'submit',
          approverUserId: wfApproverId,
          approverName: approver?.name || '',
        }),
      }));
      setWfDialogOpen(false);
      setMessage(`已提交审批，审批人：${approver?.name || ''}`);
      router.push(`/team-management/settlements/${wfSettlementId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交审批失败');
    } finally {
      setWfLoading(false);
    }
  }

  return (
    <PageShell>
      <Header
        eyebrow="班组管理"
        title={isEditMode ? '编辑班组结算单' : '新增班组结算单'}
        description={isEditMode ? '修改结算内容、扣款与分账后保存；分账自动带出施工日志考勤工时。' : '上部录结算内容、工程量和单价；下部分账自动带出施工日志考勤工时。'}
        action={(
          <>
            <Link href="/team-management/settlements" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)]">
              <ArrowLeft className="h-4 w-4" />
              返回台账
            </Link>
            <button onClick={() => void saveSettlement('draft')} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              暂存草稿
            </button>
            <button onClick={() => void saveSettlement('submit')} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              保存并提交审批
            </button>
          </>
        )}
      />
      <Message>{projectMessage || message}</Message>

      <section className="grid gap-3 rounded-lg border border-[#E5E8EF] bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#86909C]">项目</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
            <option value="">请选择项目</option>
            {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#86909C]">班组</span>
          <select value={teamId} onChange={(event) => { setTeamId(event.target.value); setSplitKeyword(''); }} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
            <option value="">请选择班组</option>
            {groups.map((group) => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#86909C]">结算月份</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#86909C]">工种筛选</span>
          <select value={workType} onChange={(event) => setWorkType(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
            <option value="">全部工种</option>
            {workTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </section>

      <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F5] p-4">
          <div>
            <h2 className="font-semibold">结算工程量</h2>
            <p className="mt-1 text-xs text-[#86909C]">结算周期：{periodText || '选择项目和月份后自动生成'}</p>
          </div>
          <div className="rounded-md bg-[#F2F7FF] px-3 py-2 text-right">
            <div className="text-xs text-[#86909C]">本次合计金额</div>
            <div className="mt-1 font-semibold text-[var(--color-primary)]">{formatMoney(quantityTotal)}</div>
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex justify-end">
            <button onClick={() => setQuantityRows((rows) => [...rows, newQuantityRow()])} className="inline-flex h-9 items-center gap-1 rounded-md border border-[#DDE2EB] px-3 text-xs font-medium text-[var(--color-primary)]">
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
                    <td className="px-3 py-2"><input value={row.content} onChange={(event) => updateQuantity(row.rowId, 'content', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 outline-none focus:border-[var(--color-primary)]" placeholder="如模板安装" /></td>
                    <td className="px-3 py-2"><input value={row.unit} onChange={(event) => updateQuantity(row.rowId, 'unit', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 outline-none focus:border-[var(--color-primary)]" placeholder="m2" /></td>
                    <td className="px-3 py-2"><input value={row.quantity} onChange={(event) => updateQuantity(row.rowId, 'quantity', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 text-right outline-none focus:border-[var(--color-primary)]" inputMode="decimal" /></td>
                    <td className="px-3 py-2"><input value={row.unit_price} onChange={(event) => updateQuantity(row.rowId, 'unit_price', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 text-right outline-none focus:border-[var(--color-primary)]" inputMode="decimal" /></td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--color-primary)]">{formatMoney(row.amount)}</td>
                    <td className="px-3 py-2 text-right text-[#4E5969]">{formatNumber(row.settledBefore)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatNumber(row.cumulativeQuantity)}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setQuantityRows((rows) => rows.length > 1 ? rows.filter((item) => item.rowId !== row.rowId) : rows)} aria-label="删除结算工程量" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#86909C] hover:bg-[#FFF1F0] hover:text-[var(--color-danger)]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#FAFBFF] font-semibold">
                <tr>
                  <td className="px-3 py-3" colSpan={4}>本次合计金额</td>
                  <td className="px-3 py-3 text-right text-[var(--color-primary)]">{formatMoney(quantityTotal)}</td>
                  <td className="px-3 py-3" colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F5] p-4">
          <div>
            <h2 className="font-semibold">分账明细</h2>
            <p className="mt-1 text-xs text-[#86909C]">选择工人后自动显示结算周期内出勤总工时，分账金额可自由填写（不再按出勤×单价自动计算）。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86909C]" />
              <input value={splitKeyword} onChange={(event) => setSplitKeyword(event.target.value)} placeholder={splitTeamWorkType ? `搜索${splitTeamWorkType}工人` : '搜索工人姓名/身份证'} className="h-8 w-44 rounded-md border border-[#DDE2EB] pl-8 pr-2 text-xs outline-none focus:border-[var(--color-primary)]" />
            </div>
            <button onClick={() => setSplitRows((rows) => [...rows, newSplitRow()])} className="inline-flex h-9 items-center gap-1 rounded-md border border-[#DDE2EB] px-3 text-xs font-medium text-[var(--color-primary)]">
              <Plus className="h-3.5 w-3.5" />
              新增分账
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="overflow-x-auto rounded-md border border-[#EEF0F5]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                <tr>
                  <th className="px-3 py-3 text-left">工人</th>
                  <th className="px-3 py-3 text-left">工种/班组</th>
                  <th className="px-3 py-3 text-left">身份证</th>
                  <th className="px-3 py-3 text-right">周期出勤总工时</th>
                  <th className="px-3 py-3 text-right">分账金额</th>
                  <th className="px-3 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF0F5]">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#86909C]">加载中...</td></tr>
                ) : splitPreview.map((row) => (
                  <tr key={row.rowId}>
                    <td className="px-3 py-2">
                      <Popover open={splitPickerOpenId === row.rowId} onOpenChange={(open) => setSplitPickerOpenId(open ? row.rowId : null)}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            role="combobox"
                            aria-expanded={splitPickerOpenId === row.rowId}
                            className="flex h-9 w-full items-center justify-between rounded-md border border-[#DDE2EB] bg-white px-2 text-left text-sm outline-none focus:border-[var(--color-primary)]"
                          >
                            <span className="truncate">
                              {row.worker_id
                                ? (workerMap.get(Number(row.worker_id))?.name || '请选择工人')
                                : '请选择工人'}
                            </span>
                            <Search className="h-3.5 w-3.5 shrink-0 text-[#86909C]" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command shouldFilter>
                            <CommandInput placeholder="搜索姓名/身份证/工种" className="h-9" />
                            <CommandList>
                              <CommandEmpty>
                                {splitWorkers.length === 0
                                  ? (splitTeamWorkType
                                      ? `当前项目暂无${splitTeamWorkType}工人`
                                      : '当前项目暂无在场工人')
                                  : `未搜索到${splitTeamWorkType || ''}工人`}
                              </CommandEmpty>
                              <CommandGroup>
                                {splitWorkers.map((worker) => (
                                  <CommandItem
                                    key={worker.id}
                                    value={`${worker.name} ${worker.id_card || ''} ${worker.work_type || ''} ${worker.team_name || ''}`}
                                    disabled={usedWorkerIds.has(worker.id) && String(worker.id) !== row.worker_id}
                                    onSelect={() => {
                                      updateSplit(row.rowId, 'worker_id', String(worker.id));
                                      setSplitPickerOpenId(null);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <Check className={`h-4 w-4 shrink-0 ${row.worker_id === String(worker.id) ? 'opacity-100 text-[var(--color-primary)]' : 'opacity-0'}`} />
                                    <div className="flex flex-col">
                                      <span>{worker.name} <span className="text-xs text-[#86909C]">/ {worker.work_type || '未填工种'}</span>
                                        {isInactiveWorker(worker.status) ? <span className="ml-1 rounded bg-[#FFF1F0] px-1 text-[11px] text-[var(--color-danger)]">已退场</span> : null}
                                      </span>
                                      <span className="text-xs text-[#86909C]">工时 {formatNumber(worker.attendance_hours)} 小时{worker.team_name ? ` · ${worker.team_name}` : ''}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className="px-3 py-2 text-[#4E5969]">{[row.worker?.work_type, row.worker?.team_name].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="px-3 py-2 text-[#4E5969]">{maskIdCard(row.worker?.id_card)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--color-primary)]">{formatNumber(row.hours)}</td>
                    <td className="px-3 py-2"><input value={row.amount} placeholder="0.00" onChange={(event) => updateSplit(row.rowId, 'amount', event.target.value)} className="h-9 w-full rounded-md border border-[#DDE2EB] px-2 text-right outline-none focus:border-[var(--color-primary)]" inputMode="decimal" /></td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setSplitRows((rows) => rows.length > 1 ? rows.filter((item) => item.rowId !== row.rowId) : rows)} aria-label="删除分账人员" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#86909C] hover:bg-[#FFF1F0] hover:text-[var(--color-danger)]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#FAFBFF] font-semibold">
                <tr>
                  <td className="px-3 py-3" colSpan={3}>分账明细合计</td>
                  <td className="px-3 py-3 text-right text-[var(--color-primary)]">{formatNumber(totalHours)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(splitTotal)}</td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <textarea value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="结算备注，可填写扣款、争议事项或现场说明" className="mt-3 min-h-20 w-full rounded-md border border-[#DDE2EB] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />

          <div className="mt-3 border-t border-[#EEF0F5] pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-[#4E5969]">结算附件</h3>
                <p className="mt-0.5 text-xs text-[#86909C]">可上传结算单扫描件、验收单、发票等，支持图片/PDF/Word/Excel/PPT/TXT</p>
              </div>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#DDE2EB] bg-white px-3 text-xs font-medium text-[#4E5969] hover:text-[var(--color-primary)]">
                <Upload className="h-3.5 w-3.5" />
                {attachmentsUploading ? '上传中…' : '添加附件'}
                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" disabled={attachmentsUploading} onChange={async (e) => { const file = e.target.files?.[0]; if (file) await handleUploadAttachment(file); e.target.value = ''; }} />
              </label>
            </div>
            {attachments.length > 0 && (
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {attachments.map((att) => (
                  <li key={att.key} className="flex items-center gap-2 rounded-md border border-[#E5E8EF] bg-[#FAFBFF] px-2 py-1.5">
                    {isImageFile(att.name) ? (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#EEF0F5] text-[10px] text-[#86909C]">图</div>
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#EEF0F5]"><FileText className="h-4 w-4 text-[#86909C]" /></div>
                    )}
                    <button type="button" onClick={() => void handlePreviewAttachment(att.key)} className="min-w-0 flex-1 text-left text-xs text-[#4E5969] hover:text-[var(--color-primary)]">
                      <span className="block truncate">{att.name}</span>
                      {att.size ? <span className="block text-[11px] text-[#C9CDD4]">{formatFileSize(att.size)}</span> : null}
                    </button>
                    <button type="button" onClick={() => void handleRemoveAttachment(att.key)} className="shrink-0 text-[#C9CDD4] hover:text-[var(--color-danger)]" title="移除附件"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F5] p-4">
          <div>
            <h2 className="font-semibold">扣款项</h2>
            <p className="mt-1 text-xs text-[#86909C]">填写本结算单需扣除的借支、劳保、帮工、安全基金等费用，实付金额 = 结算金额 - 扣款合计。</p>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DeductField label="借支" value={deductAdvance} onChange={setDeductAdvance} placeholder="借支金额" />
            <DeductField label="劳保" value={deductLaborInsurance} onChange={setDeductLaborInsurance} placeholder="劳保金额" />
            <DeductField label="帮工" value={deductHelper} onChange={setDeductHelper} placeholder="帮工金额" />
            <DeductField label="安全基金" value={deductSafetyFund} onChange={setDeductSafetyFund} placeholder="安全基金金额" />
          </div>
          <div className="mt-4 grid gap-4 rounded-lg border border-[#E5E8EF] bg-[#FAFBFF] p-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block max-w-xs">
              <span className="mb-1 block text-xs font-medium text-[#86909C]">本期付款比例（%）</span>
              <div className="relative">
                <input value={paymentRatio} onChange={(event) => {
                  const v = event.target.value;
                  if (v === '') { setPaymentRatio(''); return; }
                  const num = Number(v);
                  if (Number.isFinite(num)) setPaymentRatio(String(Math.min(100, Math.max(0, num))));
                }} placeholder="100" inputMode="decimal" className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 pr-9 text-sm outline-none focus:border-[var(--color-primary)]" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#86909C]">%</span>
              </div>
              <span className="mt-1 block text-[11px] text-[#86909C]">按合同约定填写，如本期付 80%；尾款下期或完工后支付</span>
            </label>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-[#4E5969]">结算金额：<b className="text-[var(--color-primary)]">{formatMoney(quantityTotal)}</b></span>
              <span className="text-[#4E5969]">扣款合计：<b className="text-[var(--color-danger)]">- {formatMoney(deductionTotal)}</b></span>
              <span className="text-[#4E5969]">实付金额（应发）：<b className="text-[var(--color-primary)]">{formatMoney(payableAmount)}</b></span>
              <span className="text-[#4E5969]">本期计划付款（{formatNumber(normalizedRatio)}%）：<b className="text-[var(--color-success)]">{formatMoney(plannedPayment)}</b></span>
              <span className="text-[#4E5969]">尾款/预留款：<b className="text-[#FF7D00]">{formatMoney(retainedAmount)}</b></span>
            </div>
          </div>
        </div>
      </section>
      {wfDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!wfLoading) setWfDialogOpen(false); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold">提交审批</h3>
            <p className="mt-1 text-sm text-[#86909C]">请选择下一级审批人，提交后只有该审批人（或老板/超管）可以审批。</p>
            <div className="mt-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">审批人（必选）</span>
                <select
                  value={wfApproverId}
                  onChange={(event) => setWfApproverId(Number(event.target.value) || 0)}
                  className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value={0}>请选择审批人</option>
                  {wfOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}{option.role ? `（${option.role}）` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setWfDialogOpen(false)}
                disabled={wfLoading}
                className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-4 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void confirmSubmitWorkflow()}
                disabled={wfLoading}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {wfLoading ? '提交中…' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export function TeamSettlementDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [settlement, setSettlement] = useState<TeamSettlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [payments, setPayments] = useState<TeamSettlementPayment[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentRemark, setPaymentRemark] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const json = await readJson(await fetch('/api/auth/me', { credentials: 'include' }));
        const user = json?.user || json?.data;
        setPermissions(Array.isArray(user?.permissions) ? user.permissions : []);
        setIsSuperAdmin(user?.role === 'super_admin');
      } catch {
        // 权限加载失败按无权限处理
      }
    })();
  }, []);

  const canSubmitSettlement = isSuperAdmin || permissions.includes('team_settlements:submit');
  const canApproveSettlement = isSuperAdmin || permissions.includes('team_settlements:approve');
  const [wfOptions, setWfOptions] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [wfApproverId, setWfApproverId] = useState(0);
  const confirmDialog = useConfirm();
  const [approverDialogOpen, setApproverDialogOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  async function submitSettlementApproval() {
    if (!settlement) return;
    setWfApproverId(0);
    setApproverDialogOpen(true);
    if (wfOptions.length === 0) {
      try {
        const json = await readJson(await fetch('/api/users/options', { credentials: 'include' }));
        const options = json?.data?.options || [];
        setWfOptions(Array.isArray(options) ? options : []);
      } catch {
        setWfOptions([]);
      }
    }
  }

  /** 选择审批人后提交 */
  async function confirmSubmitApproval() {
    if (!settlement) return;
    if (!wfApproverId) {
      setMessage('请选择审批人');
      return;
    }
    setWorkflowLoading(true);
    try {
      const approver = wfOptions.find((option) => option.id === wfApproverId);
      await readJson(await fetch('/api/team-settlements/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          settlement_id: settlement.id,
          action: 'submit',
          approverUserId: wfApproverId,
          approverName: approver?.name || '',
        }),
      }));
      setApproverDialogOpen(false);
      setMessage(`已提交审批，审批人：${approver?.name || ''}`);
      await loadSettlement();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交审批失败');
    } finally {
      setWorkflowLoading(false);
    }
  }

  /** 审批通过 */
  async function handleApproveSettlement() {
    if (!settlement) return;
    if (!(await confirmDialog({ title: '确认操作', description: '', variant: 'destructive' }))) return;
    setWorkflowLoading(true);
    try {
      await readJson(await fetch('/api/team-settlements/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settlement_id: settlement.id, action: 'approve' }),
      }));
      setMessage('审批通过，已计入成本');
      await loadSettlement();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '审批失败');
    } finally {
      setWorkflowLoading(false);
    }
  }

  /** 驳回 */
  async function handleRejectSettlement() {
    if (!settlement) return;
    if (!rejectReason.trim()) {
      setMessage('请填写驳回原因');
      return;
    }
    setWorkflowLoading(true);
    try {
      await readJson(await fetch('/api/team-settlements/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settlement_id: settlement.id, action: 'reject', reason: rejectReason.trim() }),
      }));
      setRejectOpen(false);
      setRejectReason('');
      setMessage('已驳回，预算员可修改后重新提交');
      await loadSettlement();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '驳回失败');
    } finally {
      setWorkflowLoading(false);
    }
  }

  const loadPayments = useCallback(async () => {
    if (!id) return;
    setPaymentLoading(true);
    setPaymentMessage('');
    try {
      const json = await readJson(await fetch(`/api/team-settlement-payments?settlementId=${encodeURIComponent(id)}`, { credentials: 'include' }));
      setPayments(Array.isArray(json.data?.payments) ? json.data.payments : []);
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : '付款记录加载失败');
    } finally {
      setPaymentLoading(false);
    }
  }, [id]);

  const loadSettlement = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setMessage('');
    try {
      const json = await readJson(await fetch(`/api/team-settlements?id=${encodeURIComponent(id)}`, { credentials: 'include' }));
      const row = Array.isArray(json.data?.settlements) ? json.data.settlements[0] : null;
      if (!row) throw new Error('未找到该结算单');
      setSettlement(row);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '结算单加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadSettlement();
    void loadPayments();
  }, [loadSettlement, loadPayments]);

  function printPage() {
    window.print();
  }

  function downloadHtml() {
    if (!settlement) return;
    const html = document.querySelector('[data-print-area="team-settlement-detail"]')?.outerHTML || '';
    const blob = new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${settlement.settlement_no || settlement.id}</title></head><body>${html}</body></html>`], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settlement.settlement_no || `班组结算单-${settlement.id}`}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const items = settlement?.items || [];
  const splits = settlement?.splits || [];

  async function addPayment() {
    if (!id) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentMessage('请输入有效的付款金额');
      return;
    }
    if (!settlement?.team_id) {
      setPaymentMessage('结算单缺少班组信息，无法登记付款');
      return;
    }
    setPaymentLoading(true);
    setPaymentMessage('');
    try {
      const json = await readJson(await fetch('/api/team-settlement-payments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: settlement.team_id,
          settlement_id: Number(id),
          payment_amount: amount,
          method: paymentMethod,
          payment_date: paymentDate,
          remark: paymentRemark || undefined,
        }),
      }));
      void json;
      setPaymentAmount('');
      setPaymentRemark('');
      setShowPaymentForm(false);
      await Promise.all([loadSettlement(), loadPayments()]);
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : '付款记录保存失败');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function deletePayment(paymentId: number) {
    if (!(await confirmDialog({ title: '确认操作', description: '', variant: 'destructive' }))) return;
    setPaymentLoading(true);
    setPaymentMessage('');
    try {
      await readJson(await fetch(`/api/team-settlement-payments?id=${paymentId}`, { method: 'DELETE', credentials: 'include' }));
      await Promise.all([loadSettlement(), loadPayments()]);
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : '付款记录删除失败');
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <PageShell>
      <Header
        eyebrow="班组管理"
        title="班组结算单详情"
        description="查看本次结算工程量、人员分账明细，并支持下载打印留档。"
        action={(
          <>
            <Link href="/team-management/settlements" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)]">
              <ArrowLeft className="h-4 w-4" />
              返回台账
            </Link>
            <button onClick={downloadHtml} disabled={!settlement} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#DDE2EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)] disabled:opacity-50">
              <Download className="h-4 w-4" />
              下载
            </button>
            <button onClick={printPage} disabled={!settlement} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
              <Printer className="h-4 w-4" />
              打印
            </button>
          </>
        )}
      />
            <Message>{message}</Message>

      {approverDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!workflowLoading) setApproverDialogOpen(false); }}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold">提交审批</h3>
            <p className="mt-1 text-sm text-[#86909C]">请选择下一级审批人，提交后只有该审批人（或老板/超管）可以审批。</p>
            <div className="mt-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#86909C]">审批人（必选）</span>
                <select
                  value={wfApproverId}
                  onChange={(event) => setWfApproverId(Number(event.target.value) || 0)}
                  className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value={0}>请选择审批人</option>
                  {wfOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}{option.role ? `（${option.role}）` : ''}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setApproverDialogOpen(false)} disabled={workflowLoading} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-4 text-sm font-medium text-[#4E5969] disabled:opacity-50">取消</button>
              <button onClick={() => void confirmSubmitApproval()} disabled={workflowLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-50">
                {workflowLoading ? '提交中…' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-[#E5E8EF] bg-white p-10 text-center text-sm text-[#86909C]">加载中...</div>
      ) : settlement ? (
        <section data-print-area="team-settlement-detail" className="rounded-lg border border-[#E5E8EF] bg-white shadow-sm print:border-0 print:shadow-none">
          <div className="border-b border-[#EEF0F5] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">班组结算单</h2>
                <p className="mt-1 text-sm text-[#86909C]">{settlement.settlement_no || `#${settlement.id}`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-fit rounded-md px-3 py-1 text-sm ${statusBadgeClass(settlement.status)}`}>{statusText(settlement.status)}</span>
                {((settlement.status || 'draft') === 'draft' || settlement.status === 'rejected') && canSubmitSettlement && (
                  <button onClick={() => void submitSettlementApproval()} disabled={workflowLoading} className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-xs font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                    {workflowLoading ? '提交中…' : '提交审批'}
                  </button>
                )}
                {settlement.status === 'pending' && (
                  canApproveSettlement ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => void handleApproveSettlement()} disabled={workflowLoading} className="inline-flex h-9 items-center rounded-md bg-[var(--color-success)] px-3 text-xs font-medium text-white hover:bg-[#009A29] disabled:opacity-50">
                        {workflowLoading ? '处理中…' : '通过'}
                      </button>
                      <button onClick={() => setRejectOpen(true)} disabled={workflowLoading} className="inline-flex h-9 items-center rounded-md border border-[#FFC9C9] bg-white px-3 text-xs font-medium text-[var(--color-danger)] disabled:opacity-50">
                        驳回
                      </button>
                      {(settlement as unknown as { approver_name?: string }).approver_name ? (
                        <span className="text-xs text-[#86909C]">
                          下一审批人：{(settlement as unknown as { approver_name?: string }).approver_name}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-[#D25F00]">待审批，通过后计入成本</span>
                  )
                )}
                {rejectOpen && (
                  <div className="mt-2 w-full rounded-md border border-[#FFC9C9] bg-[#FFF1F0] p-3">
                    <div className="mb-1 text-xs font-medium text-[var(--color-danger)]">驳回原因（必填）</div>
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      rows={3}
                      placeholder="请说明需要修改的内容，预算员据此修改后重新提交"
                      className="w-full rounded-md border border-[#FFC9C9] px-3 py-2 text-sm outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => { setRejectOpen(false); setRejectReason(''); }} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-3 text-xs">取消</button>
                      <button onClick={() => void handleRejectSettlement()} disabled={workflowLoading} className="inline-flex h-9 items-center rounded-md bg-[var(--color-danger)] px-3 text-xs font-medium text-white disabled:opacity-50">
                        {workflowLoading ? '处理中…' : '确认驳回'}
                      </button>
                    </div>
                  </div>
                )}
                {settlement.status === 'rejected' && settlement.reject_reason && (
                  <span className="text-xs text-[var(--color-danger)]">驳回原因：{settlement.reject_reason}</span>
                )}
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-4">
              <div><dt className="text-xs text-[#86909C]">项目</dt><dd className="mt-1 font-medium">{settlement.project_name || '-'}</dd></div>
              <div><dt className="text-xs text-[#86909C]">班组</dt><dd className="mt-1 font-medium">{settlement.team_name || '-'}</dd></div>
              <div><dt className="text-xs text-[#86909C]">结算月份</dt><dd className="mt-1 font-medium">{settlement.settlement_month}</dd></div>
              <div><dt className="text-xs text-[#86909C]">结算周期</dt><dd className="mt-1 font-medium">{settlement.period_start} 至 {settlement.period_end}</dd></div>
              <div><dt className="text-xs text-[#86909C]">结算金额（计入成本）</dt><dd className="mt-1 font-semibold text-[var(--color-primary)]">{formatMoney(settlement.quantity_amount)}</dd></div>
              <div><dt className="text-xs text-[#86909C]">分账金额</dt><dd className="mt-1 font-medium">{formatMoney(settlement.split_amount)}</dd></div>
              <div><dt className="text-xs text-[#86909C]">总工时</dt><dd className="mt-1 font-medium">{formatNumber(settlement.total_hours)}</dd></div>
              <div><dt className="text-xs text-[#86909C]">制单人</dt><dd className="mt-1 font-medium">{settlement.created_by_name || '-'}</dd></div>
            </dl>
            <div className="mt-4 rounded-lg bg-[#F7F8FA] p-4">
              <h3 className="mb-2 text-sm font-semibold">扣款项</h3>
              <dl className="grid gap-2 text-sm md:grid-cols-4">
                <div><dt className="text-xs text-[#86909C]">借支</dt><dd className="mt-0.5 font-medium">- {formatMoney(settlement.advance_deduct)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">劳保</dt><dd className="mt-0.5 font-medium">- {formatMoney(settlement.labor_insurance_deduct)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">帮工</dt><dd className="mt-0.5 font-medium">- {formatMoney(settlement.helper_deduct)}</dd></div>
                <div><dt className="text-xs text-[#86909C]">安全基金</dt><dd className="mt-0.5 font-medium">- {formatMoney(settlement.safety_fund_deduct)}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#E5E8EF] pt-3">
                <span className="text-sm text-[#4E5969]">扣款合计：<b className="text-[var(--color-danger)]">- {formatMoney(settlement.deduction_total)}</b></span>
                <span className="text-sm text-[#4E5969]">实付金额（应发）：<b className="text-[var(--color-primary)]">{formatMoney(settlement.payable_amount)}</b></span>
                <span className="text-sm text-[#4E5969]">付款比例：<b className="text-[#4E5969]">{formatNumber(settlement.payment_ratio ?? 100)}%</b></span>
                <span className="text-sm text-[#4E5969]">本期计划付：<b className="text-[var(--color-success)]">{formatMoney(settlement.planned_payment ?? settlement.payable_amount)}</b></span>
                <span className="text-sm text-[#4E5969]">尾款/预留：<b className="text-[#FF7D00]">{formatMoney(settlement.retained_amount ?? 0)}</b></span>
                <span className="text-sm text-[#4E5969]">已付：<b className="text-[var(--color-success)]">{formatMoney(settlement.paid_amount || 0)}</b></span>
                <span className="text-sm text-[#4E5969]">未付：<b className={Number(settlement.unpaid_amount) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}>{formatMoney(settlement.unpaid_amount || 0)}</b></span>
              </div>
            </div>
          </div>

          <div className="p-5">
            <h3 className="mb-3 font-semibold">结算工程量</h3>
            <div className="overflow-x-auto rounded-md border border-[#EEF0F5]">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                  <tr>
                    <th className="px-3 py-3 text-left">结算内容</th>
                    <th className="px-3 py-3 text-left">单位</th>
                    <th className="px-3 py-3 text-right">工程量</th>
                    <th className="px-3 py-3 text-right">单价</th>
                    <th className="px-3 py-3 text-right">合计</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF0F5]">
                  {items.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-[#86909C]">暂无结算工程量</td></tr>
                  ) : items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td className="px-3 py-3 font-medium">{item.content}</td>
                      <td className="px-3 py-3 text-[#4E5969]">{item.unit || '-'}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(item.quantity)}</td>
                      <td className="px-3 py-3 text-right">{formatMoney(item.unit_price)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mb-3 mt-6 font-semibold">分账明细</h3>
            <div className="overflow-x-auto rounded-md border border-[#EEF0F5]">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                  <tr>
                    <th className="px-3 py-3 text-left">工人</th>
                    <th className="px-3 py-3 text-left">工种/班组</th>
                    <th className="px-3 py-3 text-right">出勤工时</th>
                    <th className="px-3 py-3 text-right">单价</th>
                    <th className="px-3 py-3 text-right">分账金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF0F5]">
                  {splits.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-[#86909C]">暂无分账明细</td></tr>
                  ) : splits.map((split, index) => (
                    <tr key={split.id || index}>
                      <td className="px-3 py-3 font-medium">{split.worker_name || '-'}</td>
                      <td className="px-3 py-3 text-[#4E5969]">{[split.work_type, split.team_name].filter(Boolean).join(' / ') || '-'}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(split.work_hours)}</td>
                      <td className="px-3 py-3 text-right">{formatMoney(split.unit_price)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatMoney(split.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 rounded-lg border border-[#E5E8EF] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">付款记录</h3>
                  <p className="mt-1 text-xs text-[#86909C]">
                    已付 <b className="text-[var(--color-primary)]">{formatMoney(settlement.paid_amount || 0)}</b>，未付{' '}
                    <b className={Number(settlement.unpaid_amount) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}>{formatMoney(settlement.unpaid_amount || 0)}</b>
                  </p>
                </div>
                <button
                  onClick={() => setShowPaymentForm((current) => !current)}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-[#DDE2EB] bg-white px-3 text-xs font-medium text-[#4E5969] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  <Plus className="h-3.5 w-3.5" />记一笔付款
                </button>
              </div>

              {paymentMessage && <div className="mt-3 rounded-md bg-[#FFF7E8] px-3 py-2 text-xs text-[#E88012]">{paymentMessage}</div>}

              {showPaymentForm && (
                <div className="mt-4 grid gap-3 rounded-md bg-[#F7F8FA] p-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[#86909C]">付款金额</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      placeholder="请输入付款金额"
                      className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[#86909C]">付款方式</span>
                    <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]">
                      <option value="bank">银行转账</option>
                      <option value="cash">现金</option>
                      <option value="check">支票</option>
                      <option value="other">其他</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[#86909C]">付款日期</span>
                    <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[#86909C]">备注</span>
                    <input value={paymentRemark} onChange={(event) => setPaymentRemark(event.target.value)} placeholder="选填" className="h-10 w-full rounded-md border border-[#DDE2EB] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
                  </label>
                  <div className="flex items-end gap-2 md:col-span-2">
                    <button onClick={() => void addPayment()} disabled={paymentLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                      <Save className="h-4 w-4" />保存付款
                    </button>
                    <button onClick={() => setShowPaymentForm(false)} className="inline-flex h-9 items-center rounded-md border border-[#DDE2EB] bg-white px-4 text-sm font-medium text-[#4E5969] hover:text-[var(--color-primary)]">取消</button>
                  </div>
                </div>
              )}

              <div className="mt-4 overflow-x-auto rounded-md border border-[#EBEDF3]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F7F8FA] text-xs font-medium text-[#86909C]">
                    <tr>
                      <th className="px-3 py-3 text-right">付款金额</th>
                      <th className="px-3 py-3 text-left">付款方式</th>
                      <th className="px-3 py-3 text-left">付款日期</th>
                      <th className="px-3 py-3 text-left">备注</th>
                      <th className="px-3 py-3 text-left">记录人</th>
                      <th className="px-3 py-3 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0F5]">
                    {payments.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-[#86909C]">{paymentLoading ? '加载中…' : '暂无付款记录'}</td></tr>
                    ) : payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-3 py-3 text-right font-semibold text-[var(--color-success)]">+{formatMoney(payment.payment_amount)}</td>
                        <td className="px-3 py-3">{payment.method_desc || formatMethod(payment.method)}</td>
                        <td className="px-3 py-3">{(payment.payment_date || '').slice(0, 10)}</td>
                        <td className="px-3 py-3 text-[#4E5969]">{payment.remark || '-'}</td>
                        <td className="px-3 py-3 text-[#4E5969]">{payment.created_by_name || '-'}</td>
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => void deletePayment(payment.id)} className="text-xs text-[var(--color-danger)] hover:underline">删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {settlement.remark && (
              <div className="mt-6 rounded-md bg-[#F7F8FA] p-4 text-sm text-[#4E5969]">
                <div className="mb-1 text-xs font-medium text-[#86909C]">备注</div>
                {settlement.remark}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}