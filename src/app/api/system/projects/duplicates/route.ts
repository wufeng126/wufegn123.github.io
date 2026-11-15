import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireSuperAdmin } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';

/**
 * GET  /api/system/projects/duplicates?name=山海境TOD
 *      列出同名项目及各自业务数据量。
 * POST /api/system/projects/duplicates
 *      { keepId, mergeIds, dryRun?: true }
 *      1) dryRun：只返回迁移计划（各表待迁移条数），不动数据
 *      2) 不带 dryRun：把被合并项目的数据迁到保留项目后删除项目
 *         - 工人：同身份证在保留项目已存在 → 合并到已有工人（子表改挂）后删除重复任职
 *         - 工资：同工人+同月已存在 → 发放改挂到已有工资行后删除重复行
 *         - 其他表：直接改 project_id（唯一约束冲突时逐行迁移并报告）
 *      仅超级管理员。
 */

const COUNT_TABLES = [
  'workers', 'worker_salaries', 'salary_payments', 'work_items', 'work_item_subitems',
  'client_reports', 'client_payments', 'construction_logs', 'construction_log_attendance',
  'miscellaneous_materials', 'comprehensive_expenses', 'supplier_contracts', 'supplier_settlements',
  'supplier_payments', 'team_groups', 'team_settlements', 'team_settlement_payments',
  'living_allowance_records', 'monthly_vouchers', 'monthly_labor_analyses', 'notifications',
  'worker_assignments', 'certificates', 'visas', 'project_contracts',
  'settlements', 'payments', 'settlement_evidence_records',
];

const SIMPLE_MOVE_TABLES = [
  'work_items', 'work_item_subitems', 'client_reports', 'client_payments', 'construction_logs',
  'construction_log_attendance', 'miscellaneous_materials', 'comprehensive_expenses',
  'supplier_contracts', 'supplier_settlements', 'supplier_payments', 'team_groups', 'team_settlements',
  'team_settlement_payments', 'living_allowance_records', 'monthly_vouchers', 'monthly_labor_analyses',
  'notifications', 'worker_assignments', 'certificates', 'visas', 'project_contracts',
  'settlements', 'payments', 'settlement_evidence_records',
];

async function countByProject(client: ReturnType<typeof getSupabaseClient>, table: string, projectId: number) {
  try {
    const { count, error } = await client.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    if (error) return -1;
    return Number(count || 0);
  } catch {
    return -1;
  }
}

async function moveSimpleTable(
  client: ReturnType<typeof getSupabaseClient>,
  table: string,
  mergeId: number,
  keepId: number,
) {
  try {
    const { error } = await client.from(table).update({ project_id: keepId }).eq('project_id', mergeId);
    if (!error) return { ok: true, partial: null as null | { moved: number; blocked: number } };

    const { data: rows } = await client.from(table).select('id').eq('project_id', mergeId).limit(2000);
    let moved = 0;
    let blocked = 0;
    for (const row of rows || []) {
      const { error: rowError } = await client
        .from(table)
        .update({ project_id: keepId })
        .eq('id', (row as { id: number }).id);
      if (rowError) blocked += 1;
      else moved += 1;
    }
    return { ok: true, partial: { moved, blocked } };
  } catch {
    return { ok: false, partial: null };
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const name = String(new URL(request.url).searchParams.get('name') || '').trim();
    if (!name) return apiBadRequest('请提供项目名，例如 ?name=山海境TOD');

    const client = getSupabaseClient();
    const { data: projects, error } = await client
      .from('projects')
      .select('*')
      .ilike('name', `%${name}%`)
      .order('id');
    if (error) throw new Error(error.message);

    const result = [];
    for (const project of projects || []) {
      const counts: Record<string, number> = {};
      for (const table of COUNT_TABLES) {
        counts[table] = await countByProject(client, table, Number(project.id));
      }
      result.push({ ...project, counts });
    }

    return apiSuccess({ name, projects: result });
  } catch (error: unknown) {
    console.error('[ProjectDedupe] query failed:', error);
    return apiServerError(error instanceof Error ? error.message : getErrorMessage(error, '查询重复项目失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const keepId = Number(body?.keepId);
    const rawMergeIds: unknown[] = Array.isArray(body?.mergeIds) ? body.mergeIds : [];
    const mergeIds: number[] = Array.from(new Set(
      rawMergeIds
        .map((id) => Number(id))
        .filter((id): id is number => Number.isInteger(id) && id > 0 && id !== keepId),
    ));
    const dryRun = body?.dryRun === true;
    if (!Number.isInteger(keepId) || keepId <= 0) return apiBadRequest('请提供保留的项目ID');
    if (mergeIds.length === 0) return apiBadRequest('请提供要合并掉的项目ID');

    const client = getSupabaseClient();
    const { data: keepProject } = await client.from('projects').select('id, name').eq('id', keepId).maybeSingle();
    if (!keepProject) return apiBadRequest('保留的项目不存在');

    const plan = [];
    for (const projectId of mergeIds) {
      const tables: Record<string, number> = {};
      for (const table of COUNT_TABLES) {
        const c = await countByProject(client, table, projectId);
        if (c > 0) tables[table] = c;
      }
      plan.push({ projectId, tables });
    }

    if (dryRun) return apiSuccess({ dryRun: true, keepId, plan });

    const results: Array<Record<string, unknown>> = [];

    for (const projectId of mergeIds) {
      const partial: Array<Record<string, unknown>> = [];

      // 1) 工人：同身份证已存在于保留项目 → 子表改挂 + 删除重复任职
      const { data: mergeWorkers } = await client
        .from('workers')
        .select('id, name, id_card, project_id')
        .eq('project_id', projectId);
      const { data: keepWorkers } = await client
        .from('workers')
        .select('id, id_card')
        .eq('project_id', keepId);
      const keepByIdCard = new Map<string, number>();
      (keepWorkers || []).forEach((w: { id?: number; id_card?: string | null }) => {
        const key = String(w.id_card || '').trim().toUpperCase();
        if (key) keepByIdCard.set(key, Number(w.id));
      });

      for (const worker of mergeWorkers || []) {
        const workerId = Number(worker.id);
        const idCardKey = String(worker.id_card || '').trim().toUpperCase();
        const existingId = idCardKey ? keepByIdCard.get(idCardKey) : undefined;
        if (existingId && existingId !== workerId) {
          for (const table of ['worker_salaries', 'salary_payments', 'worker_assignments', 'team_settlement_splits', 'living_allowance_records']) {
            try {
              await client.from(table).update({ worker_id: existingId }).eq('worker_id', workerId);
            } catch {
              // 表不存在/无该列时忽略
            }
          }
          const { error } = await client.from('workers').delete().eq('id', workerId);
          if (error) partial.push({ table: 'workers', workerId, error: error.message });
        } else {
          const { error } = await client.from('workers').update({ project_id: keepId }).eq('id', workerId);
          if (error) partial.push({ table: 'workers', workerId, error: error.message });
          else if (idCardKey) keepByIdCard.set(idCardKey, workerId);
        }
      }

      // 2) 工资：同工人+同月已存在 → 发放改挂 + 删除重复工资行
      const { data: mergeSalaries } = await client
        .from('worker_salaries')
        .select('id, worker_id, year_month')
        .eq('project_id', projectId);
      for (const salary of mergeSalaries || []) {
        const month = String(salary.year_month || '').slice(0, 7);
        const { data: existing } = await client
          .from('worker_salaries')
          .select('id')
          .eq('project_id', keepId)
          .eq('worker_id', Number(salary.worker_id))
          .ilike('year_month', `${month}%`)
          .limit(1);
        const existingId = existing && existing[0] ? Number((existing[0] as { id: number }).id) : null;
        if (existingId) {
          await client.from('salary_payments').update({ salary_id: existingId }).eq('salary_id', Number(salary.id));
          const { error } = await client.from('worker_salaries').delete().eq('id', Number(salary.id));
          if (error) partial.push({ table: 'worker_salaries', salaryId: salary.id, error: error.message });
        } else {
          const { error } = await client.from('worker_salaries').update({ project_id: keepId }).eq('id', Number(salary.id));
          if (error) partial.push({ table: 'worker_salaries', salaryId: salary.id, error: error.message });
        }
      }

      // 3) 其他表：直接改 project_id
      for (const table of SIMPLE_MOVE_TABLES) {
        const outcome = await moveSimpleTable(client, table, projectId, keepId);
        if (!outcome.ok) partial.push({ table, error: '表不可迁移或不存在' });
        else if (outcome.partial && outcome.partial.blocked > 0) partial.push({ table, ...outcome.partial });
      }

      // 4) 复查余量，清空后才删项目
      const remaining: Record<string, number> = {};
      for (const table of COUNT_TABLES) {
        const c = await countByProject(client, table, projectId);
        if (c > 0) remaining[table] = c;
      }

      if (Object.keys(remaining).length === 0) {
        const { error: deleteError } = await client.from('projects').delete().eq('id', projectId);
        results.push({ projectId, deleted: !deleteError, deleteError: deleteError?.message, partial });
      } else {
        results.push({ projectId, deleted: false, remaining, partial });
      }
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'project',
      resourceId: keepId,
      details: { action: 'merge_duplicate_projects', keepId, mergeIds, results },
      request,
    });

    const stillBlocked = results.filter((r) => !r.deleted);
    return apiSuccess({
      merged: stillBlocked.length === 0,
      keepId,
      results,
      message: stillBlocked.length === 0
        ? '重复项目已合并并删除'
        : '部分项目仍有数据未能迁移，请查看 results 中的 remaining/partial',
    });
  } catch (error: unknown) {
    console.error('[ProjectDedupe] merge failed:', error);
    return apiServerError(error instanceof Error ? error.message : getErrorMessage(error, '合并重复项目失败'));
  }
}
