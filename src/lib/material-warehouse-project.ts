import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 「库房」虚拟项目：只允许在「零星材料」模块中出现。
 *
 * 红线：其他任何模块（项目列表、施工日志、报量、回款、工资、供应商、班组、月报、看板…）
 * 都不能出现该项目，也不能往它下面写非零星材料的数据。
 */
export const MATERIAL_WAREHOUSE_PROJECT_NAME = '库房';
export const MATERIAL_WAREHOUSE_PROJECT_TYPE = 'material_warehouse';

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

export function isMaterialWarehouseProject(project?: ProjectRow | null) {
  if (!project) return false;
  return project.project_type === MATERIAL_WAREHOUSE_PROJECT_TYPE
    || String(project.name || '').trim() === MATERIAL_WAREHOUSE_PROJECT_NAME;
}

/** 兜底：按项目 ID 判断是否为库房（写接口拦截用） */
export async function isMaterialWarehouseProjectId(client: SupabaseClient, projectId: number) {
  if (!Number.isInteger(projectId) || projectId <= 0) return false;
  const { data, error } = await client
    .from('projects')
    .select('id,name,project_type')
    .eq('id', projectId)
    .maybeSingle();
  if (error) {
    if (isMissingProjectTypeColumn(error)) {
      const fallback = await client.from('projects').select('id,name').eq('id', projectId).maybeSingle();
      return String((fallback.data as ProjectRow | null)?.name || '').trim() === MATERIAL_WAREHOUSE_PROJECT_NAME;
    }
    return false;
  }
  return isMaterialWarehouseProject(data as ProjectRow | null);
}

/** 不存在则创建（只在零星材料模块需要时调用） */
export async function ensureMaterialWarehouseProject(client: SupabaseClient) {
  const primary = await client
    .from('projects')
    .select('id,name,project_type')
    .eq('project_type', MATERIAL_WAREHOUSE_PROJECT_TYPE)
    .limit(1);

  if (!primary.error) {
    const row = Array.isArray(primary.data) ? (primary.data[0] as ProjectRow | undefined) : undefined;
    if (row?.id) {
      return {
        id: Number(row.id),
        name: row.name || MATERIAL_WAREHOUSE_PROJECT_NAME,
        project_type: row.project_type || MATERIAL_WAREHOUSE_PROJECT_TYPE,
      };
    }
  } else if (!isMissingProjectTypeColumn(primary.error)) {
    throw new Error(primary.error.message);
  }

  const { data: byName } = await client
    .from('projects')
    .select('id,name')
    .eq('name', MATERIAL_WAREHOUSE_PROJECT_NAME)
    .limit(1);
  const existing = Array.isArray(byName) ? (byName[0] as ProjectRow | undefined) : undefined;
  if (existing?.id) {
    await client.from('projects').update({ project_type: MATERIAL_WAREHOUSE_PROJECT_TYPE }).eq('id', existing.id);
    return { id: Number(existing.id), name: MATERIAL_WAREHOUSE_PROJECT_NAME, project_type: MATERIAL_WAREHOUSE_PROJECT_TYPE };
  }

  const payload = {
    name: MATERIAL_WAREHOUSE_PROJECT_NAME,
    year: new Date().getFullYear(),
    status: '库房',
    address: '公司库房',
    partner: '公司内部',
    contract_amount: 0,
    project_type: MATERIAL_WAREHOUSE_PROJECT_TYPE,
  };

  const created = await client.from('projects').insert(payload).select('id,name,project_type').single();
  if (created.error) {
    // project_type 列不存在时回退（老库）
    if (isMissingProjectTypeColumn(created.error)) {
      const { project_type: _ignored, ...fallback } = payload;
      const retry = await client.from('projects').insert(fallback).select('id,name').single();
      if (retry.error) throw new Error(retry.error.message);
      return { id: Number((retry.data as ProjectRow).id), name: MATERIAL_WAREHOUSE_PROJECT_NAME, project_type: null };
    }
    throw new Error(created.error.message);
  }

  return {
    id: Number((created.data as ProjectRow).id),
    name: MATERIAL_WAREHOUSE_PROJECT_NAME,
    project_type: MATERIAL_WAREHOUSE_PROJECT_TYPE,
  };
}
