import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { isSalaryPaymentLocked } from '@/lib/business-logic';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const salaryId = Number(id);
    if (!Number.isInteger(salaryId) || salaryId <= 0) {
      return NextResponse.json({ error: '无效的工资记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 先查询记录信息用于审计日志
    const { data: salaryData, error: salaryQueryError } = await client
      .from('worker_salaries')
      .select('id, worker_id, project_id, year_month, net_pay, payment_status')
      .eq('id', salaryId)
      .maybeSingle();

    if (salaryQueryError) {
      throw new Error(`查询工资记录失败: ${salaryQueryError.message}`);
    }

    if (!salaryData) {
      return NextResponse.json({ error: 'Salary record not found' }, { status: 404 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (
      accessibleProjectIds !== null &&
      (!salaryData.project_id || !accessibleProjectIds.includes(Number(salaryData.project_id)))
    ) {
      return NextResponse.json({ error: '无权操作该项目下的工资记录' }, { status: 403 });
    }

    if (isSalaryPaymentLocked(salaryData.payment_status)) {
      return NextResponse.json({ error: 'Salary records with payments cannot be deleted.' }, { status: 400 });
    }

    const { error } = await client
      .from('worker_salaries')
      .delete()
      .eq('id', salaryId);

    if (error) {
      throw new Error(`删除工资记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'worker_salary',
      resourceId: salaryId,
      details: { deleted: salaryData },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
