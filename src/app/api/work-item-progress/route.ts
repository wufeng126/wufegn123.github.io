import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { work_item_id, completed_quantity, record_date, remark } = body;

    if (!work_item_id || completed_quantity == null || !record_date) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 创建进度记录
    const { data, error } = await insertWithSequenceFix('work_item_progress', {
      work_item_id: parseInt(work_item_id),
      completed_quantity,
      record_date,
      remark,
    }, client);

    if (error) {
      throw new Error(`创建进度记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'work_item_progress',
      resourceId: data?.[0]?.id || 0,
      details: { work_item_id, completed_quantity, record_date },
      request,
    });

    return NextResponse.json({ progress: data?.[0] || data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
