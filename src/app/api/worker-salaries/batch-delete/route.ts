import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { isSalaryPaymentLocked } from '@/lib/business-logic';

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
      return NextResponse.json({ error: '请提供有效的工资记录ID，且单次最多删除500条' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data: salaryRecords, error: fetchError } = await client
      .from('worker_salaries')
      .select('id, payment_status')
      .in('id', ids);

    if (fetchError) {
      throw new Error(`Query salary records failed: ${fetchError.message}`);
    }

    const lockedRecords = (salaryRecords || []).filter(record => isSalaryPaymentLocked(record.payment_status));
    if (lockedRecords.length > 0) {
      return NextResponse.json({
        error: 'Salary records with payments cannot be deleted.',
        locked_count: lockedRecords.length,
        locked_ids: lockedRecords.map(record => record.id),
      }, { status: 400 });
    }
    
    const { error } = await client
      .from('worker_salaries')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`批量删除工资记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'worker_salary',
      resourceId: 0,
      details: { action: 'batch_delete', count: ids.length, ids },
      request,
    });

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
