import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireSuperAdmin } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';

/**
 * GET  /api/system/projects/duplicates?name=山海境TOD
 *      列出同名项目及各自业务数据量，用于决定保留哪个。
 * POST /api/system/projects/merge  { keepId, mergeIds: [] }
 *      仅当被合并项目"无业务数据"时直接删除；有数据则返回清单，需人工迁移后再执行。
 *      仅超级管理员。
 */

const TABLES = [
  'workers', 'worker_salaries', 'salary_payments', 'work_items', 'work_item_subitems',
  'client_reports', 'client_payments', 'construction_logs', 'construction_log_attendance',
  'miscellaneous_materials', 'comprehensive_expenses', 'supplier_contracts', 'supplier_settlements',
  'supplier_payments', 'team_groups', 'team_settlements', 'team_settlement_payments',
  'living_allowance_records', 'monthly_vouchers', 'monthly_labor_analyses', 'notifications',
];

async function countByProject(client: ReturnType<typeof getSupabaseClient>, table: string, projectId: number) {
  const { count } = await client.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
  return Number(count || 0);
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
      .select('id, name, status, year, created_at, is_archived')
      .ilike('name', `%${name}%`)
      .order('id');
    if (error) throw new Error(error.message);

    const result = [];
    for (const project of projects || []) {
      const counts: Record<string, number> = {};
      for (const table of TABLES) {
        counts[table] = await countByProject(client, table, Number(project.id));
      }
      result.push({ ...project, counts });
    }

    return apiSuccess({ name, projects: result });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询重复项目失败'));
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
    if (!Number.isInteger(keepId) || keepId <= 0) return apiBadRequest('请提供保留的项目ID');
    if (mergeIds.length === 0) return apiBadRequest('请提供要合并掉的项目ID');

    const client = getSupabaseClient();
    const { data: keepProject } = await client.from('projects').select('id, name').eq('id', keepId).maybeSingle();
    if (!keepProject) return apiBadRequest('保留的项目不存在');

    const blocked: Array<{ projectId: number; tables: Record<string, number> }> = [];
    for (const projectId of mergeIds) {
      const nonEmpty: Record<string, number> = {};
      for (const table of TABLES) {
        const count = await countByProject(client, table, projectId);
        if (count > 0) nonEmpty[table] = count;
      }
      if (Object.keys(nonEmpty).length > 0) blocked.push({ projectId, tables: nonEmpty });
    }

    if (blocked.length > 0) {
      return apiSuccess({
        merged: false,
        blocked,
        message: '被合并项目仍有业务数据，已停止。请先把这些数据迁移到保留项目，或确认可删除后按清单处理。',
      });
    }

    for (const projectId of mergeIds) {
      const { error } = await client.from('projects').delete().eq('id', projectId);
      if (error) throw new Error(error.message);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'project',
      resourceId: keepId,
      details: { action: 'merge_duplicate_projects', keepId, deletedIds: mergeIds },
      request,
    });

    return apiSuccess({ merged: true, keepId, deletedIds: mergeIds, message: '已删除空的重复项目' });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '合并重复项目失败'));
  }
}
