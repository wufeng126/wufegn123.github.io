'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Save, Check, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getUserDisplayName } from '@/lib/user-display-name';

interface WorkflowStep {
  state: string;
  label: string;
  role: string;
  actor: string;
}

interface WorkflowConfig {
  id: number;
  workflow_type: string;
  name: string;
  steps: WorkflowStep[];
}

const AVAILABLE_ROLES = [
  { value: 'admin,super_admin', label: '预算员/管理员' },
  { value: 'project_manager', label: '项目经理' },
  { value: 'boss', label: '老板' },
  { value: 'finance', label: '财务' },
  { value: 'team_leader', label: '班组长' },
];

const DEFAULT_WORKFLOW_CONFIGS = [
  {
    workflow_type: 'monthly_analysis',
    name: '月度分析审批流程',
    steps: [
      { state: 'draft', label: '预算员填报', role: 'admin,super_admin', actor: '预算员' },
      { state: 'manager_review', label: '项目经理补充', role: 'project_manager', actor: '项目经理' },
      { state: 'budget_confirm', label: '预算确认', role: 'admin,super_admin', actor: '预算员' },
      { state: 'boss_review', label: '老板批复', role: 'boss', actor: '老板' },
      { state: 'completed', label: '完成', role: '', actor: '' },
    ],
  },
  {
    workflow_type: 'construction_log_confirm',
    name: '施工日志确认流程',
    steps: [
      { state: 'pending', label: '风险待确认', role: 'project_manager', actor: '项目经理' },
      { state: 'budget_notice', label: '预算员提醒', role: 'admin,super_admin', actor: '预算员' },
      { state: 'completed', label: '完成', role: '', actor: '' },
    ],
  },
  {
    workflow_type: 'visa',
    name: '签证办理审批流程',
    steps: [
      { state: 'draft', label: '现场发起', role: 'project_manager,team_leader', actor: '现场人员' },
      { state: 'budget_review', label: '预算审核', role: 'admin,super_admin', actor: '预算员' },
      { state: 'boss_review', label: '老板审批', role: 'boss', actor: '老板' },
      { state: 'completed', label: '完成', role: '', actor: '' },
    ],
  },
];

interface SystemUser {
  id: number;
  username: string;
  name?: string;
  dingtalk_name?: string | null;
  role: string;
}

export default function ApprovalConfigPage() {
  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [editing, setEditing] = useState<WorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [wJ, uJ] = await Promise.all([
        fetch('/api/system/workflow-config').then(r => r.json()),
        fetch('/api/auth/center/users').then(r => r.json()),
      ]);
      if (uJ && uJ.users) setUsers(uJ.users);
      if (wJ.success) {
        if (wJ.data && wJ.data.length > 0) {
          setConfigs(wJ.data);
        } else {
          await createDefaultConfig(false);
        }
      } else {
        toast.error(wJ.error || '审批流程加载失败');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '审批流程加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function createDefaultConfig(showToast = true) {
    setSavingDefaults(true);
    try {
      const results = await Promise.all(DEFAULT_WORKFLOW_CONFIGS.map(config =>
        fetch('/api/system/workflow-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        }).then(res => res.json())
      ));
      const failed = results.find(json => !json.success);
      if (failed) throw new Error(failed.error || '默认流程恢复失败');
      setConfigs(results.map(json => json.data));
      if (showToast) toast.success('默认审批流程已恢复');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '默认流程恢复失败');
    } finally {
      setSavingDefaults(false);
    }
  }

  async function save() {
    if (!editing) return;
    try {
      const res = await fetch('/api/system/workflow-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_type: editing.workflow_type,
          name: editing.name,
          steps: editing.steps,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setConfigs(prev => {
        const idx = prev.findIndex(c => c.id === json.data.id);
        if (idx >= 0) { const n = [...prev]; n[idx] = json.data; return n; }
        return [...prev, json.data];
      });
      setEditing(null);
      toast.success('保存成功');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  }

  function addStep() {
    if (!editing) return;
    setEditing({
      ...editing,
      steps: [...editing.steps, { state: `step_${editing.steps.length + 1}`, label: '', role: '', actor: '' }],
    });
  }

  function updateStep(i: number, field: string, value: string) {
    if (!editing) return;
    const steps = [...editing.steps];
    if (field === 'role' && value.startsWith('user:')) {
      // 选择了用户 → 自动填充角色和责任人
      const userId = parseInt(value.replace('user:', ''));
      const user = users.find(u => u.id === userId);
      if (user) {
        steps[i] = {
          role: user.role === 'super_admin' ? 'admin,super_admin' : user.role,
          label: steps[i].label || '',
          state: steps[i].state || '',
          actor: getUserDisplayName(user),
        };
      }
      setEditing({ ...editing, steps });
      return;
    }
    steps[i] = { ...steps[i], [field]: value };
    if (field === 'label' && !steps[i].state) {
      steps[i].state = value
        .replace(/[（(].*[）)]/g, '').trim()
        .replace(/\s+/g, '_')
        .toLowerCase();
    }
    setEditing({ ...editing, steps });
  }

  function removeStep(i: number) {
    if (!editing) return;
    setEditing({ ...editing, steps: editing.steps.filter((_, idx) => idx !== i) });
  }

  const rolesLabel = (roles: string) => {
    return roles.split(',').map(r => AVAILABLE_ROLES.find(a => a.value.includes(r))?.label || r).join('、');
  };

  if (loading) return (
    <div className="min-h-full bg-[var(--color-muted)] px-3 py-4 sm:p-4 md:p-6 flex items-center justify-center text-sm text-[var(--color-text-3)]">加载中...</div>
  );

  return (
    <div className="min-h-full bg-[var(--color-muted)] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/system-management" className="inline-flex items-center gap-1 text-sm text-[var(--color-text-3)] hover:text-[var(--color-primary)] mb-2">
              <ArrowLeft className="h-4 w-4" /> 返回系统管理
            </Link>
            <h1 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">审批流程配置</h1>
            <p className="text-sm text-[var(--color-text-3)] mt-0.5">自定义月度分析等业务流程的审批节点和责任人</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-full bg-[var(--color-accent)] px-3 text-xs font-medium text-[var(--color-primary)]">当前启用 3 类流程</span>
            <button
              onClick={() => createDefaultConfig()}
              disabled={savingDefaults}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D8E3FF] bg-card px-3 text-xs font-medium text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {savingDefaults ? '恢复中' : '恢复默认流程'}
            </button>
          </div>
        </div>

        {configs.length === 0 && !loading ? (
          <div className="bg-card rounded-xl border border-dashed border-[var(--border)] p-14 text-center">
            <p className="text-sm text-[var(--color-text-3)] mb-4">暂无审批流程，可先恢复系统默认的三类流程</p>
            <button
              onClick={() => createDefaultConfig()}
              disabled={savingDefaults}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              {savingDefaults ? '恢复中' : '恢复默认流程'}
            </button>
          </div>
        ) : null}

        {configs.map(config => (
          <div key={config.id} className="bg-card rounded-xl border border-[var(--border)] overflow-hidden mb-5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div>
                <h2 className="font-semibold text-[var(--foreground)]">{config.name}</h2>
                <p className="text-xs text-[var(--color-text-3)] mt-0.5">流程类型：{config.workflow_type} · {config.steps.length} 个节点</p>
              </div>
              <button onClick={() => setEditing(JSON.parse(JSON.stringify(config)))}
                className="text-sm text-[var(--color-primary)] hover:underline">编辑</button>
            </div>

            {/* 当前流程预览 */}
            <div className="p-5">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {config.steps.filter(s => s.role).map((step, i) => (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    {i > 0 && <div className="w-6 h-px bg-[var(--color-primary)]" />}
                    <div className="px-3 py-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-accent)] min-w-[100px]">
                      <p className="text-sm font-medium text-[var(--color-primary)]">{step.label}</p>
                      <p className="text-xs text-[var(--color-text-3)] mt-0.5">{step.actor} · {rolesLabel(step.role)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-6 h-px bg-[#00B42A]" />
                  <div className="px-3 py-2 rounded-lg border border-[#00B42A]/30 bg-[#E8FFEA] min-w-[100px]">
                    <p className="text-sm font-medium text-[#00B42A]">完成<Check className="h-3 w-3 inline ml-1" /></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* 编辑弹窗 */}
        {editing && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
            <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-[var(--border)] sm:px-5">
                <h2 className="font-semibold text-[var(--foreground)]">编辑：{editing.name}</h2>
                <button onClick={() => setEditing(null)} className="text-[var(--color-text-3)] hover:text-[var(--foreground)]">✕</button>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                {/* 流程名称 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">流程名称</label>
                  <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                    className="w-full h-10 rounded-lg border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
                </div>

                {/* 步骤列表 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[var(--foreground)]">审批节点</label>
                    <button onClick={addStep} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
                      <Plus className="h-3.5 w-3.5" /> 添加节点
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editing.steps.map((step, i) => (
                      <div key={i} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--color-muted)] p-3 sm:flex-row sm:items-center">
                        <span className="text-xs text-[var(--color-text-3)] w-5 shrink-0">{i + 1}</span>
                        <div className="grid w-full flex-1 gap-2 sm:grid-cols-3">
                          <div>
                            <label className="text-[10px] text-[var(--color-text-3)]">节点名称</label>
                            <input value={step.label} onChange={e => updateStep(i, 'label', e.target.value)}
                              className="w-full h-8 rounded border border-[var(--border)] px-2 text-xs outline-none focus:border-[var(--color-primary)]" />
                          </div>
                          <div>
                            <label className="text-[10px] text-[var(--color-text-3)]">责任人标注</label>
                            <input value={step.actor} onChange={e => updateStep(i, 'actor', e.target.value)}
                              placeholder="审批人姓名"
                              className="w-full h-8 rounded border border-[rgba(0,0,0,0.06)] px-2 text-xs outline-none focus:border-[var(--color-primary)]" />
                          </div>
                          <div>
                            <label className="text-[10px] text-[var(--color-text-3)]">指定审批人</label>
                            <select value={step.role} onChange={e => updateStep(i, 'role', e.target.value)}
                              className="w-full h-8 rounded border border-[rgba(0,0,0,0.06)] px-2 text-xs outline-none focus:border-[var(--color-primary)]">
                              <option value="">选择用户</option>
                              {users
                                .filter(u => u.username !== 'admin')
                                .map(u => (
                                <option key={u.id} value={`user:${u.id}`}>
                                  {getUserDisplayName(u)} · {u.role}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button onClick={() => removeStep(i)} className="shrink-0 text-[#F53F3F] hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 sm:flex sm:items-center sm:justify-end sm:gap-3">
                  <button onClick={() => setEditing(null)} className="h-9 px-4 rounded-lg border border-[var(--border)] text-sm text-[var(--color-text-2)]">取消</button>
                  <button onClick={save} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm text-white">
                    <Save className="h-4 w-4" /> 保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
