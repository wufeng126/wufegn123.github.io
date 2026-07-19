import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestAuthUser } from '@/lib/auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

export const PUBLIC_LOG_PROJECT_NAME = '公司公共项目/非项目日志';
export const PUBLIC_LOG_PROJECT_TYPE = 'construction_public_log';

type ProjectRow = {
  id?: number | string | null;
  name?: string | null;
  project_type?: string | null;
};

function isMissingProjectTypeColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    (
      message.includes('project_type') &&
      (message.includes('does not exist') || message.includes('could not find') || message.includes('schema cache'))
    )
  );
}

export function isPublicLogProject(project?: ProjectRow | null) {
  if (!project) return false;
  return project.project_type === PUBLIC_LOG_PROJECT_TYPE || project.name === PUBLIC_LOG_PROJECT_NAME;
}

async function findPublicLogProjectByName(client: SupabaseClient) {
  const { data, error } = await client
    .from('projects')
    .select('id,name')
    .eq('name', PUBLIC_LOG_PROJECT_NAME)
    .limit(1);

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] as ProjectRow | undefined : undefined;
  return row ? { id: Number(row.id), name: row.name || PUBLIC_LOG_PROJECT_NAME, project_type: PUBLIC_LOG_PROJECT_TYPE } : null;
}

export async function ensurePublicLogProject(client: SupabaseClient) {
  const primary = await client
    .from('projects')
    .select('id,name,project_type')
    .eq('project_type', PUBLIC_LOG_PROJECT_TYPE)
    .limit(1);

  if (!primary.error) {
    const row = Array.isArray(primary.data) ? primary.data[0] as ProjectRow | undefined : undefined;
    if (row?.id) return { id: Number(row.id), name: row.name || PUBLIC_LOG_PROJECT_NAME, project_type: row.project_type || PUBLIC_LOG_PROJECT_TYPE };
  } else if (!isMissingProjectTypeColumn(primary.error)) {
    throw new Error(primary.error.message);
  }

  const byName = await findPublicLogProjectByName(client);
  if (byName) {
    if (primary.error && isMissingProjectTypeColumn(primary.error)) return byName;
    await client.from('projects').update({ project_type: PUBLIC_LOG_PROJECT_TYPE }).eq('id', byName.id);
    return byName;
  }

  const basePayload = {
    name: PUBLIC_LOG_PROJECT_NAME,
    year: new Date().getFullYear(),
    status: '公共日志',
    address: '公司内部',
    partner: '公司内部',
    contract_amount: 0,
    icon: 'ClipboardList',
  };
  const insertWithType = await client
    .from('projects')
    .insert({ ...basePayload, project_type: PUBLIC_LOG_PROJECT_TYPE })
    .select('id,name,project_type')
    .single();

  if (!insertWithType.error) {
    const row = insertWithType.data as ProjectRow;
    return { id: Number(row.id), name: row.name || PUBLIC_LOG_PROJECT_NAME, project_type: row.project_type || PUBLIC_LOG_PROJECT_TYPE };
  }

  if (!isMissingProjectTypeColumn(insertWithType.error)) throw new Error(insertWithType.error.message);

  const fallbackInsert = await client
    .from('projects')
    .insert(basePayload)
    .select('id,name')
    .single();
  if (fallbackInsert.error) throw new Error(fallbackInsert.error.message);

  const row = fallbackInsert.data as ProjectRow;
  return { id: Number(row.id), name: row.name || PUBLIC_LOG_PROJECT_NAME, project_type: PUBLIC_LOG_PROJECT_TYPE };
}

export async function getConstructionLogAccessibleProjectIds(client: SupabaseClient, user: RequestAuthUser) {
  const accessibleProjectIds = await getAccessibleProjectIds(client, user);
  if (accessibleProjectIds === null) return null;

  const publicProject = await ensurePublicLogProject(client);
  return Array.from(new Set([...accessibleProjectIds, publicProject.id]));
}

