/**
 * 班组分账 → 工资应发 闭环
 *
 * 结算单确认后，为每个分账到工人的记录生成一条 worker_salaries 应发记录
 *  - source = 'team_settlement'（区别于手工录入 manual）
 *  - 关联 settlement_id / team_id
 *  - 幂等：同一 (settlement_id, worker_id) 只生成一条（DB 部分唯一索引兜底）
 *
 * 生成的应发记录会被工资发放模块（单条/批量导入）按 工人+项目+月份 匹配核销，
 * 发放记录的 salary_id 关联到该应发，从而班组工资台账能算出“应得/已发/未发”。
 */
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix } from '@/lib/audit-log';
import { invalidateAggregationCache } from '@/lib/data-aggregation';

type SplitLike = {
  worker_id?: number | null;
  work_hours?: unknown;
  hourly_rate?: unknown;
  amount?: unknown;
};

export async function generateWorkerSalariesFromSplits(params: {
  settlementId: number;
  settlementMonth: string;
  projectId: number;
  teamId: number;
  splits: SplitLike[];
}): Promise<{ created: number; skipped: number }> {
  const { settlementId, settlementMonth, projectId, teamId, splits } = params;
  const client = getSupabaseClient();

  const validSplits = (splits || []).filter((s) => Number(s.worker_id) > 0);
  if (validSplits.length === 0) return { created: 0, skipped: 0 };

  // 已存在的 (settlement_id, worker_id) 组合，幂等跳过
  const { data: existing } = await client
    .from('worker_salaries')
    .select('settlement_id, worker_id')
    .eq('settlement_id', settlementId);
  const existingKeys = new Set(
    (existing || []).map((r: any) => `${Number(r.worker_id)}`)
  );

  const rows = validSplits
    .filter((s) => !existingKeys.has(String(Number(s.worker_id))))
    .map((s) => {
      const gross = round2(Number(s.amount || 0));
      return {
        worker_id: Number(s.worker_id),
        project_id: projectId,
        year_month: settlementMonth,
        work_hours: round2(Number(s.work_hours || 0)),
        hourly_rate: round2(Number(s.hourly_rate || 0)),
        contract_work_pay: '0',
        gross_pay: String(gross),
        income_tax: '0',
        advance_pay: '0',
        labor_insurance: '0',
        fine: '0',
        net_pay: String(gross),
        payment_status: 'unpaid',
        source: 'team_settlement',
        settlement_id: settlementId,
        team_id: teamId,
        remark: `班组结算分账-结算单#${settlementId}`,
      };
    });

  if (rows.length === 0) return { created: 0, skipped: validSplits.length };

  const { error } = await insertWithSequenceFix('worker_salaries', rows, client);
  if (error) throw new Error(`生成班组分账应发工资失败: ${error.message}`);

  // 失效聚合缓存，保证看板/月报拿到最新应发口径
  try {
    invalidateAggregationCache();
  } catch {
    // 缓存失效非致命
  }

  return { created: rows.length, skipped: validSplits.length - rows.length };
}

function round2(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
}