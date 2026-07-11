import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();
    
    // 先查询记录信息用于审计日志
    const { data: salaryData } = await client
      .from('worker_salaries')
      .select('id, worker_id, year_month, net_pay')
      .eq('id', parseInt(id))
      .single();

    const { error } = await client
      .from('worker_salaries')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除工资记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'worker_salary',
      resourceId: parseInt(id),
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
