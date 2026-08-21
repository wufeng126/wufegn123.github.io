import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

type ImportItem = {
  work_type?: unknown;
  unit?: unknown;
  price?: unknown;
  project_id?: unknown;
  year?: unknown;
  notes?: unknown;
};

function parseOptionalPositiveId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePrice(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseYear(value: unknown): number {
  if (value === undefined || value === null || value === '') return new Date().getFullYear();
  const parsed = Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return new Date().getFullYear();
  return parsed;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { items } = body; // [{work_type, unit, price, project_id, year, notes}]
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: '数据不能为空' }, { status: 400 });
    }
    if (items.length > 1000) {
      return NextResponse.json({ success: false, error: '单次最多导入 1000 条数据' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const results = { success: 0, failed: 0, errors: [] as string[] };
    const accessibleProjects = await getAccessibleProjectIds(supabase, auth.user);

    for (const rawItem of items as ImportItem[]) {
      const workType = typeof rawItem.work_type === 'string' ? rawItem.work_type.trim() : '';
      const price = parsePrice(rawItem.price);
      const projectId = parseOptionalPositiveId(rawItem.project_id);

      if (!workType || price === null) {
        results.failed++;
        results.errors.push(`工序或单价缺失/格式错误: ${JSON.stringify(rawItem)}`);
        continue;
      }

      if (rawItem.project_id && !projectId) {
        results.failed++;
        results.errors.push(`${workType}: 项目ID格式错误`);
        continue;
      }

      if (projectId && accessibleProjects && !accessibleProjects.includes(projectId)) {
        results.failed++;
        results.errors.push(`${workType}: 项目不存在或无权限导入`);
        continue;
      }

      const { error } = await supabase.from('unit_prices').insert({
        work_type: workType,
        unit: typeof rawItem.unit === 'string' && rawItem.unit.trim() ? rawItem.unit.trim() : null,
        price,
        project_id: projectId,
        year: parseYear(rawItem.year),
        notes: typeof rawItem.notes === 'string' && rawItem.notes.trim() ? rawItem.notes.trim() : null,
      });
      if (error) { results.failed++; results.errors.push(`${workType}: ${error.message}`); }
      else results.success++;
    }

    return NextResponse.json({ success: true, data: results });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '导入失败' }, { status: 500 });
  }
}
