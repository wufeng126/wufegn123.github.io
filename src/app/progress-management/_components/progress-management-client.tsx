'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  Layers3,
  Link2,
  PencilLine,
  Plus,
  Save,
  X,
} from 'lucide-react';

type ProjectStatus = '正常推进' | '轻微滞后' | '重点关注';
type EditorMode = 'plan' | 'quantity';
type PlanViewMode = 'month' | 'overall';

type PlanMonth = {
  id: string;
  label: string;
  period: string;
  range: [number, number];
  focus: string;
};

type FoundationOptions = {
  areas: string[];
  floors: string[];
  phases: string[];
  processes: string[];
  responsibilities: string[];
  dependencies: string[];
};

type Project = {
  id: number;
  name: string;
  manager: string;
  budgeter: string;
  status: ProjectStatus;
  currentPeriod: string;
};

type PlanTask = {
  id: number;
  projectId: number;
  yearMonth?: string;
  wbs: string;
  phase: string;
  area: string;
  floor: string;
  process: string;
  ownerRole: string;
  dependency: string;
  logic: 'FS' | 'SS' | 'FF';
  planStartDate?: string;
  planEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  planStart: number;
  planEnd: number;
  actualStart: number;
  actualEnd: number;
  actualProgress: number;
  plannedQty: number;
  actualQty: number;
  reportedQty: number;
  unit: string;
  subitemId?: number | null;
  quantityItem: string;
  issue: string;
  nextAction: string;
  isKey?: boolean;
};

type Milestone = {
  projectId: number;
  label: string;
  position: number;
  status: '已完成' | '进行中' | '预警';
};

type DragState = {
  taskId: number;
  kind: 'plan' | 'actual';
  pointerStartX: number;
  start: number;
  end: number;
  width: number;
};

type QuantitySubitem = {
  id: number;
  subitem_name: string;
  unit: string;
  budget_quantity: string | number | null;
  project_id: number;
};

type ProgressApiResponse = {
  projects: Array<{ id: number; name: string; status?: string }>;
  selectedProjectId: number | null;
  foundations: {
    area?: string[];
    floor?: string[];
    phase?: string[];
    process?: string[];
    dependency?: string[];
    responsibility?: string[];
  };
  tasks: Array<{
    id: number;
    project_id: number;
    year_month: string;
    wbs: string;
    phase: string;
    area: string;
    floor: string;
    process: string;
    owner_role: string;
    dependency: string;
    logic: 'FS' | 'SS' | 'FF';
    plan_start_date: string;
    plan_end_date: string;
    actual_start_date: string | null;
    actual_end_date: string | null;
    actual_progress: number;
    issue: string;
    next_action: string;
    is_key: boolean;
    subitem_id: number | null;
    quantity_item: string;
    matched_quantity: number;
    unit: string;
  }>;
  subitems: QuantitySubitem[];
};

const defaultPlanMonths: PlanMonth[] = [
  { id: '2026-08', label: '2026年8月计划', period: '2026.08.01 - 2026.08.31', range: [0, 35], focus: '主体结构 1-3 层' },
  { id: '2026-09', label: '2026年9月计划', period: '2026.09.01 - 2026.09.30', range: [35, 70], focus: '主体结构 3-6 层' },
  { id: '2026-10', label: '2026年10月计划', period: '2026.10.01 - 2026.10.31', range: [70, 100], focus: '二次结构与穿插施工' },
] ;

const defaultProjectBaseInfo: FoundationOptions = {
  areas: ['1#楼', '2#楼', '地下室A区', '地下室B区', '商业裙房'],
  floors: ['B2', 'B1', '1F', '2F', '3F', '4F', '5F', '屋面层'],
  phases: ['基础施工', '主体结构', '二次结构', '装饰装修', '机电穿插'],
  processes: ['模板安装', '钢筋绑扎', '混凝土浇筑', '砌体施工', '抹灰施工', '管线预留', '样板验收'],
  responsibilities: ['项目经理负责协调现场资源', '现场负责人跟进实际完成', '预算员负责工程量匹配', '资料员补齐过程资料'],
  dependencies: ['上一道工序完成后开始', '材料到场后开始', '验收通过后开始', '可与上一道工序同步推进', '甲方确认后开始'],
};

const overallTimeline = ['8月', '9月', '10月', '11月', '12月', '1月', '2月'];
const monthlyTimeline: Record<string, string[]> = {
  '2026-08': ['8/1', '8/5', '8/10', '8/15', '8/20', '8/25', '8/31'],
  '2026-09': ['9/1', '9/5', '9/10', '9/15', '9/20', '9/25', '9/30'],
  '2026-10': ['10/1', '10/5', '10/10', '10/15', '10/20', '10/25', '10/31'],
};

const projects: Project[] = [
  {
    id: 1,
    name: '南京中交智慧港项目',
    manager: '赵经理',
    budgeter: '王预算',
    status: '轻微滞后',
    currentPeriod: '2026.08.01 - 2026.08.31',
  },
  {
    id: 2,
    name: '滨河商业综合体二标',
    manager: '孙经理',
    budgeter: '李预算',
    status: '正常推进',
    currentPeriod: '2026.08.01 - 2026.08.31',
  },
  {
    id: 3,
    name: '城东学校改扩建项目',
    manager: '周经理',
    budgeter: '张预算',
    status: '重点关注',
    currentPeriod: '2026.08.01 - 2026.08.31',
  },
];

const initialTasks: PlanTask[] = [
  {
    id: 101,
    projectId: 1,
    wbs: '1.1.01',
    phase: '主体结构',
    area: '1#楼',
    floor: '1F',
    process: '模板',
    ownerRole: '项目经理',
    dependency: '基础验收完成',
    logic: 'FS',
    planStart: 3,
    planEnd: 16,
    actualStart: 4,
    actualEnd: 15,
    actualProgress: 100,
    plannedQty: 980,
    actualQty: 980,
    reportedQty: 980,
    unit: 'm2',
    quantityItem: '主体结构模板工程',
    issue: '正常完成',
    nextAction: '沉淀为同类楼层模板标准工期',
  },
  {
    id: 102,
    projectId: 1,
    wbs: '1.1.02',
    phase: '主体结构',
    area: '1#楼',
    floor: '2F',
    process: '模板',
    ownerRole: '项目经理',
    dependency: '1F混凝土完成',
    logic: 'FS',
    planStart: 16,
    planEnd: 29,
    actualStart: 18,
    actualEnd: 32,
    actualProgress: 100,
    plannedQty: 1000,
    actualQty: 1000,
    reportedQty: 1000,
    unit: 'm2',
    quantityItem: '主体结构模板工程',
    issue: '晚开工2天，已赶回',
    nextAction: '后续楼层按实际起算调整排程',
  },
  {
    id: 103,
    projectId: 1,
    wbs: '1.1.03',
    phase: '主体结构',
    area: '1#楼',
    floor: '3F',
    process: '模板',
    ownerRole: '项目经理',
    dependency: '2F混凝土完成',
    logic: 'FS',
    planStart: 29,
    planEnd: 42,
    actualStart: 34,
    actualEnd: 51,
    actualProgress: 100,
    plannedQty: 1000,
    actualQty: 1000,
    reportedQty: 0,
    unit: 'm2',
    quantityItem: '主体结构模板工程',
    issue: '现场已完成，月度报量未体现',
    nextAction: '预算员补充签认资料，月底在报量管理中统一复核',
    isKey: true,
  },
  {
    id: 104,
    projectId: 1,
    wbs: '1.1.04',
    phase: '主体结构',
    area: '1#楼',
    floor: '3F',
    process: '钢筋',
    ownerRole: '项目经理',
    dependency: '3F模板完成',
    logic: 'SS',
    planStart: 41,
    planEnd: 56,
    actualStart: 47,
    actualEnd: 61,
    actualProgress: 64,
    plannedQty: 49.2,
    actualQty: 42.4,
    reportedQty: 35,
    unit: 't',
    quantityItem: '主体结构钢筋工程',
    issue: '隐蔽验收照片不足，报量偏保守',
    nextAction: '施工日志补齐照片，预算员复核是否追报',
  },
  {
    id: 105,
    projectId: 1,
    wbs: '1.1.05',
    phase: '主体结构',
    area: '1#楼',
    floor: '3F',
    process: '混凝土',
    ownerRole: '项目经理',
    dependency: '3F钢筋验收',
    logic: 'FS',
    planStart: 58,
    planEnd: 66,
    actualStart: 67,
    actualEnd: 70,
    actualProgress: 0,
    plannedQty: 210,
    actualQty: 0,
    reportedQty: 0,
    unit: 'm3',
    quantityItem: '主体结构混凝土工程',
    issue: '未到实际浇筑节点',
    nextAction: '等待钢筋验收后自动进入日志待填',
  },
  {
    id: 201,
    projectId: 2,
    wbs: '2.1.01',
    phase: '地下结构',
    area: 'B区',
    floor: 'B1',
    process: '砌体',
    ownerRole: '项目经理',
    dependency: '结构验收',
    logic: 'FS',
    planStart: 8,
    planEnd: 35,
    actualStart: 9,
    actualEnd: 34,
    actualProgress: 76,
    plannedQty: 288,
    actualQty: 260,
    reportedQty: 260,
    unit: 'm3',
    quantityItem: '地下室砌筑工程',
    issue: '尾项修补未完成',
    nextAction: '下周复核尾项并补齐照片',
  },
  {
    id: 202,
    projectId: 2,
    wbs: '2.2.01',
    phase: '机电穿插',
    area: 'A区',
    floor: '1F',
    process: '预留洞复核',
    ownerRole: '项目经理',
    dependency: '砌体完成50%',
    logic: 'SS',
    planStart: 36,
    planEnd: 68,
    actualStart: 38,
    actualEnd: 66,
    actualProgress: 48,
    plannedQty: 18,
    actualQty: 16,
    reportedQty: 16,
    unit: '项',
    quantityItem: '机电预留预埋',
    issue: '局部变更待甲方确认',
    nextAction: '关联证据链，形成签证提醒',
  },
  {
    id: 301,
    projectId: 3,
    wbs: '3.1.01',
    phase: '二次结构',
    area: '教学楼',
    floor: '2F',
    process: '样板验收',
    ownerRole: '项目经理',
    dependency: '材料进场',
    logic: 'FS',
    planStart: 14,
    planEnd: 42,
    actualStart: 18,
    actualEnd: 35,
    actualProgress: 55,
    plannedQty: 340,
    actualQty: 300,
    reportedQty: 410,
    unit: 'm2',
    quantityItem: '二次结构样板工程',
    issue: '报量大于现场确认量',
    nextAction: '预算员核查是否包含上月遗留',
    isKey: true,
  },
];

const milestones: Milestone[] = [
  { projectId: 1, label: '3F结构验收', position: 56, status: '进行中' },
  { projectId: 1, label: '主体封顶', position: 82, status: '预警' },
  { projectId: 2, label: '地下室移交', position: 50, status: '进行中' },
  { projectId: 3, label: '样板确认', position: 42, status: '预警' },
];

// 今日在计划时间轴中的位置（0-100），按真实日期动态计算，替代写死的固定值
function computeTodayPosition(months: Array<{ period?: string }>): number {
  const parsePeriod = (s: string) => {
    const m = s.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const first = months.length ? parsePeriod(months[0].period || '') : null;
  const last = months.length > 1 ? parsePeriod(months[months.length - 1].period || '') : null;
  if (!first || !last || last.getTime() <= first.getTime()) return 50;
  const now = new Date();
  const ratio = (now.getTime() - first.getTime()) / (last.getTime() - first.getTime());
  return Math.round(clamp(ratio, 0, 1) * 100);
}

const todayPosition = computeTodayPosition(defaultPlanMonths);

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getDaysInPlanMonth(monthId: string) {
  const [year, month] = monthId.split('-').map(Number);
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function positionToMonthDate(value: number, month: PlanMonth) {
  const [start, end] = month.range;
  const days = getDaysInPlanMonth(month.id);
  const ratio = clamp((value - start) / Math.max(1, end - start), 0, 1);
  const day = clamp(Math.round(ratio * (days - 1)) + 1, 1, days);
  return `${month.id}-${String(day).padStart(2, '0')}`;
}

function monthDateToPosition(value: string, month: PlanMonth) {
  const [start, end] = month.range;
  const days = getDaysInPlanMonth(month.id);
  const day = Number(value.slice(-2)) || 1;
  const ratio = (clamp(day, 1, days) - 1) / Math.max(1, days - 1);
  return clamp(Math.round(start + ratio * (end - start)), start, end);
}

function getLogicLabel(logic: PlanTask['logic']) {
  if (logic === 'SS') return '可同步推进';
  if (logic === 'FF') return '需要同步完成';
  return '上一道完成后开始';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPlannedProgress(task: PlanTask) {
  if (todayPosition >= task.planEnd) return 100;
  if (todayPosition <= task.planStart) return 0;
  return Math.round(((todayPosition - task.planStart) / (task.planEnd - task.planStart)) * 100);
}

function getTaskState(task: PlanTask) {
  const plannedProgress = getPlannedProgress(task);

  if (task.actualProgress >= 100 && task.actualEnd <= task.planEnd + 3) {
    return {
      label: '完成',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      actualBar: 'bg-emerald-500',
    };
  }
  if (task.actualProgress + 10 < plannedProgress || task.actualEnd > task.planEnd + 4) {
    return {
      label: '滞后',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      actualBar: 'bg-rose-500',
    };
  }
  if (task.actualProgress > 0) {
    return {
      label: '推进中',
      className: 'border-primary/20 bg-accent text-primary',
      actualBar: 'bg-primary',
    };
  }
  return {
    label: '未开始',
    className: 'border-border bg-muted/50 text-muted-foreground',
    actualBar: 'bg-border',
  };
}

function getStatusClass(status: ProjectStatus) {
  if (status === '正常推进') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === '轻微滞后') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function taskInMonth(task: PlanTask, month: PlanMonth) {
  const [start, end] = month.range;
  return task.planStart <= end && task.planEnd >= start;
}

function addMonths(monthId: string, offset: number) {
  const [year, month] = monthId.split('-').map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || 1) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthId: string) {
  const [year, month] = monthId.split('-');
  return `${year}年${Number(month)}月计划`;
}

function getMonthPeriod(monthId: string) {
  const days = getDaysInPlanMonth(monthId);
  return `${monthId.replace('-', '.')} .01 - ${monthId.replace('-', '.')}.${String(days).padStart(2, '0')}`.replace(' .', '.');
}

function buildPlanMonths(tasks: PlanTask[]): PlanMonth[] {
  const taskMonths = Array.from(new Set(tasks.map((task) => task.yearMonth || task.planStartDate?.slice(0, 7)).filter(Boolean))) as string[];
  const baseMonth = taskMonths[0] || new Date().toISOString().slice(0, 7);
  const monthIds = taskMonths.length > 0
    ? taskMonths.sort()
    : [baseMonth, addMonths(baseMonth, 1), addMonths(baseMonth, 2)];
  const step = 100 / Math.max(1, monthIds.length);

  return monthIds.map((monthId, index) => ({
    id: monthId,
    label: getMonthLabel(monthId),
    period: getMonthPeriod(monthId),
    range: [Math.round(index * step), Math.round((index + 1) * step)] as [number, number],
    focus: '点击编辑计划维护本月楼栋、楼层和工序安排',
  }));
}

function getMonthTimeline(monthId: string) {
  if (monthlyTimeline[monthId]) return monthlyTimeline[monthId];
  const days = getDaysInPlanMonth(monthId);
  const month = Number(monthId.slice(5, 7));
  return [1, 5, 10, 15, 20, 25, days].map((day) => `${month}/${day}`);
}

function mapStatus(status?: string): ProjectStatus {
  if (!status || ['在建', '正常', '正常推进'].includes(status)) return '正常推进';
  if (status.includes('滞后') || status.includes('关注')) return '轻微滞后';
  return '正常推进';
}

function mapFoundations(foundations: ProgressApiResponse['foundations']): FoundationOptions {
  return {
    areas: foundations.area?.length ? foundations.area : defaultProjectBaseInfo.areas,
    floors: foundations.floor?.length ? foundations.floor : defaultProjectBaseInfo.floors,
    phases: foundations.phase?.length ? foundations.phase : defaultProjectBaseInfo.phases,
    processes: foundations.process?.length ? foundations.process : defaultProjectBaseInfo.processes,
    responsibilities: foundations.responsibility?.length ? foundations.responsibility : defaultProjectBaseInfo.responsibilities,
    dependencies: foundations.dependency?.length ? foundations.dependency : defaultProjectBaseInfo.dependencies,
  };
}

function mapApiTasks(tasks: ProgressApiResponse['tasks'], months: PlanMonth[]): PlanTask[] {
  return tasks.map((task) => {
    const yearMonth = task.year_month || task.plan_start_date.slice(0, 7);
    const month = months.find((item) => item.id === yearMonth) || months[0] || defaultPlanMonths[0];
    const planStart = monthDateToPosition(task.plan_start_date, month);
    const planEnd = monthDateToPosition(task.plan_end_date, month);
    const actualStart = task.actual_start_date ? monthDateToPosition(task.actual_start_date, month) : planStart;
    const actualEnd = task.actual_end_date ? monthDateToPosition(task.actual_end_date, month) : Math.min(planEnd, planStart + 4);

    return {
      id: task.id,
      projectId: task.project_id,
      yearMonth,
      wbs: task.wbs || '',
      phase: task.phase || '主体结构',
      area: task.area || '',
      floor: task.floor || '',
      process: task.process || '',
      ownerRole: task.owner_role || '项目经理负责协调现场资源',
      dependency: task.dependency || '上一道工序完成后开始',
      logic: task.logic || 'FS',
      planStartDate: task.plan_start_date,
      planEndDate: task.plan_end_date,
      actualStartDate: task.actual_start_date || task.plan_start_date,
      actualEndDate: task.actual_end_date || task.plan_start_date,
      planStart,
      planEnd: Math.max(planEnd, planStart + 2),
      actualStart,
      actualEnd: Math.max(actualEnd, actualStart + 2),
      actualProgress: Number(task.actual_progress || 0),
      plannedQty: Number(task.matched_quantity || 0),
      actualQty: 0,
      reportedQty: 0,
      unit: task.unit || '',
      subitemId: task.subitem_id,
      quantityItem: task.quantity_item || '',
      issue: task.issue || '等待施工日志回填实际进度',
      nextAction: task.next_action || '项目经理按现场推进情况更新',
      isKey: task.is_key,
    };
  });
}

export default function ProgressManagementPreview() {
  const [projectOptions, setProjectOptions] = useState<Project[]>(projects);
  const [planTasks, setPlanTasks] = useState<PlanTask[]>(initialTasks);
  const [foundationOptions, setFoundationOptions] = useState<FoundationOptions>(defaultProjectBaseInfo);
  const [quantitySubitems, setQuantitySubitems] = useState<QuantitySubitem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const [selectedTaskId, setSelectedTaskId] = useState(103);
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('month');
  const [selectedMonthId, setSelectedMonthId] = useState('2026-08');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('plan');
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const selectedProjectIdRef = useRef(selectedProjectId);
  const selectedMonthIdRef = useRef(selectedMonthId);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    selectedMonthIdRef.current = selectedMonthId;
  }, [selectedMonthId]);

  const planMonths = useMemo(() => buildPlanMonths(planTasks), [planTasks]);
  const selectedProject = projectOptions.find((project) => project.id === selectedProjectId) || projectOptions[0] || projects[0];
  const effectiveSelectedMonthId = planMonths.some((month) => month.id === selectedMonthId)
    ? selectedMonthId
    : planMonths[0]?.id || defaultPlanMonths[0].id;
  const selectedMonth = planMonths.find((month) => month.id === effectiveSelectedMonthId) || planMonths[0] || defaultPlanMonths[0];
  const projectTasks = useMemo(
    () => planTasks.filter((task) => task.projectId === selectedProject.id),
    [planTasks, selectedProject.id],
  );
  const displayedTasks = useMemo(
    () => (planViewMode === 'overall' ? projectTasks : projectTasks.filter((task) => taskInMonth(task, selectedMonth))),
    [planViewMode, projectTasks, selectedMonth],
  );
  const currentTimeline = planViewMode === 'overall' ? overallTimeline : getMonthTimeline(selectedMonth.id);
  const projectMilestones = useMemo(
    () => milestones.filter((milestone) => milestone.projectId === selectedProject.id),
    [selectedProject.id],
  );
  const selectedTask = projectTasks.find((task) => task.id === selectedTaskId) || projectTasks[0] || {
    id: 0,
    projectId: selectedProject.id,
    yearMonth: selectedMonth.id,
    wbs: '',
    phase: foundationOptions.phases[0] || '',
    area: foundationOptions.areas[0] || '',
    floor: foundationOptions.floors[0] || '',
    process: foundationOptions.processes[0] || '',
    ownerRole: foundationOptions.responsibilities[0] || '',
    dependency: foundationOptions.dependencies[0] || '',
    logic: 'FS',
    planStartDate: `${selectedMonth.id}-01`,
    planEndDate: `${selectedMonth.id}-${String(Math.min(7, getDaysInPlanMonth(selectedMonth.id))).padStart(2, '0')}`,
    actualStartDate: `${selectedMonth.id}-01`,
    actualEndDate: `${selectedMonth.id}-01`,
    planStart: selectedMonth.range[0],
    planEnd: Math.min(selectedMonth.range[1], selectedMonth.range[0] + 8),
    actualStart: selectedMonth.range[0],
    actualEnd: Math.min(selectedMonth.range[1], selectedMonth.range[0] + 2),
    actualProgress: 0,
    plannedQty: 0,
    actualQty: 0,
    reportedQty: 0,
    unit: '',
    subitemId: null,
    quantityItem: '',
    issue: '暂无进度计划',
    nextAction: '点击新增工序开始编制计划',
  };
  const selectedTaskState = getTaskState(selectedTask);
  const plannedProgress = average(projectTasks.map(getPlannedProgress));
  const actualProgress = average(projectTasks.map((task) => task.actualProgress));
  const delayDays = Math.max(0, Math.round((selectedTask.actualEnd - selectedTask.planEnd) / 2));
  const activePeriodTasks = projectTasks.filter((task) => task.planStart <= todayPosition && task.planEnd >= todayPosition);
  const todayDate = new Date().toISOString().slice(0, 10);
  const selectedTaskLogHref = `/construction-logs/new?project_id=${selectedProject.id}&date=${todayDate}&progress_task_id=${selectedTask.id}`;
  const phaseGroups = useMemo(
    () =>
      displayedTasks.reduce<Array<{ phase: string; tasks: PlanTask[] }>>((groups, task) => {
        const group = groups.find((item) => item.phase === task.phase);
        if (group) {
          group.tasks.push(task);
        } else {
          groups.push({ phase: task.phase, tasks: [task] });
        }
        return groups;
      }, []),
    [displayedTasks],
  );

  const loadProgressData = useCallback(async (projectId?: number) => {
    const activeProjectId = projectId ?? selectedProjectIdRef.current;
    const activeMonthId = selectedMonthIdRef.current;
    setLoading(true);
    setApiError('');
    try {
      const response = await fetch(`/api/progress-management${activeProjectId ? `?project_id=${activeProjectId}` : ''}`, {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '查询进度计划失败');
      }

      const data = result as ProgressApiResponse;
      const nextProjects = data.projects.map((project) => ({
        id: project.id,
        name: project.name,
        manager: '项目经理',
        budgeter: '预算员',
        status: mapStatus(project.status),
        currentPeriod: '',
      }));
      const nextFoundations = mapFoundations(data.foundations);
      const baseTasks = data.tasks.map((task) => ({
        ...task,
        year_month: task.year_month || task.plan_start_date?.slice(0, 7) || activeMonthId,
      }));
      const nextMonths = buildPlanMonths(baseTasks.map((task) => ({
        id: task.id,
        projectId: task.project_id,
        yearMonth: task.year_month,
        planStartDate: task.plan_start_date,
        planEndDate: task.plan_end_date,
        wbs: '',
        phase: '',
        area: '',
        floor: '',
        process: '',
        ownerRole: '',
        dependency: '',
        logic: 'FS',
        planStart: 0,
        planEnd: 0,
        actualStart: 0,
        actualEnd: 0,
        actualProgress: 0,
        plannedQty: 0,
        actualQty: 0,
        reportedQty: 0,
        unit: '',
        quantityItem: '',
        issue: '',
        nextAction: '',
      })));
      const nextTasks = mapApiTasks(baseTasks, nextMonths);
      const nextSelectedProjectId = data.selectedProjectId || nextProjects[0]?.id || activeProjectId;
      const firstTask = nextTasks.find((task) => task.projectId === nextSelectedProjectId);

      if (nextProjects.length > 0) setProjectOptions(nextProjects);
      setFoundationOptions(nextFoundations);
      setQuantitySubitems(data.subitems || []);
      setPlanTasks(nextTasks);
      setSelectedProjectId(nextSelectedProjectId);
      if (firstTask) {
        setSelectedTaskId(firstTask.id);
        setSelectedMonthId(firstTask.yearMonth || nextMonths[0]?.id || activeMonthId);
      } else {
        setSelectedTaskId(0);
        setSelectedMonthId(nextMonths[0]?.id || activeMonthId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询进度计划失败';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProgressData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProgressData]);

  async function saveProgressData() {
    setSaving(true);
    setApiError('');
    try {
      const tasks = projectTasks.map((task) => {
        const taskMonth = planMonths.find((month) => month.id === (task.yearMonth || selectedMonth.id)) || selectedMonth;
        const planStartDate = task.planStartDate || positionToMonthDate(task.planStart, taskMonth);
        const planEndDate = task.planEndDate || positionToMonthDate(task.planEnd, taskMonth);

        return {
          id: task.id > 0 ? task.id : undefined,
          year_month: (task.yearMonth || planStartDate.slice(0, 7)),
          wbs: task.wbs,
          phase: task.phase,
          area: task.area,
          floor: task.floor,
          process: task.process,
          owner_role: task.ownerRole,
          dependency: task.dependency,
          logic: task.logic,
          plan_start_date: planStartDate,
          plan_end_date: planEndDate,
          actual_start_date: task.actualStartDate || positionToMonthDate(task.actualStart, taskMonth),
          actual_end_date: task.actualEndDate || positionToMonthDate(task.actualEnd, taskMonth),
          actual_progress: task.actualProgress,
          issue: task.issue,
          next_action: task.nextAction,
          is_key: Boolean(task.isKey),
          subitem_id: task.subitemId || null,
          quantity_item: task.quantityItem,
          matched_quantity: task.plannedQty,
          unit: task.unit,
        };
      });

      const response = await fetch('/api/progress-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: selectedProject.id,
          foundations: {
            area: foundationOptions.areas,
            floor: foundationOptions.floors,
            phase: foundationOptions.phases,
            process: foundationOptions.processes,
            dependency: foundationOptions.dependencies,
            responsibility: foundationOptions.responsibilities,
          },
          tasks,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '保存进度计划失败');
      }
      await loadProgressData(selectedProject.id);
      setEditorOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存进度计划失败';
      setApiError(message);
    } finally {
      setSaving(false);
    }
  }

  function updateTask(taskId: number, patch: Partial<PlanTask>) {
    setPlanTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    );
  }

  function updateSelectedTask(patch: Partial<PlanTask>) {
    updateTask(selectedTask.id, patch);
  }

  function addTask() {
    const nextId = Math.min(-1, ...planTasks.map((task) => task.id)) - 1;
    const monthStart = `${selectedMonth.id}-01`;
    const monthEnd = `${selectedMonth.id}-${String(Math.min(7, getDaysInPlanMonth(selectedMonth.id))).padStart(2, '0')}`;
    const defaultArea = foundationOptions.areas[0] || '';
    const defaultFloor = foundationOptions.floors[0] || '';
    const defaultPhase = foundationOptions.phases[0] || '';
    const defaultProcess = foundationOptions.processes[0] || '';
    const nextTask: PlanTask = {
      id: nextId,
      projectId: selectedProject.id,
      yearMonth: selectedMonth.id,
      wbs: `${selectedProject.id}.1.${String(projectTasks.length + 1).padStart(2, '0')}`,
      phase: defaultPhase,
      area: defaultArea,
      floor: defaultFloor,
      process: defaultProcess,
      ownerRole: foundationOptions.responsibilities[0] || '项目经理负责协调现场资源',
      dependency: selectedTask ? `${selectedTask.floor}${selectedTask.process}完成` : foundationOptions.dependencies[0] || '上一道工序完成',
      logic: 'FS',
      planStartDate: monthStart,
      planEndDate: monthEnd,
      actualStartDate: monthStart,
      actualEndDate: monthStart,
      planStart: monthDateToPosition(monthStart, selectedMonth),
      planEnd: monthDateToPosition(monthEnd, selectedMonth),
      actualStart: monthDateToPosition(monthStart, selectedMonth),
      actualEnd: monthDateToPosition(monthStart, selectedMonth) + 2,
      actualProgress: 0,
      plannedQty: 0,
      actualQty: 0,
      reportedQty: 0,
      unit: '',
      subitemId: null,
      quantityItem: '',
      issue: '新建计划，等待施工日志回填',
      nextAction: '项目经理确认计划时间，预算员匹配工程量',
    };

    setPlanTasks((currentTasks) => [...currentTasks, nextTask]);
    setSelectedTaskId(nextTask.id);
    setEditorMode('plan');
    setEditorOpen(true);
  }

  function beginDrag(event: PointerEvent<HTMLDivElement>, task: PlanTask, kind: 'plan' | 'actual') {
    event.preventDefault();
    event.stopPropagation();
    const timelineCell = event.currentTarget.closest('[data-timeline-cell="true"]') as HTMLElement | null;
    const width = timelineCell?.getBoundingClientRect().width || 1;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedTaskId(task.id);
    setDragState({
      taskId: task.id,
      kind,
      pointerStartX: event.clientX,
      start: kind === 'plan' ? task.planStart : task.actualStart,
      end: kind === 'plan' ? task.planEnd : task.actualEnd,
      width,
    });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    event.preventDefault();
    event.stopPropagation();
    const duration = dragState.end - dragState.start;
    const delta = ((event.clientX - dragState.pointerStartX) / dragState.width) * 100;
    const nextStart = clamp(dragState.start + delta, 0, 100 - duration);
    const nextEnd = nextStart + duration;

    updateTask(
      dragState.taskId,
      dragState.kind === 'plan'
        ? { planStart: nextStart, planEnd: nextEnd }
        : { actualStart: nextStart, actualEnd: nextEnd },
    );
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    event.preventDefault();
    event.stopPropagation();
    setDragState(null);
  }

  return (
    <main className="min-h-full bg-transparent text-foreground">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 p-3 sm:p-4 md:p-6">
        <header className="rounded-xl border border-border bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">施工管理 / 进度计划</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">月计划编排与项目总计划</h1>
            </div>

            <div className="grid gap-3 lg:grid-cols-[380px_auto] lg:items-end">
              <label className="relative block">
                <span className="mb-1 block text-xs text-muted-foreground">选择项目</span>
                <select
                  value={selectedProjectId}
                  onChange={(event) => {
                    const nextProjectId = Number(event.target.value);
                    const firstTask = planTasks.find((task) => task.projectId === nextProjectId);
                    setSelectedProjectId(nextProjectId);
                    if (firstTask) setSelectedTaskId(firstTask.id);
                    void loadProgressData(nextProjectId);
                  }}
                  className="h-11 w-full appearance-none rounded-lg border border-border bg-white px-3 pr-10 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 text-muted-foreground" />
              </label>

              <div className="flex flex-wrap gap-2 text-xs">
                <ProjectPill label="计划" value={`${plannedProgress}%`} />
                <ProjectPill label="实际" value={`${actualProgress}%`} />
                <ProjectPill
                  label="偏差"
                  value={`${actualProgress - plannedProgress}%`}
                  danger={actualProgress < plannedProgress}
                />
                <span className={`inline-flex h-9 items-center rounded-lg border px-3 font-medium ${getStatusClass(selectedProject.status)}`}>
                  {selectedProject.status}
                </span>
              </div>
            </div>
          </div>
        </header>

        {(loading || apiError) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            apiError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-primary/20 bg-accent text-primary'
          }`}>
            {apiError || '正在读取真实项目进度数据...'}
          </div>
        )}

        <section className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">按月编计划，自动汇总成总计划</div>
              <div className="mt-1 text-sm text-muted-foreground">
                项目经理每月维护楼层工序计划；系统按月份汇总，形成项目总甘特图。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPlanViewMode('month')}
                className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                  planViewMode === 'month'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/30 hover:text-primary'
                }`}
              >
                月计划编辑
              </button>
              <button
                type="button"
                onClick={() => setPlanViewMode('overall')}
                className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                  planViewMode === 'overall'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/30 hover:text-primary'
                }`}
              >
                项目总计划
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {planMonths.map((month) => {
              const active = planViewMode === 'month' && selectedMonth.id === month.id;
              const count = projectTasks.filter((task) => taskInMonth(task, month)).length;
              return (
                <button
                  key={month.id}
                  type="button"
                  onClick={() => {
                    setPlanViewMode('month');
                    setSelectedMonthId(month.id);
                    const firstTask = projectTasks.find((task) => taskInMonth(task, month));
                    if (firstTask) setSelectedTaskId(firstTask.id);
                  }}
                  className={`rounded-xl border p-3 text-left shadow-sm transition ${
                    active ? 'border-primary/30 bg-accent' : 'border-border bg-white hover:border-primary/30 hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{month.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted-foreground">{count} 项</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{month.period}</div>
                  <div className="mt-2 text-sm text-foreground">{month.focus}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid min-h-[690px] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{selectedProject.name}</h2>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {planViewMode === 'overall' ? '项目全周期总计划' : selectedMonth.period}
                  </span>
                  <span className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-primary">
                    {planViewMode === 'overall' ? '各月计划自动汇总' : `${selectedMonth.label}可编辑`}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  项目经理编计划：{selectedProject.manager} / 预算员匹配工程量：{selectedProject.budgeter}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditorMode('plan');
                    setEditorOpen(true);
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                    editorMode === 'plan'
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-foreground hover:border-border'
                  }`}
                >
                  <PencilLine className="h-4 w-4" />
                  编辑计划
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorMode('quantity');
                    setEditorOpen(true);
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                    editorMode === 'quantity'
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-foreground hover:border-border'
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  工程量匹配
                </button>
                <button
                  type="button"
                  onClick={addTask}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:border-border"
                >
                  <Plus className="h-4 w-4" />
                  新增工序
                </button>
              </div>
            </div>

            <div className="border-b border-border bg-muted/50 px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <ViewButton active icon={<Layers3 className="h-3.5 w-3.5" />} label="甘特图" />
                  <ViewButton icon={<ClipboardList className="h-3.5 w-3.5" />} label="工序台账" />
                  <ViewButton icon={<CalendarClock className="h-3.5 w-3.5" />} label="关键节点" />
                  <ViewButton icon={<FileSpreadsheet className="h-3.5 w-3.5" />} label="工程量匹配" />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Legend color="bg-border" label="计划" />
                  <Legend color="bg-primary" label="实际" />
                  <Legend color="bg-rose-500" label="滞后" />
                  <Legend color="bg-primary" label="今日" />
                </div>
              </div>
            </div>

            <div className="overflow-auto">
              <div className="min-w-[1280px]">
                <div className="sticky top-0 z-20 grid grid-cols-[320px_minmax(720px,1fr)_120px_120px] border-b border-border bg-white px-5 py-4 text-xs font-medium text-muted-foreground shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                  <div className="pt-2">WBS / 楼层工序</div>
                  <div className="relative h-20">
                    <div className="grid grid-cols-7 pr-2 text-muted-foreground">
                    {currentTimeline.map((item, index) => (
                        <span key={item} className={index === currentTimeline.length - 1 ? 'text-right pr-1' : ''}>
                          {item}
                        </span>
                      ))}
                    </div>
                    <div
                      className="absolute top-7 z-10 -translate-x-1/2 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold leading-none text-white shadow-sm"
                      style={{ left: `${todayPosition}%` }}
                    >
                      今日
                    </div>
                    {projectMilestones.map((milestone) => (
                      <div
                        key={milestone.label}
                        className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium leading-none text-amber-700 shadow-sm"
                        style={{ left: `${milestone.position}%` }}
                      >
                        {milestone.label}
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 text-right">工程量</div>
                  <div className="pt-2 text-right">状态</div>
                </div>

                <div className="relative bg-white">
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-primary"
                    style={{ left: `calc(320px + 1.25rem + (100% - 320px - 1.25rem - 120px - 120px) * ${todayPosition / 100})` }}
                  />

                  <div className="divide-y divide-border/70">
                    {phaseGroups.map((group) => (
                      <div key={group.phase}>
                        <div className="grid grid-cols-[320px_minmax(720px,1fr)_120px_120px] items-center gap-x-3 bg-muted/50 px-5 py-3 text-xs font-medium text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                            {group.phase}
                            <span className="rounded-full bg-white px-2 py-0.5 text-muted-foreground">{group.tasks.length} 项</span>
                          </div>
                          <div className="text-muted-foreground">计划条按日期生成，彩色条为施工日志回填的实际进度</div>
                          <div className="text-right">实际 {average(group.tasks.map((item) => item.actualProgress))}%</div>
                          <div />
                        </div>

                        {group.tasks.map((task) => {
                          const taskState = getTaskState(task);
                          const active = task.id === selectedTask.id;

                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => setSelectedTaskId(task.id)}
                              className={`grid w-full grid-cols-[320px_minmax(720px,1fr)_120px_120px] items-center gap-x-3 px-5 py-4 text-left transition hover:bg-muted/50 ${
                                active ? 'bg-accent/70 shadow-[inset_3px_0_0_var(--color-primary)]' : 'bg-white'
                              }`}
                            >
                              <div className="min-w-0 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">{task.wbs}</span>
                                  {task.isKey ? (
                                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">关键</span>
                                  ) : null}
                                </div>
                                <div className="mt-2 truncate font-semibold text-foreground">
                                  {task.area} {task.floor} / {task.process}
                                </div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">{task.quantityItem}</div>
                              </div>

                              <div className="relative h-20" data-timeline-cell="true">
                                <div className="absolute inset-x-0 top-9 h-px bg-muted" />
                                <div className="absolute inset-y-0 grid w-full grid-cols-7">
                                  {currentTimeline.map((item) => (
                                    <div key={`${task.id}-${item}`} className="border-l border-border/70 first:border-l-0" />
                                  ))}
                                </div>
                                {task.isKey ? (
                                  <div
                                    className="absolute top-2 h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border border-amber-300 bg-amber-100 shadow-sm"
                                    style={{ left: `${task.planEnd}%` }}
                                    title="关键节点"
                                  />
                                ) : null}

                                <div
                                  className="absolute top-6 flex h-7 min-w-[96px] items-center rounded-md border border-border bg-white px-2.5 text-[11px] font-semibold text-foreground shadow-sm transition hover:border-muted-foreground/40"
                                  style={{
                                    left: `${task.planStart}%`,
                                    width: `${Math.max(8, task.planEnd - task.planStart)}%`,
                                  }}
                                  title={`${task.floor} ${task.process}：在编辑详情中选择计划日期`}
                                >
                                  <span className="absolute -left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-muted-foreground/30 shadow" />
                                  <span className="block min-w-0 truncate pl-1">{task.floor} {task.process}</span>
                                  <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-muted-foreground/30 shadow" />
                                </div>

                                <div
                                  className={`absolute top-12 flex h-5 min-w-[54px] cursor-grab items-center rounded-full px-2 text-[10px] font-semibold text-white shadow-sm transition active:cursor-grabbing ${taskState.actualBar}`}
                                  style={{
                                    left: `${task.actualStart}%`,
                                    width: `${Math.max(5, task.actualEnd - task.actualStart)}%`,
                                  }}
                                  title="拖动调整实际时间"
                                  onPointerDown={(event) => beginDrag(event, task, 'actual')}
                                  onPointerMove={moveDrag}
                                  onPointerUp={endDrag}
                                  onPointerCancel={endDrag}
                                >
                                  <span className="block min-w-0 truncate">{task.actualProgress}%</span>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                  已匹配
                                </span>
                              </div>

                              <div className="text-right">
                                <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${taskState.className}`}>
                                  {taskState.label}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border bg-muted/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {projectMilestones.map((milestone) => (
                  <span key={milestone.label} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    {milestone.label} {milestone.position}%
                  </span>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-lg border border-border bg-white shadow-sm">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">当前选中任务</div>
                  <h3 className="mt-1 text-xl font-semibold">
                    {selectedTask.area} {selectedTask.floor} {selectedTask.process}
                  </h3>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${selectedTaskState.className}`}>
                  {selectedTaskState.label}
                </span>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Detail label="WBS" value={selectedTask.wbs} />
                <Detail label="施工关系" value={getLogicLabel(selectedTask.logic)} />
                <Detail label="责任说明" value={selectedTask.ownerRole} />
                <Detail label="滞后天数" value={`${delayDays}天`} danger={delayDays > 0} />
              </div>

              <div className="rounded-lg border border-primary/20 bg-accent p-3 text-xs leading-5 text-primary">
                计划时间在编辑详情中选择具体日期；甘特图负责展示总计划和实际进度，不强迫用户靠拖动理解时间。
              </div>

              <Panel title="计划逻辑" icon={<Link2 className="h-4 w-4 text-primary" />}>
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-foreground">
                  开始条件：{selectedTask.dependency}
                </div>
              </Panel>

              <Panel title="工程量匹配" icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}>
                <div className="space-y-2">
                  <QuantityReadLine label="预算匹配工程量" value={`${formatQty(selectedTask.plannedQty)} ${selectedTask.unit}`} />
                </div>
                <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3 text-sm leading-6 text-muted-foreground">
                  这里仅维护工序与工程量清单的匹配量；施工日志只同步进度状态和现场情况。
                </div>
              </Panel>

              <Panel title="施工日志联动" icon={<ClipboardList className="h-4 w-4 text-indigo-600" />}>
                <p className="text-sm leading-6 text-muted-foreground">
                  项目经理提交施工日志时，系统按项目和日期自动带出当前任务，并回填实际完成进度。
                </p>
                <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">当前日期自动带出的计划项</div>
                  <div className="flex flex-wrap gap-2">
                    {activePeriodTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          task.id === selectedTask.id
                            ? 'border-primary bg-primary text-white'
                            : 'border-border bg-white text-muted-foreground'
                        }`}
                      >
                        {task.floor} {task.process}
                      </button>
                    ))}
                  </div>
                </div>
                <Link href={selectedTaskLogHref} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white">
                  写施工日志并更新进度
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Panel>

              <Panel title="偏差处理" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-sm font-medium text-foreground">{selectedTask.issue}</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTask.nextAction}</div>
                </div>
              </Panel>
            </div>
          </aside>
        </section>

        <section className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <div className="font-semibold">闭环路径</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  项目经理按月编辑计划，预算员匹配工程量，施工日志回填实际进度，报量管理按月统一分析是否少报或超报。
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">计划</span>
              <span className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">日志</span>
              <span className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">报量</span>
              <span className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">偏差原因</span>
            </div>
          </div>
        </section>
      </div>

      {editorOpen && (
        <EditorDetailPage
          mode={editorMode}
          project={selectedProject}
          selectedMonth={selectedMonth}
          task={selectedTask}
          tasks={projectTasks}
          onClose={() => setEditorOpen(false)}
          onModeChange={setEditorMode}
          onAddTask={addTask}
          onTaskSelect={setSelectedTaskId}
          onTaskChange={updateTask}
          onSelectedTaskChange={updateSelectedTask}
          foundations={foundationOptions}
          onFoundationsChange={setFoundationOptions}
          subitems={quantitySubitems}
          saving={saving}
          onSave={saveProgressData}
        />
      )}
    </main>
  );
}

function EditorDetailPage({
  mode,
  project,
  selectedMonth,
  task,
  tasks,
  onClose,
  onModeChange,
  onAddTask,
  onTaskSelect,
  onTaskChange,
  onSelectedTaskChange,
  foundations,
  onFoundationsChange,
  subitems,
  saving,
  onSave,
}: {
  mode: EditorMode;
  project: Project;
  selectedMonth: PlanMonth;
  task: PlanTask;
  tasks: PlanTask[];
  onClose: () => void;
  onModeChange: (mode: EditorMode) => void;
  onAddTask: () => void;
  onTaskSelect: (taskId: number) => void;
  onTaskChange: (taskId: number, patch: Partial<PlanTask>) => void;
  onSelectedTaskChange: (patch: Partial<PlanTask>) => void;
  foundations: FoundationOptions;
  onFoundationsChange: (foundations: FoundationOptions) => void;
  subitems: QuantitySubitem[];
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-muted">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-10 rounded-lg border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{project.name}</div>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                {mode === 'plan' ? '进度计划编辑详情' : '工程量匹配详情'}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onModeChange('plan')}
                className={`inline-flex h-9 min-w-[108px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition ${
                  mode === 'plan'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-border'
                }`}
              >
                <PencilLine className="h-4 w-4" />
                编辑计划
              </button>
              <button
                type="button"
                onClick={() => onModeChange('quantity')}
                className={`inline-flex h-9 min-w-[120px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition ${
                  mode === 'quantity'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-border'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                工程量匹配
              </button>
              <button
                type="button"
                onClick={onAddTask}
                className="inline-flex h-9 min-w-[108px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:border-border"
              >
                <Plus className="h-4 w-4" />
                新增工序
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex h-9 min-w-[108px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-3 text-sm font-medium text-white"
              >
                <Save className="h-4 w-4" />
                {saving ? '保存中' : '保存'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition hover:border-border hover:text-foreground"
                aria-label="关闭编辑详情"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <ProjectFoundationPanel foundations={foundations} onChange={onFoundationsChange} />

        <div className="grid flex-1 grid-cols-1 gap-4 py-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-border bg-white p-3 shadow-sm xl:sticky xl:top-24 xl:self-start">
            <div className="px-1 pb-2 text-sm font-semibold text-foreground">工序列表</div>
            <div className="space-y-2">
              {tasks.map((item) => {
                const state = getTaskState(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTaskSelect(item.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      item.id === task.id
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-foreground hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{item.floor} {item.process}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                          item.id === task.id ? 'bg-white/15 text-white' : state.className
                        }`}
                      >
                        {state.label}
                      </span>
                    </div>
                    <div className={`mt-1 text-xs ${item.id === task.id ? 'text-white/65' : 'text-muted-foreground'}`}>
                      {item.wbs} · {item.phase} · {getLogicLabel(item.logic)}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="rounded-lg border border-border bg-white p-4 shadow-sm">
            {mode === 'plan' ? (
              <PlanEditor task={task} selectedMonth={selectedMonth} foundations={foundations} onChange={onSelectedTaskChange} />
            ) : (
              <QuantityEditor
                tasks={tasks}
                selectedTaskId={task.id}
                subitems={subitems}
                onSelect={onTaskSelect}
                onChange={onTaskChange}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ProjectFoundationPanel({
  foundations,
  onChange,
}: {
  foundations: FoundationOptions;
  onChange: (foundations: FoundationOptions) => void;
}) {
  function updateList(key: keyof FoundationOptions, value: string) {
    onChange({
      ...foundations,
      [key]: value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  return (
    <section className="mt-4 rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">当前项目基础信息</div>
          <div className="mt-1 text-sm text-muted-foreground">
            先维护楼栋、楼层和工序库，后续编辑月计划时直接下拉选择，施工日志也按这些基础项自动带出。
          </div>
        </div>
        <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground">
          <Plus className="h-4 w-4" />
          保存时同步基础项
        </button>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <FoundationGroup title="楼栋 / 区段" items={foundations.areas} value={foundations.areas.join('\n')} onChange={(value) => updateList('areas', value)} />
        <FoundationGroup title="层数 / 区段" items={foundations.floors} value={foundations.floors.join('\n')} onChange={(value) => updateList('floors', value)} />
        <FoundationGroup title="工序库" items={foundations.processes} value={foundations.processes.join('\n')} onChange={(value) => updateList('processes', value)} />
      </div>
    </section>
  );
}

function FoundationGroup({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 7).map((item) => (
          <span key={item} className="rounded-md border border-border bg-white px-2.5 py-1 text-xs text-foreground">
            {item}
          </span>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 min-h-[92px] w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-xs leading-5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function PlanEditor({
  task,
  selectedMonth,
  foundations,
  onChange,
}: {
  task: PlanTask;
  selectedMonth: PlanMonth;
  foundations: FoundationOptions;
  onChange: (patch: Partial<PlanTask>) => void;
}) {
  const durationDays = Math.max(1, Math.round(((task.planEnd - task.planStart) / 100) * 31));
  const planStartDate = task.planStartDate || positionToMonthDate(task.planStart, selectedMonth);
  const planEndDate = task.planEndDate || positionToMonthDate(task.planEnd, selectedMonth);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">当前编辑计划条</div>
          <div className="mt-1 truncate text-base font-semibold text-foreground">
            {task.wbs} · {task.area} {task.floor} {task.process}
          </div>
        </div>
        <div className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold text-foreground">
          计划工期约 {durationDays} 天
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr_0.85fr]">
        <div className="rounded-lg border border-border p-4">
          <PlanSectionTitle title="计划基础项" subtitle="从当前项目基础信息中选择，减少手写和错字" />
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput label="WBS 编号" value={task.wbs} onChange={(value) => onChange({ wbs: value })} />
            <SelectInput label="施工阶段" value={task.phase} options={foundations.phases} onChange={(value) => onChange({ phase: value })} />
            <SelectInput label="楼栋 / 区段" value={task.area} options={foundations.areas} onChange={(value) => onChange({ area: value })} />
            <SelectInput label="层数 / 区段" value={task.floor} options={foundations.floors} onChange={(value) => onChange({ floor: value })} />
            <div className="sm:col-span-2">
              <SelectInput label="工序名称" value={task.process} options={foundations.processes} onChange={(value) => onChange({ process: value })} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <PlanSectionTitle title="计划排程" subtitle="直接选择开始和结束日期，甘特图自动生成计划条" />
          <div className="mt-3 space-y-3">
            <DateInput
              label="计划开始日期"
              value={planStartDate}
              min={`${selectedMonth.id}-01`}
              max={`${selectedMonth.id}-${String(getDaysInPlanMonth(selectedMonth.id)).padStart(2, '0')}`}
              onChange={(value) => onChange({
                yearMonth: value.slice(0, 7),
                planStartDate: value,
                planStart: Math.min(monthDateToPosition(value, selectedMonth), task.planEnd - 4),
              })}
            />
            <DateInput
              label="计划结束日期"
              value={planEndDate}
              min={`${selectedMonth.id}-01`}
              max={`${selectedMonth.id}-${String(getDaysInPlanMonth(selectedMonth.id)).padStart(2, '0')}`}
              onChange={(value) => onChange({
                yearMonth: value.slice(0, 7),
                planEndDate: value,
                planEnd: Math.max(monthDateToPosition(value, selectedMonth), task.planStart + 4),
              })}
            />
            <div className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground">
              当前计划：{planStartDate} 至 {planEndDate}，约 {durationDays} 天
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              保存后会同步刷新上方计划条，施工日志按日期自动带出这个时间段内的工序。
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <PlanSectionTitle title="关系与责任" subtitle="用直白的话说明什么时候开始、谁来负责" />
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">施工关系</span>
              <select
                value={task.logic}
                onChange={(event) => onChange({ logic: event.target.value as PlanTask['logic'] })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="FS">上一道完成后开始</option>
                <option value="SS">可与上一道同步推进</option>
                <option value="FF">需要与上一道同步完成</option>
              </select>
            </label>
            <SelectInput label="开始条件" value={task.dependency} options={foundations.dependencies} onChange={(value) => onChange({ dependency: value })} />
            <SelectInput label="责任说明" value={task.ownerRole} options={foundations.responsibilities} onChange={(value) => onChange({ ownerRole: value })} />
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={Boolean(task.isKey)}
                onChange={(event) => onChange({ isKey: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              设为关键节点
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanSectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function QuantityEditor({
  tasks,
  selectedTaskId,
  subitems,
  onSelect,
  onChange,
}: {
  tasks: PlanTask[];
  selectedTaskId: number;
  subitems: QuantitySubitem[];
  onSelect: (taskId: number) => void;
  onChange: (taskId: number, patch: Partial<PlanTask>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1080px] divide-y divide-border/70 rounded-lg border border-border">
        <div className="grid grid-cols-[210px_minmax(520px,1fr)_160px_100px] gap-3 bg-muted/50 px-4 py-3 text-xs font-medium text-muted-foreground">
          <div>楼层工序</div>
          <div>匹配清单项</div>
          <div className="text-right">匹配量</div>
          <div className="text-right">单位</div>
        </div>
        {tasks.map((task) => {
          const selectedSubitem = subitems.find((subitem) => subitem.id === task.subitemId);
          return (
          <div
            key={task.id}
            onClick={() => onSelect(task.id)}
            className={`grid w-full grid-cols-[210px_minmax(520px,1fr)_160px_100px] items-center gap-3 px-4 py-3 text-left ${
              task.id === selectedTaskId ? 'bg-accent' : 'bg-white'
            }`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{task.floor} {task.process}</div>
              <div className="text-xs text-muted-foreground">{task.wbs}</div>
            </div>
            <select
              value={selectedSubitem?.id || task.subitemId || ''}
              onChange={(event) => {
                const subitemId = Number(event.target.value);
                const subitem = subitems.find((item) => item.id === subitemId);
                onChange(task.id, {
                  subitemId: subitem?.id || null,
                  quantityItem: subitem?.subitem_name || '',
                  unit: subitem?.unit || task.unit,
                });
              }}
              onClick={(event) => event.stopPropagation()}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">请选择报量清单子目</option>
              {subitems.map((subitem) => (
                <option key={subitem.id} value={subitem.id}>
                  {subitem.subitem_name}（{Number(subitem.budget_quantity || 0).toLocaleString()} {subitem.unit || task.unit || '单位'}）
                </option>
              ))}
            </select>
            <EditableNumberCell value={task.plannedQty} onChange={(value) => onChange(task.id, { plannedQty: value })} />
            <EditableTextCell compact value={task.unit} onChange={(value) => onChange(task.id, { unit: value })} />
          </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectPill({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <span className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 ${danger ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-border bg-muted/50 text-foreground'}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function ViewButton({ active = false, icon, label }: { active?: boolean; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 font-medium transition ${
        active
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-white text-muted-foreground hover:border-border hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function Detail({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? 'border-rose-200 bg-rose-50' : 'border-border bg-muted/50'}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold ${danger ? 'text-rose-700' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function QuantityReadLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {options.includes(value) ? null : <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        type="date"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function EditableNumberCell({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      min="0"
      step="0.1"
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(Number(event.target.value || 0))}
      className="h-9 w-full rounded-md border border-border bg-white px-2 text-right text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
}

function EditableTextCell({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <input
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 w-full rounded-md border border-border bg-white px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
        compact ? 'text-right font-semibold' : ''
      }`}
    />
  );
}
