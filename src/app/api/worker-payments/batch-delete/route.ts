import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { invalidateAggregationCache } from '@/lib/data-aggregation';

function normalizeIdList(value: unknown, maxCount = 500): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxCount) return null;

  const ids = value.map((item) => {
    const id = typeof item === 'number' ? item : Number(item);
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  if (ids.some((id) => id === null)) return null;
  return Array.from(new Set(ids as number[]));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const ids = normalizeIdList(body.ids);

    if (!ids) {
      return NextResponse.json({ error: '请提供有效的工资发放记录ID，且单次最多删除500条' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: existingRows, error: fetchError } = await client
      .from('salary_payments')
      .select('id, salary_id, worker_id, project_id')
      .in('id', ids);

    if (fetchError) {
      throw new Error(`查询工资发放记录失败: ${fetchError.message}`);
    }
    if (!existingRows || existingRows.length !== ids.length) {
      const existingIds = new Set((existingRows || []).map((row: any) => Number(row.id)));
      const missingIds = ids.filter((id) => !existingIds.has(id));
      return NextResponse.json({
        error: `部分工资发放记录不存在，批量删除已取消：${missingIds.join('、')}`,
      }, { status: 404 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (
      accessibleProjectIds !== null &&
      existingRows.some((row: any) => !accessibleProjectIds.includes(Number(row.project_id)))
    ) {
      return NextResponse.json({ error: '所选记录中包含无权删除的项目数据，批量删除已取消' }, { status: 403 });
    }
    
    // 批量删除工资发放记录
    const { error } = await client
      .from('salary_payments')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`批量删除工资发放记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'salary_payment',
      resourceId: 0,
      details: { action: 'batch_delete', count: ids.length, ids },
      request,
    });

    const { syncAllSalaryPaymentStatus } = await import('@/lib/business-logic');
    await syncAllSalaryPaymentStatus();
    invalidateAggregationCache();

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : '删除失败';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
