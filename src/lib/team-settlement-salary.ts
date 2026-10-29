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
}): Promise<{ created: number; skipped: number; conflicts: number[] }> {
  const { settlementId, settlementMonth, projectId, teamId, splits } = params;
  const client = getSupabaseClient();

  const validSplits = (splits || []).filter((s) => Number(s.worker_id) > 0);
  if (validSplits.length === 0) return { created: 0, skipped: 0, conflicts: [] };

  // 已存在的 (settlement_id, worker_id) 组合，幂等跳过
  const { data: existing } = await client
    .from('worker_salaries')
    .select('settlement_id, worker_id')
    .eq('settlement_id', settlementId);
  const existingKeys = new Set(
    (existing || []).map((r: any) => `${Number(r.worker_id)}`)
  );

  // 安全修复：该月该工人已有工资记录（手工录入或其他结算单）时，生成会撞
  // worker_salaries(worker_id, project_id, year_month) 唯一键导致整批 insert 失败。
  // 先查已存在记录，跳过冲突工人并返回冲突清单（由调用方提示/处理），不再吞异常。
  const workerIds = validSplits.map((s) => Number(s.worker_id));
  const { data: existingMonth } = await client
    .from('worker_salaries')
    .select('worker_id')
    .eq('project_id', projectId)
    .eq('year_month', settlementMonth)
    .in('worker_id', workerIds);
  const existingMonthKeys = new Set(
    (existingMonth || []).map((r: { worker_id?: unknown }) => Number(r.worker_id))
  );

  const conflicts = validSplits
    .map((s) => Number(s.worker_id))
    .filter((wid) => existingMonthKeys.has(wid));

  const rows = validSplits
    .filter((s) => !existingKeys.has(String(Number(s.worker_id))) && !existingMonthKeys.has(Number(s.worker_id)))
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

  if (rows.length === 0) {
    return { created: 0, skipped: validSplits.length, conflicts };
  }

  try {
    const { error } = await insertWithSequenceFix('worker_salaries', rows, client);
    if (error) throw new Error(`生成班组分账应发工资失败: ${error.message}`);
  } catch (insertError) {
    // 兜底：并发场景下唯一键冲突时给出明确错误与冲突工人清单，由调用方记录/提示
    const msg = String((insertError as Error)?.message || '');
    if (msg.includes('duplicate') || msg.includes('unique')) {
      throw new Error(
        `生成班组分账应发工资失败（存在工人本月已有工资记录，冲突工人: ${
          conflicts.length > 0 ? conflicts.join(',') : '并发冲突'
        }）: ${msg}`,
      );
    }
    throw insertError;
  }

  // 失效聚合缓存，保证看板/月报拿到最新应发口径
  try {
    invalidateAggregationCache();
  } catch {
    // 缓存失效非致命
  }

  return { created: rows.length, skipped: validSplits.length - rows.length, conflicts };
}

function round2(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
}