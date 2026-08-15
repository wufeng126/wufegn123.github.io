import { describe, it, expect } from 'vitest';
import {
  buildProgressComparison,
  calcPlannedPercent,
  pickLatestActualProgress,
  PROGRESS_LAG_THRESHOLD_POINTS,
} from '@/lib/progress-comparison';

const tasks = [
  { id: 1, project_id: 10, wbs: 'W1', phase: '主体结构', process: '模板支设', plan_start_date: '2026-06-01', plan_end_date: '2026-06-30' },
  { id: 2, project_id: 10, wbs: 'W2', phase: '主体结构', process: '钢筋绑扎', plan_start_date: '2026-06-10', plan_end_date: '2026-06-20' },
  { id: 3, project_id: 10, wbs: 'W3', phase: '装饰装修', process: '内墙抹灰', plan_start_date: '2026-07-01', plan_end_date: '2026-07-31' },
];

describe('calcPlannedPercent', () => {
  it('今天在计划区间内按时间线性插值', () => {
    // 区间 6-01 至 6-30 共 29 天；6-15 位于 (14/29) ≈ 48.3%
    const percent = calcPlannedPercent('2026-06-15', '2026-06-01', '2026-06-30');
    expect(percent).toBeGreaterThan(40);
    expect(percent).toBeLessThan(55);
  });

  it('未开始为 0，已过计划结束为 100', () => {
    expect(calcPlannedPercent('2026-05-20', '2026-06-01', '2026-06-30')).toBe(0);
    expect(calcPlannedPercent('2026-07-05', '2026-06-01', '2026-06-30')).toBe(100);
  });

  it('无日期或非法区间返回 0', () => {
    expect(calcPlannedPercent('2026-06-15', null, '2026-06-30')).toBe(0);
    expect(calcPlannedPercent('2026-06-15', '2026-06-30', '2026-06-01')).toBe(0);
  });
});

describe('pickLatestActualProgress', () => {
  it('取已提交日志中 log_date 最新一条', () => {
    const entries = [
      { progress_task_id: 1, actual_progress: '50', log_date: '2026-06-10', log_status: 'submitted', log_id: 2 },
      { progress_task_id: 1, actual_progress: '80', log_date: '2026-06-15', log_status: 'submitted', log_id: 3 },
      { progress_task_id: 1, actual_progress: '90', log_date: '2026-06-15', log_status: 'draft', log_id: 4 },
    ];
    expect(pickLatestActualProgress(entries)).toBe(80);
  });

  it('同日期多日志按 log_id 取最新；无已提交返回 null', () => {
    const entries = [
      { progress_task_id: 1, actual_progress: '60', log_date: '2026-06-15', log_status: 'submitted', log_id: 5 },
      { progress_task_id: 1, actual_progress: '70', log_date: '2026-06-15', log_status: 'submitted', log_id: 6 },
    ];
    expect(pickLatestActualProgress(entries)).toBe(70);
    expect(pickLatestActualProgress([{ progress_task_id: 1, actual_progress: '50', log_date: '2026-06-10', log_status: 'draft', log_id: 1 }])).toBeNull();
  });
});

describe('buildProgressComparison', () => {
  it('三态计算：计划%/实际%/计划量/完成量 + 状态', () => {
    const { rows, summary } = buildProgressComparison({
      tasks,
      quantities: [
        { task_id: 1, matched_quantity: '1000', unit: 'm2' },
        { task_id: 2, matched_quantity: '200', unit: 't' },
      ],
      entries: [
        // 任务1：6-15 提交 60%
        { progress_task_id: 1, actual_progress: '60', completed_quantity: '600', log_date: '2026-06-15', log_status: 'submitted', log_id: 1 },
        // 任务1：6-20 提交 80%（最新）
        { progress_task_id: 1, actual_progress: '80', completed_quantity: '200', log_date: '2026-06-20', log_status: 'submitted', log_id: 2 },
      ],
      today: '2026-06-20',
    });

    expect(rows).toHaveLength(3);
    const row1 = rows[0];
    // 计划区间 6-01..6-30，6-20 → ~65.5%
    expect(row1.plan_percent).toBeGreaterThan(55);
    expect(row1.actual_percent).toBe(80);
    expect(row1.planned_qty).toBe(1000);
    expect(row1.actual_qty).toBe(800); // 600 + 200
    expect(row1.lag_points).toBeGreaterThan(0);
    expect(row1.lagging).toBe(false);
    expect(row1.status).toBe('on_track');

    expect(summary.total_planned_qty).toBe(1200);
    expect(summary.total_actual_qty).toBe(800);
  });

  it('滞后判定：实际落后计划超过阈值 → lagging', () => {
    const { rows } = buildProgressComparison({
      tasks,
      quantities: [],
      entries: [
        { progress_task_id: 1, actual_progress: '10', completed_quantity: '0', log_date: '2026-06-20', log_status: 'submitted', log_id: 1 },
      ],
      today: '2026-06-20',
    });

    const row1 = rows[0];
    // 计划 ≈ 65%，实际 10% → 10 + 10 < 65 → lagging
    expect(row1.lagging).toBe(true);
    expect(row1.status).toBe('lagging');
    expect(row1.lag_points).toBeLessThan(0);
  });

  it('逾期判定：今天已过计划结束且未完成 → overdue', () => {
    const { rows } = buildProgressComparison({
      tasks,
      quantities: [],
      entries: [
        { progress_task_id: 2, actual_progress: '50', completed_quantity: '100', log_date: '2026-07-01', log_status: 'submitted', log_id: 1 },
      ],
      today: '2026-07-10', // 任务2 计划 6-10..6-20 已过
    });

    const row2 = rows[1];
    expect(row2.overdue).toBe(true);
    expect(row2.status).toBe('overdue');
  });

  it('完成状态：实际 >= 100', () => {
    const { rows } = buildProgressComparison({
      tasks,
      quantities: [],
      entries: [
        { progress_task_id: 3, actual_progress: '100', completed_quantity: '500', log_date: '2026-07-20', log_status: 'submitted', log_id: 1 },
      ],
      today: '2026-07-25',
    });

    const row3 = rows[2];
    expect(row3.status).toBe('completed');
    expect(row3.overdue).toBe(false);
  });

  it('无日志回退任务字段 actual_progress；未开始任务为 not_started', () => {
    const tasksWithField = [{ ...tasks[0], actual_progress: '30' }];
    // 今天 6-05，计划 6-01..6-30 → 计划 ≈ 14%，实际 30% 不落后 → on_track
    const { rows } = buildProgressComparison({
      tasks: tasksWithField,
      quantities: [],
      entries: [],
      today: '2026-06-05',
    });

    expect(rows[0].actual_percent).toBe(30);
    expect(rows[0].status).toBe('on_track');

    // 计划未开始（今天在计划开始前）且无任何进度 → not_started
    const empty = buildProgressComparison({
      tasks: [{ ...tasks[0], actual_progress: null }],
      quantities: [],
      entries: [],
      today: '2026-05-20',
    }).rows[0];
    expect(empty.actual_percent).toBe(0);
    expect(empty.plan_percent).toBe(0);
    expect(empty.status).toBe('not_started');
  });

  it('汇总：任务数/滞后/逾期/完成计数 + 平均进度', () => {
    const { summary } = buildProgressComparison({
      tasks,
      quantities: [],
      entries: [
        { progress_task_id: 1, actual_progress: '10', completed_quantity: '0', log_date: '2026-06-20', log_status: 'submitted', log_id: 1 },
        { progress_task_id: 3, actual_progress: '100', completed_quantity: '500', log_date: '2026-07-20', log_status: 'submitted', log_id: 2 },
      ],
      today: '2026-07-25',
    });

    expect(summary.task_count).toBe(3);
    expect(summary.lagging_count).toBe(2); // 任务1、任务2（均已过计划结束仍落后）
    expect(summary.overdue_count).toBe(2); // 任务1、任务2（已过计划结束且未完成）
    expect(summary.completed_count).toBe(1); // 任务3
    expect(summary.avg_actual_percent).toBe(37); // (10 + 0 + 100) / 3 ≈ 37
  });

  it('阈值常量可配置且默认 10', () => {
    expect(PROGRESS_LAG_THRESHOLD_POINTS).toBe(10);
  });
});
