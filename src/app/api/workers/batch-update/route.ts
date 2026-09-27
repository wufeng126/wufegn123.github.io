import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { syncWorkerProjectAssignments } from '@/lib/worker-assignment-sync';

function normalizeWorkerIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids = value.map((item) => Number(item));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return Array.from(new Set(ids));
}

function parseProjectId(value: unknown): number | null | undefined {
  if (value === null || value === '') return null;
  const projectId = Number(value);
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined;
}

function canAccessProject(accessibleProjectIds: number[] | null, projectId: unknown): boolean {
  return projectId == null
    || accessibleProjectIds === null
    || accessibleProjectIds.includes(Number(projectId));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { field, value } = body;
    const ids = normalizeWorkerIds(body.ids);

    if (!ids) {
      return NextResponse.json({ error: '请提供要修改的工人ID' }, { status: 400 });
    }

    if (!field) {
      return NextResponse.json({ error: '请提供要修改的字段' }, { status: 400 });
    }

    // 允许批量修改的字段
    const allowedFields = ['work_type', 'project_id', 'status'];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: '不支持批量修改此字段' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: previousWorkers, error: workerQueryError } = await client
      .from('workers')
      .select('id, project_id, entry_date')
      .in('id', ids);

    if (workerQueryError) {
      throw new Error(`查询工人失败: ${workerQueryError.message}`);
    }

    const workersById = new Map(
      (previousWorkers || []).map((worker) => [Number(worker.id), worker]),
    );
    const missingIds = ids.filter((id) => !workersById.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `以下工人不存在：${missingIds.join('、')}` },
        { status: 404 },
      );
    }

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const hasInaccessibleWorker = (previousWorkers || []).some(
      (worker) => !canAccessProject(accessibleProjectIds, worker.project_id),
    );
    if (hasInaccessibleWorker) {
      return NextResponse.json({ error: '当前账号无权修改所选工人' }, { status: 403 });
    }

    const targetProjectId = field === 'project_id' ? parseProjectId(value) : undefined;
    if (field === 'project_id' && targetProjectId === undefined) {
      return NextResponse.json({ error: '项目ID无效' }, { status: 400 });
    }
    if (field === 'project_id' && !canAccessProject(accessibleProjectIds, targetProjectId)) {
      return NextResponse.json({ error: '当前账号无权将工人分配到该项目' }, { status: 403 });
    }
    
    const updateData: Record<string, any> = {};
    updateData[field] = field === 'project_id' ? targetProjectId : value;
    
    const { data, error } = await client
      .from('workers')
      .update(updateData)
      .in('id', ids)
      .select();

    if (error) {
      throw new Error(`批量修改工人失败: ${error.message}`);
    }

    if (field === 'project_id') {
      const previousById = new Map(
        ((previousWorkers || []) as Array<{ id: number; project_id?: number | null; entry_date?: string | null }>)
          .map((worker) => [Number(worker.id), worker]),
      );
      await syncWorkerProjectAssignments(client, ids.map((id) => {
        const previous = previousById.get(Number(id));
        return {
          workerId: Number(id),
          projectId: targetProjectId ?? null,
          previousProjectId: previous?.project_id || null,
          startDate: previous?.entry_date || null,
        };
      }));
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '修改失败' },
      { status: 500 }
    );
  }
}
