import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import { isReviewedStatus, isEffectiveSupplierPaymentStatus } from '@/lib/review-status';

/**
 * GET /api/system/data-health
 * 数据健康检查：一次性把「数据层」的问题扫出来，而不是靠人工翻代码。
 * 覆盖：行数上限风险、状态脏数据、重复数据、孤儿数据、金额异常、关键指标对账。
 */

type CheckLevel = 'pass' | 'warn' | 'fail';
type CheckItem = {
  id: string;
  title: string;
  level: CheckLevel;
  detail: string;
  metrics?: Record<string, number | string>;
  suggestion?: string;
};

const BIG_TABLE_WARN = 900; // 接近 PostgREST 单次 1000 行上限

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const checks: CheckItem[] = [];

    const countOf = async (table: string, apply?: (q: any) => any): Promise<number> => {
      let q = client.from(table).select('id', { count: 'exact', head: true });
      if (apply) q = apply(q);
      const { count } = await q;
      return count || 0;
    };

    // ---------- 1. 大表行数（分页截断风险）----------
    const bigTables: Array<{ table: string; label: string }> = [
      { table: 'client_reports', label: '甲方报量' },
      { table: 'client_payments', label: '甲方回款' },
      { table: 'worker_salaries', label: '工人工资' },
      { table: 'salary_payments', label: '工资发放' },
      { table: 'workers', label: '花名册工人' },
      { table: 'supplier_settlements', label: '供应商结算' },
      { table: 'supplier_payments', label: '供应商付款' },
      { table: 'team_settlements', label: '班组结算' },
      { table: 'team_settlement_items', label: '班组结算明细' },
      { table: 'miscellaneous_materials', label: '零星材料' },
      { table: 'comprehensive_expenses', label: '综合费用' },
      { table: 'construction_logs', label: '施工日志' },
      { table: 'visas', label: '签证' },
    ];
    const rowCounts: Record<string, number> = {};
    for (const item of bigTables) {
      rowCounts[item.label] = await countOf(item.table);
    }
    const overLimit = Object.entries(rowCounts).filter(([, count]) => count >= BIG_TABLE_WARN);
    checks.push({
      id: 'table-size',
      title: '大表行数（分页截断风险）',
      level: overLimit.length > 0 ? 'warn' : 'pass',
      detail: overLimit.length > 0
        ? `${overLimit.map(([label, count]) => `${label} ${count} 行`).join('、')} 已接近或超过 1000 行，相关统计必须分页取全量`
        : '各核心表行数都在安全范围内',
      metrics: rowCounts,
      suggestion: overLimit.length > 0 ? '检查这些表相关的统计接口是否使用 fetchAllRows 分页' : undefined,
    });

    // ---------- 2. 状态脏数据（NULL / 草稿残留）----------
    const statusTables: Array<{ table: string; label: string; extra?: (q: any) => any }> = [
      { table: 'client_reports', label: '甲方报量' },
      { table: 'client_payments', label: '甲方回款' },
      { table: 'comprehensive_expenses', label: '综合费用' },
      { table: 'miscellaneous_materials', label: '零星材料' },
      { table: 'supplier_settlements', label: '供应商结算' },
      { table: 'construction_logs', label: '施工日志' },
    ];
    const nullStatusRows: Record<string, number> = {};
    let nullTotal = 0;
    for (const item of statusTables) {
      const nullCount = await countOf(item.table, (q) => q.or('status.is.null,status.eq.'));
      nullStatusRows[item.label] = nullCount;
      nullTotal += nullCount;
    }
    checks.push({
      id: 'null-status',
      title: '状态为空的记录',
      level: nullTotal > 0 ? 'warn' : 'pass',
      detail: nullTotal > 0
        ? `共 ${nullTotal} 条记录 status 为空：${Object.entries(nullStatusRows).filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join('、')}。空状态在 SQL 比较里会被排除，容易造成统计少算`
        : '没有状态为空的记录',
      metrics: nullStatusRows,
      suggestion: nullTotal > 0 ? '按模块回填状态（如 reviewed / completed），并把统计改成容忍 NULL' : undefined,
    });

    // ---------- 3. 重复数据 ----------
    const dupChecks: Array<{ id: string; title: string; table: string; columns: string[]; keyFn: (row: any) => string; suggestion: string }> = [
      {
        id: 'dup-client-payments',
        title: '甲方回款重复',
        table: 'client_payments',
        columns: ['project_id', 'payment_date', 'payment_amount'],
        keyFn: (r) => `${r.project_id}|${String(r.payment_date || '').slice(0, 10)}|${Number(r.payment_amount || 0).toFixed(2)}`,
        suggestion: '同项目/同日期/同金额的回款重复，会虚增回款额',
      },
      {
        id: 'dup-supplier-settlements',
        title: '供应商结算重复',
        table: 'supplier_settlements',
        columns: ['contract_id', 'settlement_date', 'settlement_amount', 'settlement_type'],
        keyFn: (r) => `${r.contract_id}|${String(r.settlement_date || '').slice(0, 10)}|${Number(r.settlement_amount || 0).toFixed(2)}|${r.settlement_type || ''}`,
        suggestion: '同合同/同日期/同金额的结算重复，会重复计成本',
      },
      {
        id: 'dup-salary',
        title: '工人工资重复（同工人+项目+月份）',
        table: 'worker_salaries',
        columns: ['worker_id', 'project_id', 'year_month'],
        keyFn: (r) => `${r.worker_id}|${r.project_id}|${r.year_month}`,
        suggestion: '同一工人同月同项目多条工资，会导致应发重复累计',
      },
      {
        id: 'dup-team-settlement',
        title: '班组结算重复（同班组+同月）',
        table: 'team_settlements',
        columns: ['team_id', 'settlement_month'],
        keyFn: (r) => `${r.team_id}|${r.settlement_month}`,
        suggestion: '同一班组同月多张结算单，会重复计成本',
      },
    ];
    for (const dup of dupChecks) {
      const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
        (client.from(dup.table) as any).select(['id', ...dup.columns].join(',')).range(from, to));
      const groups = new Map<string, number>();
      rows.forEach((row) => {
        const key = dup.keyFn(row);
        groups.set(key, (groups.get(key) || 0) + 1);
      });
      const dupGroups = Array.from(groups.values()).filter((count) => count > 1);
      const dupRows = dupGroups.reduce((sum, count) => sum + count, 0);
      checks.push({
        id: dup.id,
        title: dup.title,
        level: dupGroups.length > 0 ? 'fail' : 'pass',
        detail: dupGroups.length > 0
          ? `${dupGroups.length} 组重复，共涉及 ${dupRows} 条记录`
          : '没有发现重复',
        metrics: { groups: dupGroups.length, rows: dupRows },
        suggestion: dupGroups.length > 0 ? dup.suggestion : undefined,
      });
    }

    // ---------- 4. 孤儿数据 ----------
    const { data: projectRows } = await client.from('projects').select('id');
    const projectIds = new Set((projectRows || []).map((row: { id: number }) => Number(row.id)));
    const orphanTables = [
      { table: 'workers', label: '花名册工人' },
      { table: 'client_reports', label: '甲方报量' },
      { table: 'client_payments', label: '甲方回款' },
      { table: 'worker_salaries', label: '工人工资' },
      { table: 'team_settlements', label: '班组结算' },
      { table: 'supplier_contracts', label: '供应商合同' },
      { table: 'miscellaneous_materials', label: '零星材料' },
      { table: 'comprehensive_expenses', label: '综合费用' },
    ];
    const orphanStats: Record<string, number> = {};
    let orphanTotal = 0;
    for (const item of orphanTables) {
      const rows = await fetchAllRows<{ project_id?: unknown }>((from, to) =>
        (client.from(item.table) as any).select('project_id').range(from, to));
      const orphan = rows.filter((row) => {
        const pid = Number(row.project_id) || 0;
        return pid > 0 && !projectIds.has(pid);
      }).length;
      const noProject = rows.filter((row) => !Number(row.project_id)).length;
      orphanStats[item.label] = orphan + noProject;
      orphanTotal += orphan + noProject;
    }
    checks.push({
      id: 'orphan-project',
      title: '挂在不存在/空项目下的数据',
      level: orphanTotal > 0 ? 'warn' : 'pass',
      detail: orphanTotal > 0
        ? `共 ${orphanTotal} 条记录的 project_id 为空或指向不存在的项目：${Object.entries(orphanStats).filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join('、')}`
        : '没有孤儿项目数据',
      metrics: orphanStats,
      suggestion: orphanTotal > 0 ? '这些数据不会出现在任何项目统计里，需要归属修正或清理' : undefined,
    });

    // ---------- 5. 金额异常 ----------
    const zeroOrNegative = await Promise.all([
      countOf('client_reports', (q) => q.or('report_amount.is.null,report_amount.lte.0')),
      countOf('worker_salaries', (q) => q.lte('net_pay', 0)),
      countOf('supplier_settlements', (q) => q.lte('settlement_amount', 0)),
    ]);
    const abnormal = zeroOrNegative.reduce((sum, n) => sum + n, 0);
    checks.push({
      id: 'abnormal-amount',
      title: '金额为 0 或负数',
      level: abnormal > 0 ? 'warn' : 'pass',
      detail: abnormal > 0
        ? `报量金额异常 ${zeroOrNegative[0]} 条、工资实发≤0 ${zeroOrNegative[1]} 条、结算金额≤0 ${zeroOrNegative[2]} 条`
        : '没有金额异常记录',
      metrics: {
        报量: zeroOrNegative[0],
        工资: zeroOrNegative[1],
        供应商结算: zeroOrNegative[2],
      },
      suggestion: abnormal > 0 ? '金额异常通常来自导入解析失败或误录，建议逐条核对' : undefined,
    });

    // ---------- 6. 关键指标对账（SQL 直算 vs 接口口径）----------
    const reportRows = await fetchAllRows<{ invoice_amount?: unknown; settlement_amount?: unknown; status?: string | null }>((from, to) =>
      client.from('client_reports').select('invoice_amount,settlement_amount,status').range(from, to));
    const invoiceTotal = reportRows
      .filter((row) => !row.status || isReviewedStatus(String(row.status)))
      .reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
    const paymentRows = await fetchAllRows<{ payment_amount?: unknown; status?: string | null }>((from, to) =>
      client.from('client_payments').select('payment_amount,status').range(from, to));
    const receivedTotal = paymentRows
      .filter((row) => !row.status || isEffectiveSupplierPaymentStatus(String(row.status)))
      .reduce((sum, row) => sum + Number(row.payment_amount || 0), 0);
    const salaryRows = await fetchAllRows<{ gross_pay?: unknown; net_pay?: unknown }>((from, to) =>
      client.from('worker_salaries').select('gross_pay,net_pay').or('source.is.null,source.neq.team_settlement').range(from, to));
    const salaryGross = salaryRows.reduce((sum, row) => sum + Number(row.gross_pay || 0), 0);
    const salaryNet = salaryRows.reduce((sum, row) => sum + Number(row.net_pay || 0), 0);

    checks.push({
      id: 'metric-reconciliation',
      title: '关键指标直接对账（数据库口径）',
      level: 'pass',
      detail: '以下为直接按数据库行计算的结果，可用于和页面/接口数字核对',
      metrics: {
        累计产值_已审核报量开票额: Number(invoiceTotal.toFixed(2)),
        累计甲方回款: Number(receivedTotal.toFixed(2)),
        工人应发合计: Number(salaryGross.toFixed(2)),
        工人实发合计: Number(salaryNet.toFixed(2)),
        回款率: invoiceTotal > 0 ? Number(((receivedTotal / invoiceTotal) * 100).toFixed(1)) : 0,
      },
      suggestion: '若页面数字与这里差异超过 1%，说明该接口口径或分页有问题',
    });

    const summary = {
      pass: checks.filter((c) => c.level === 'pass').length,
      warn: checks.filter((c) => c.level === 'warn').length,
      fail: checks.filter((c) => c.level === 'fail').length,
    };

    return apiSuccess({
      generatedAt: new Date().toISOString(),
      summary,
      checks,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '数据健康检查失败'));
  }
}
