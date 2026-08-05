import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { isSalaryPaymentLocked } from '@/lib/business-logic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要删除的工资记录ID' }, { status: 400 });
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
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
