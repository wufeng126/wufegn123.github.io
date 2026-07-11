import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const client = getSupabaseClient();

    // 获取总数
    const { count, error: countError } = await client
      .from('worker_import_history')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`查询导入历史总数失败: ${countError.message}`);
    }

    // 获取分页数据
    const { data, error } = await client
      .from('worker_import_history')
      .select('*')
      .order('import_time', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) {
      throw new Error(`查询导入历史失败: ${error.message}`);
    }

    return NextResponse.json({
      history: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '请提供记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from('worker_import_history')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
