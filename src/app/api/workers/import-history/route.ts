import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requireApiWritePermission } from '@/lib/api-auth';

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseRequiredPositiveId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get('page'), 1, 100000);
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 20, 100);

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
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    const recordId = parseRequiredPositiveId(id);
    if (!recordId) {
      return NextResponse.json({ error: '请提供有效的记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from('worker_import_history')
      .delete()
      .eq('id', recordId);

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
