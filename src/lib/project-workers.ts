import type { SupabaseClient } from '@supabase/supabase-js';

export type ProjectWorkerRow = {
  id: number;
  name: string;
  work_type?: string | null;
  team_name?: string | null;
  status?: string | null;
  project_id?: number | null;
  entry_date?: string | null;
  phone?: string | null;
};

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('relation') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  );
}

function uniquePositiveIds(ids: number[]) {
  return Array.from(new Set(
    ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ));
}

function mergeActiveWorkers(target: Map<number, ProjectWorkerRow>, rows: ProjectWorkerRow[]) {
  rows
    .filter((worker) => isActiveWorkerStatus(worker.status))
    .forEach((worker) => target.set(Number(worker.id), worker));
}

function isActiveWorkerStatus(status?: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return true;
  return ['in_service', 'active', '在场', '在岗'].includes(normalized);
}

export async function getProjectActiveWorkers(
  client: SupabaseClient,
  projectId: number,
  options: {
    workerIds?: number[];
    fields?: string;
  } = {},
) {
  const requestedWorkerIds = options.workerIds ? uniquePositiveIds(options.workerIds) : null;
  if (requestedWorkerIds && requestedWorkerIds.length === 0) return [];

  const fields = options.fields || 'id,name,work_type,team_name,status,project_id,entry_date,phone';
  const workerMap = new Map<number, ProjectWorkerRow>();

  let directQuery = client
    .from('workers')
    .select(fields)
    .eq('project_id', projectId);
  if (requestedWorkerIds) directQuery = directQuery.in('id', requestedWorkerIds);

  const { data: directRows, error: directError } = await directQuery;
  if (directError) throw new Error(directError.message);
  mergeActiveWorkers(workerMap, (directRows || []) as unknown as ProjectWorkerRow[]);

  let assignmentQuery = client
    .from('worker_assignments')
    .select('worker_id')
    .eq('project_id', projectId)
    .eq('status', 'active');
  if (requestedWorkerIds) assignmentQuery = assignmentQuery.in('worker_id', requestedWorkerIds);

  const { data: assignmentRows, error: assignmentError } = await assignmentQuery;
  if (assignmentError && !isMissingTableError(assignmentError)) throw new Error(assignmentError.message);

  const assignedWorkerIds = uniquePositiveIds(
    ((assignmentRows || []) as { worker_id: number }[]).map((row) => Number(row.worker_id)),
  ).filter((workerId) => !workerMap.has(workerId));

  if (assignedWorkerIds.length > 0) {
    const { data: assignedRows, error: assignedError } = await client
      .from('workers')
      .select(fields)
      .in('id', assignedWorkerIds);
    if (assignedError) throw new Error(assignedError.message);
    mergeActiveWorkers(workerMap, (assignedRows || []) as unknown as ProjectWorkerRow[]);
  }

  return Array.from(workerMap.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'));
}
