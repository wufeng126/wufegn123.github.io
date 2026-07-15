import type { SupabaseClient } from '@supabase/supabase-js';

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

function normalizeProjectId(value: unknown) {
  const projectId = Number(value);
  return Number.isInteger(projectId) && projectId > 0 ? projectId : null;
}

export async function syncWorkerProjectAssignment(
  client: SupabaseClient,
  input: {
    workerId: number;
    projectId?: number | string | null;
    previousProjectId?: number | string | null;
    startDate?: string | null;
  },
) {
  const workerId = Number(input.workerId);
  if (!Number.isInteger(workerId) || workerId <= 0) return;

  const projectId = normalizeProjectId(input.projectId);
  const previousProjectId = normalizeProjectId(input.previousProjectId);
  const today = new Date().toISOString().split('T')[0];
  const startDate = input.startDate || today;

  if (previousProjectId && previousProjectId !== projectId) {
    const { error } = await client
      .from('worker_assignments')
      .update({ status: 'transferred', end_date: today })
      .eq('worker_id', workerId)
      .eq('project_id', previousProjectId)
      .eq('status', 'active');
    if (error && !isMissingTableError(error)) throw new Error(error.message);
  }

  if (!projectId) return;

  const { data: existing, error: existingError } = await client
    .from('worker_assignments')
    .select('id, start_date')
    .eq('worker_id', workerId)
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError)) return;
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await client
      .from('worker_assignments')
      .update({
        status: 'active',
        start_date: existing.start_date || startDate,
        end_date: null,
      })
      .eq('id', existing.id);
    if (error && !isMissingTableError(error)) throw new Error(error.message);
    return;
  }

  const { error } = await client
    .from('worker_assignments')
    .insert({
      worker_id: workerId,
      project_id: projectId,
      start_date: startDate,
      status: 'active',
    });

  if (error && !isMissingTableError(error)) throw new Error(error.message);
}

export async function syncWorkerProjectAssignments(
  client: SupabaseClient,
  items: Array<{
    workerId: number;
    projectId?: number | string | null;
    previousProjectId?: number | string | null;
    startDate?: string | null;
  }>,
) {
  for (const item of items) {
    await syncWorkerProjectAssignment(client, item);
  }
}
