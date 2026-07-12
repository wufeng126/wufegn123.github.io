'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Save, Check } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

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

interface SystemUser {
  id: number;
  username: string;
  name?: string;
  role: string;
}

export default function ApprovalConfigPage() {
  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [editing, setEditing] = useState<WorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<SystemUser[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/system/workflow-config').then(r => r.json()),
      fetch('/api/auth/center/users').then(r => r.json()),
    ]).then(([wJ, uJ]) => {
      if (uJ && uJ.users) setUsers(uJ.users);
      if (wJ.success) {
        if (wJ.data && wJ.data.length > 0) {
          setConfigs(wJ.data);
        } else {
          createDefaultConfig();
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  async function createDefaultConfig() {
    const defaultSteps: WorkflowStep[] = [
      { state: 'draft', label: '预算员填报', role: 'admin,super_admin', actor: '预算员' },
      { state: 'manager_review', label: '项目经理补充', role: 'project_manager', actor: '项目经理' },
      { state: 'budget_confirm', label: '预算确认', role: 'admin,super_admin', actor: '预算员' },
      { state: 'boss_review', label: '老板批复', role: 'boss', actor: '老板' },
      { state: 'completed', label: '完成', role: '', actor: '' },
    ];
    try {
      const res = await fetch('/api/system/workflow-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_type: 'monthly_analysis', name: '月度分析审批流程', steps: defaultSteps }),
      });
      const json = await res.json();
      if (json.success) setConfigs([json.data]);
    } catch {}
  }

  function createNewWorkflow() {
    const newConfig: WorkflowConfig = {
      id: 0,
      workflow_type: 'new_' + Date.now(),
      name: '新审批流程',
      steps: [
        { state: 'step_1', label: '第一步', role: 'admin,super_admin', actor: '负责人' },
        { state: 'completed', label: '完成', role: '', actor: '' },
      ],
    };
    setEditing(newConfig);
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
      toast.success('保存成功');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  }

  function addStep() {
    if (!editing) return;
    setEditing({
      ...editing,
      steps: [...editing.steps, { state: '', label: '', role: '', actor: '' }],
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
          actor: user.name || user.username,
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
    <div className="min-h-full bg-[#F5F6FA] p-6 flex items-center justify-center text-sm text-[#86909C]">加载中...</div>
  );

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/system-management" className="inline-flex items-center gap-1 text-sm text-[#86909C] hover:text-[#165DFF] mb-2">
              <ArrowLeft className="h-4 w-4" /> 返回系统管理
            </Link>
            <h1 className="text-2xl font-bold text-[#1D2129]">审批流程配置</h1>
            <p className="text-sm text-[#86909C] mt-0.5">自定义月度分析等业务流程的审批节点和责任人</p>
          </div>
          <button onClick={createNewWorkflow} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm text-white shadow-md hover:bg-[#0E49D8]">
            <Plus className="h-4 w-4" /> 新建流程
          </button>
        </div>

        {configs.length === 0 && !loading ? (
          <div className="bg-white rounded-xl border border-dashed border-[#E5E6EB] p-14 text-center">
            <p className="text-sm text-[#86909C] mb-4">暂无审批流程，点击"新建流程"创建</p>
          </div>
        ) : null}

        {configs.map(config => (
          <div key={config.id} className="bg-white rounded-xl border border-[#E5E6EB] overflow-hidden mb-5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E6EB]">
              <div>
                <h2 className="font-semibold text-[#1D2129]">{config.name}</h2>
                <p className="text-xs text-[#86909C] mt-0.5">流程类型：{config.workflow_type} · {config.steps.length} 个节点</p>
              </div>
              <button onClick={() => setEditing(JSON.parse(JSON.stringify(config)))}
                className="text-sm text-[#165DFF] hover:underline">编辑</button>
            </div>

            {/* 当前流程预览 */}
            <div className="p-5">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {config.steps.filter(s => s.role).map((step, i) => (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    {i > 0 && <div className="w-6 h-px bg-[#165DFF]" />}
                    <div className="px-3 py-2 rounded-lg border border-[#165DFF]/30 bg-[#F0F5FF] min-w-[100px]">
                      <p className="text-sm font-medium text-[#165DFF]">{step.label}</p>
                      <p className="text-xs text-[#86909C] mt-0.5">{step.actor} · {rolesLabel(step.role)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-6 h-px bg-[#10B981]" />
                  <div className="px-3 py-2 rounded-lg border border-[#10B981]/30 bg-[#E8FFEA] min-w-[100px]">
                    <p className="text-sm font-medium text-[#10B981]">完成<Check className="h-3 w-3 inline ml-1" /></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* 编辑弹窗 */}
        {editing && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E6EB]">
                <h2 className="font-semibold text-[#1D2129]">编辑：{editing.name}</h2>
                <button onClick={() => setEditing(null)} className="text-[#86909C] hover:text-[#1D2129]">✕</button>
              </div>
              <div className="p-5 space-y-4">
                {/* 流程名称 */}
                <div>
                  <label className="block text-sm font-medium text-[#1D2129] mb-1">流程名称</label>
                  <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                    className="w-full h-10 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
                </div>

                {/* 步骤列表 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[#1D2129]">审批节点</label>
                    <button onClick={addStep} className="inline-flex items-center gap-1 text-xs text-[#165DFF] hover:underline">
                      <Plus className="h-3.5 w-3.5" /> 添加节点
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editing.steps.filter(s => s.label).map((step, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-[#E5E6EB] bg-[#FAFBFC]">
                        <span className="text-xs text-[#86909C] w-5 shrink-0">{i + 1}</span>
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-[#86909C]">节点名称</label>
                            <input value={step.label} onChange={e => updateStep(i, 'label', e.target.value)}
                              className="w-full h-8 rounded border border-[#E5E6EB] px-2 text-xs outline-none focus:border-[#165DFF]" />
                          </div>
                          <div>
                            <label className="text-[10px] text-[#8A8F98]">责任人标注</label>
                            <input value={step.actor} onChange={e => updateStep(i, 'actor', e.target.value)}
                              placeholder="审批人姓名"
                              className="w-full h-8 rounded border border-[rgba(0,0,0,0.06)] px-2 text-xs outline-none focus:border-[#165DFF]" />
                          </div>
                          <div>
                            <label className="text-[10px] text-[#8A8F98]">指定审批人</label>
                            <select value={step.role} onChange={e => updateStep(i, 'role', e.target.value)}
                              className="w-full h-8 rounded border border-[rgba(0,0,0,0.06)] px-2 text-xs outline-none focus:border-[#165DFF]">
                              <option value="">选择用户</option>
                              {users
                                .filter(u => u.username !== 'admin')
                                .map(u => (
                                <option key={u.id} value={`user:${u.id}`}>
                                  {u.name || u.username} · {u.role}
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

                <div className="pt-3 flex items-center gap-3 justify-end border-t border-[#E5E6EB]">
                  <button onClick={() => setEditing(null)} className="h-9 px-4 rounded-lg border border-[#E5E6EB] text-sm text-[#4E5969]">取消</button>
                  <button onClick={save} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#165DFF] px-4 text-sm text-white">
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
