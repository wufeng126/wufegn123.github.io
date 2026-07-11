import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要删除的记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
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

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
