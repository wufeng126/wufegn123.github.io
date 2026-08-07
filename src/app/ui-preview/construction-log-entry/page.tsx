'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileImage,
  Link2,
  PencilLine,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react';

type PlanTask = {
  id: number;
  phase: string;
  area: string;
  floor: string;
  process: string;
  plannedQty: number;
  actualQty: number;
  unit: string;
  plannedProgress: number;
  actualProgress: number;
  planPeriod: string;
  status: 'active' | 'delay' | 'waiting';
};

const projects = [
  { id: 1, name: '南京中交智慧港项目', manager: '赵经理', date: '2026-08-05' },
  { id: 2, name: '滨河商业综合体二标', manager: '孙经理', date: '2026-08-05' },
  { id: 3, name: '城东学校改扩建项目', manager: '周经理', date: '2026-08-05' },
];

const initialTasks: Record<number, PlanTask[]> = {
  1: [
    {
      id: 101,
      phase: '主体结构',
      area: '1#楼',
      floor: '3F',
      process: '模板安装',
      plannedQty: 1000,
      actualQty: 780,
      unit: 'm2',
      plannedProgress: 100,
      actualProgress: 78,
      planPeriod: '8/03 - 8/05',
      status: 'active',
    },
    {
      id: 102,
      phase: '主体结构',
      area: '1#楼',
      floor: '3F',
      process: '钢筋绑扎',
      plannedQty: 49.2,
      actualQty: 35,
      unit: 't',
      plannedProgress: 65,
      actualProgress: 42,
      planPeriod: '8/05 - 8/09',
      status: 'delay',
    },
    {
      id: 103,
      phase: '主体结构',
      area: '1#楼',
      floor: '3F',
      process: '混凝土浇筑',
      plannedQty: 210,
      actualQty: 0,
      unit: 'm3',
      plannedProgress: 0,
      actualProgress: 0,
      planPeriod: '8/10 - 8/11',
      status: 'waiting',
    },
  ],
  2: [
    {
      id: 201,
      phase: '地下结构',
      area: 'B区',
      floor: 'B1',
      process: '砌体施工',
      plannedQty: 288,
      actualQty: 260,
      unit: 'm3',
      plannedProgress: 76,
      actualProgress: 72,
      planPeriod: '8/02 - 8/15',
      status: 'active',
    },
  ],
  3: [
    {
      id: 301,
      phase: '二次结构',
      area: '教学楼',
      floor: '2F',
      process: '样板验收',
      plannedQty: 340,
      actualQty: 300,
      unit: 'm2',
      plannedProgress: 55,
      actualProgress: 55,
      planPeriod: '8/01 - 8/12',
      status: 'active',
    },
  ],
};

const workers = [
  { id: 1, name: '张三', trade: '木工', hours: 10 },
  { id: 2, name: '李四', trade: '木工', hours: 10 },
  { id: 3, name: '王五', trade: '钢筋工', hours: 10 },
  { id: 4, name: '赵六', trade: '钢筋工', hours: 9.5 },
  { id: 5, name: '陈强', trade: '混凝土工', hours: 10 },
];

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getTaskStatus(task: PlanTask) {
  if (task.status === 'delay' || task.actualProgress + 10 < task.plannedProgress) {
    return {
      label: '进度偏慢',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
      bar: 'bg-amber-500',
    };
  }
  if (task.status === 'waiting') {
    return {
      label: '未开始',
      className: 'border-slate-200 bg-slate-50 text-slate-600',
      bar: 'bg-slate-300',
    };
  }
  return {
    label: '正常推进',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-500',
  };
}

export default function ConstructionLogEntryPreviewPage() {
  const [selectedProjectId, setSelectedProjectId] = useState(1);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([101, 102]);
  const [tasksByProject, setTasksByProject] = useState(initialTasks);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState([1, 2, 3, 4]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0];
  const projectTasks = tasksByProject[selectedProject.id] || [];
  const selectedTasks = projectTasks.filter((task) => selectedTaskIds.includes(task.id));
  const selectedWorkers = workers.filter((worker) => selectedWorkerIds.includes(worker.id));
  const totalHours = selectedWorkers.reduce((sum, worker) => sum + worker.hours, 0);
  const hasDelay = selectedTasks.some((task) => task.actualProgress + 10 < task.plannedProgress);

  const generatedContent = useMemo(() => {
    if (!selectedTasks.length) {
      return '今日未选择进度计划工序，请先选择需要回填实际进度的计划项。';
    }

    const taskText = selectedTasks
      .map(
        (task) =>
          `${task.area}${task.floor}${task.process}实际进度${task.actualProgress}%`,
      )
      .join('；');

    return `${taskText}。现场出勤${selectedWorkers.length}人，合计${totalHours}工时。`;
  }, [selectedTasks, selectedWorkers.length, totalHours]);

  function toggleTask(taskId: number) {
    setSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  }

  function updateTask(taskId: number, patch: Partial<PlanTask>) {
    setTasksByProject((current) => ({
      ...current,
      [selectedProject.id]: (current[selectedProject.id] || []).map((task) =>
        task.id === taskId ? { ...task, ...patch } : task,
      ),
    }));
  }

  function toggleWorker(workerId: number) {
    setSelectedWorkerIds((current) =>
      current.includes(workerId) ? current.filter((id) => id !== workerId) : [...current, workerId],
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs text-slate-500">施工管理 / 施工日志填写</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">按进度计划填写施工日志</h1>
            </div>

            <div className="grid gap-3 lg:grid-cols-[360px_180px]">
              <label className="relative block">
                <span className="mb-1 block text-xs text-slate-500">选择项目</span>
                <select
                  value={selectedProjectId}
                  onChange={(event) => {
                    const nextProjectId = Number(event.target.value);
                    setSelectedProjectId(nextProjectId);
                    setSelectedTaskIds((initialTasks[nextProjectId] || []).slice(0, 2).map((task) => task.id));
                  }}
                  className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 text-slate-400" />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">日志日期</span>
                <input
                  type="date"
                  value={selectedProject.date}
                  readOnly
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none"
                />
              </label>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">今日计划联动</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    系统按项目和日期带出当前时间段内的进度计划。项目经理只填写当天实际进度和现场情况。
                  </p>
                </div>
                <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-xs font-medium text-blue-700">
                  <Link2 className="h-3.5 w-3.5" />
                  来自进度计划
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {projectTasks.map((task) => {
                  const checked = selectedTaskIds.includes(task.id);
                  const status = getTaskStatus(task);

                  return (
                    <article key={task.id} className={`p-4 transition ${checked ? 'bg-blue-50/50' : 'bg-white'}`}>
                      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:items-center">
                        <button
                          type="button"
                          onClick={() => toggleTask(task.id)}
                          className="flex items-start gap-3 text-left"
                        >
                          <span
                            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                              checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked ? '✓' : ''}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-950">
                              {task.area} {task.floor} {task.process}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                              {task.phase} · 计划 {task.planPeriod}
                            </span>
                            <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}>
                              {status.label}
                            </span>
                          </span>
                        </button>

                        <div>
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                            <span>计划 {task.plannedProgress}%</span>
                            <span>实际 {task.actualProgress}%</span>
                          </div>
                          <div className="relative h-7 rounded-full bg-slate-100">
                            <div
                              className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-300"
                              style={{ width: `${task.plannedProgress}%` }}
                            />
                            <div
                              className={`absolute left-0 top-1/2 h-4 -translate-y-1/2 rounded-full ${status.bar}`}
                              style={{ width: `${task.actualProgress}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <label className="block">
                            <span className="mb-1 block text-xs text-slate-500">实际进度</span>
                            <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={task.actualProgress}
                                onChange={(event) => updateTask(task.id, { actualProgress: Number(event.target.value || 0) })}
                                className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none"
                              />
                              <span className="ml-1 text-xs text-slate-500">%</span>
                            </div>
                          </label>
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            匹配工程量 {formatQty(task.plannedQty)} {task.unit} 由预算员维护。施工日志只同步实际进度。
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">施工内容</h2>
                  <p className="mt-1 text-sm text-slate-500">根据已选计划项自动生成初稿，现场人员可继续补充实际施工情况。</p>
                </div>
                <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300">
                  <Sparkles className="h-4 w-4" />
                  重新整理
                </button>
              </div>
              <textarea
                value={generatedContent}
                readOnly
                className="min-h-[120px] w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">出勤人员</h2>
                  <span className="text-xs text-slate-500">
                    {selectedWorkers.length} 人 / {totalHours} 工时
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {workers.map((worker) => {
                    const checked = selectedWorkerIds.includes(worker.id);
                    return (
                      <button
                        key={worker.id}
                        type="button"
                        onClick={() => toggleWorker(worker.id)}
                        className={`rounded-lg border p-3 text-left transition ${
                          checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{worker.name}</span>
                          <span className="text-xs text-slate-500">{worker.hours}h</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{worker.trade}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">照片与附件</h2>
                  <span className="text-xs text-slate-500">用于佐证实际进度</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button className="flex min-h-[116px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50">
                    <Camera className="h-5 w-5" />
                    拍照
                  </button>
                  <button className="flex min-h-[116px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50">
                    <Upload className="h-5 w-5" />
                    上传照片
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <FileImage className="h-4 w-4 text-slate-400" />
                  模板安装照片 3 张、钢筋绑扎照片 2 张将随日志归档。
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <h2 className="font-semibold">联动结果预览</h2>
                <p className="mt-1 text-sm text-slate-500">施工日志提交后只处理日维度结果，月度报量差异由报量管理统一判断。</p>
              </div>
              <div className="space-y-3 p-4">
                <LinkCard
                  icon={<ClipboardList className="h-4 w-4 text-blue-600" />}
                  title="进度计划"
                  content={`${selectedTasks.length} 个计划项将更新实际进度和日志依据。`}
                />
                <LinkCard
                  icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                  title="风险提醒"
                  content={hasDelay ? '存在计划进度偏慢项，提交后进入施工日志风险池提醒确认。' : '当前无明显进度偏差。'}
                  danger={hasDelay}
                />
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">进度偏差说明</h2>
              <textarea
                placeholder="如实际进度低于计划，在这里填写原因，例如材料未到场、甲方指令调整、天气影响等。"
                className="mt-3 min-h-[110px] w-full resize-none rounded-lg border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {hasDelay && (
                <div className="mt-3 flex gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>当前日志存在进度偏差，提交时建议补充原因，方便项目经理和老板查看过程风险。</span>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">提交动作</h2>
              <div className="mt-3 grid gap-2">
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300">
                  <PencilLine className="h-4 w-4" />
                  保存草稿
                </button>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300">
                  <CalendarDays className="h-4 w-4" />
                  预约提交
                </button>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-medium text-white">
                  <Save className="h-4 w-4" />
                  提交日志并同步进度
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <h2 className="font-semibold text-blue-950">建议闭环</h2>
                  <ol className="mt-2 space-y-2 text-sm leading-6 text-blue-800">
                    <li>1. 项目经理在进度计划中编排楼层、工序和计划周期。</li>
                    <li>2. 施工日志按项目和日期自动带出当天相关工序。</li>
                    <li>3. 日志回填实际进度、出勤、现场情况和照片。</li>
                    <li>4. 月底在报量管理中按匹配工程量和实际报量做统一分析。</li>
                  </ol>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function LinkCard({
  icon,
  title,
  content,
  danger = false,
}: {
  icon: ReactNode;
  title: string;
  content: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{content}</p>
        </div>
      </div>
    </div>
  );
}
