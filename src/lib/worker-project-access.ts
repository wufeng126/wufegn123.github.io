import type { SupabaseClient } from '@supabase/supabase-js';

type WorkerRow = {
  id?: unknown;
  project_id?: unknown;
};

type AssignmentRow = {
  worker_id?: unknown;
  project_id?: unknown;
};

export type WorkerProjectRelation = {
  workerId: number;
  projectIds: number[];
};

function normalizePositiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isMissingAssignmentsTable(error: { message?: string; code?: string } | null) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache') ||
    (message.includes('relation') && message.includes('not exist'))
  );
}

function uniquePositiveIds(values: unknown[]) {
  return Array.from(new Set(
    values
      .map(normalizePositiveId)
      .filter((id): id is number => id !== null),
  ));
}

/**
 * 返回工人与项目的历史归属关系。
 *
 * workers.project_id 是当前归属，worker_assignments 是调岗后的历史/当前关系。
 * 老库可能尚未创建 worker_assignments，因此缺表时仅使用 workers.project_id。
 */
export async function getWorkerProjectRelations(
  client: SupabaseClient,
  workerIds: number[],
): Promise<Map<number, Set<number>>> {
  const ids = uniquePositiveIds(workerIds);
  const relations = new Map<number, Set<number>>();
  if (ids.length === 0) return relations;

  const { data: workers, error: workersError } = await client
    .from('workers')
    .select('id, project_id')
    .in('id', ids);

  if (workersError) throw new Error(`查询工人归属失败: ${workersError.message}`);

  (workers || []).forEach((worker: WorkerRow) => {
    const workerId = normalizePositiveId(worker.id);
    if (!workerId) return;
    const projectId = normalizePositiveId(worker.project_id);
    relations.set(workerId, projectId ? new Set([projectId]) : new Set());
  });

  try {
    const { data: assignments, error: assignmentsError } = await client
      .from('worker_assignments')
      .select('worker_id, project_id')
      .in('worker_id', ids);

    if (assignmentsError) {
      if (!isMissingAssignmentsTable(assignmentsError)) {
        throw new Error(`查询工人项目分配失败: ${assignmentsError.message}`);
      }
      return relations;
    }

    (assignments || []).forEach((assignment: AssignmentRow) => {
      const workerId = normalizePositiveId(assignment.worker_id);
      const projectId = normalizePositiveId(assignment.project_id);
      if (!workerId || !projectId) return;
      const projectIds = relations.get(workerId) || new Set<number>();
      projectIds.add(projectId);
      relations.set(workerId, projectIds);
    });
  } catch (error) {
    if (isMissingAssignmentsTable(error as { message?: string; code?: string })) {
      return relations;
    }
    throw error;
  }

  return relations;
}

export async function workerBelongsToProject(
  client: SupabaseClient,
  workerId: number,
  projectId: number,
): Promise<boolean> {
  const normalizedWorkerId = normalizePositiveId(workerId);
  const normalizedProjectId = normalizePositiveId(projectId);
  if (!normalizedWorkerId || !normalizedProjectId) return false;

  const relations = await getWorkerProjectRelations(client, [normalizedWorkerId]);
  return relations.get(normalizedWorkerId)?.has(normalizedProjectId) === true;
}

