import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要删除的工人ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 先删除相关的工资记录
    const { error: salaryError } = await client
      .from('worker_salaries')
      .delete()
      .in('worker_id', ids);

    if (salaryError) {
      throw new Error(`删除工资记录失败: ${salaryError.message}`);
    }
    
    // 再删除工人
    const { error } = await client
      .from('workers')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`批量删除工人失败: ${error.message}`);
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
