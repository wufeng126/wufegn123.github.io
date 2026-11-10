import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * GET /api/workers/diagnose?name=张三
 * 排查「月度工资有人、花名册找不到」：
 *  - 列出所有同名工人（含状态/项目/是否归档）
 *  - 列出工资记录及其 worker_id 是否存在对应工人（孤儿工资）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    if (!auth.user.is_super_admin && !['admin', 'boss'].includes(String(auth.user.role || ''))) {
      return apiBadRequest('只有管理员可以使用该诊断');
    }

    const name = String(new URL(request.url).searchParams.get('name') || '').trim();
    if (!name) return apiBadRequest('请提供姓名，例如 ?name=张克敏');

    const client = getSupabaseClient();
    const { data: workers } = await client
      .from('workers')
      .select('id, name, id_card, phone, project_id, status, person_id, created_at')
      .ilike('name', `%${name}%`)
      .limit(50);

    const { data: salaries } = await client
      .from('worker_salaries')
      .select('id, worker_id, project_id, year_month, work_hours, hourly_rate, gross_pay, net_pay, payment_status')
      .in('worker_id', (workers || []).map((worker: { id?: number }) => Number(worker.id)))
      .limit(200);

    const projectIds = Array.from(new Set([
      ...(workers || []).map((worker: { project_id?: number }) => Number(worker.project_id)),
      ...(salaries || []).map((row: { project_id?: number }) => Number(row.project_id)),
    ].filter(Boolean)));
    const projectMap = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
      (projects || []).forEach((project: { id?: number; name?: string }) => {
        projectMap.set(Number(project.id), String(project.name || ''));
      });
    }

    return apiSuccess({
      name,
      workers: (workers || []).map((worker: Record<string, unknown>) => ({
        ...worker,
        project_name: projectMap.get(Number(worker.project_id)) || (worker.project_id ? `项目#${worker.project_id}` : '未分配项目'),
      })),
      salaries: (salaries || []).map((row: Record<string, unknown>) => ({
        ...row,
        project_name: projectMap.get(Number(row.project_id)) || `项目#${row.project_id}`,
        worker_missing: !(workers || []).some((worker: { id?: number }) => Number(worker.id) === Number(row.worker_id)),
      })),
      hints: [
        '若 workers 为空但 salaries 有记录：说明工人档案已被删除/合并，工资成了孤儿数据（需修复 worker_id 或重新建立花名册档案）。',
        '若 workers 有记录但 project_id 与工资不一致：花名册会显示在他当前项目的分组下，可能不在「南京中交智慧港」分组里。',
        '若 workers 的 status 为 left/archived：花名册默认筛选「全部」时仍会显示，请确认筛选条件。',
      ],
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '诊断失败'));
  }
}
