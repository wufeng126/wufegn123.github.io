import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { checkWorkerDeleteGuard } from '@/lib/worker-delete-guard';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要删除的工人ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 删除守卫：选中工人中，有出勤/工资核算/工资发放数据的整批阻止，并提示哪些工人
    const guard = await checkWorkerDeleteGuard(client, ids);
    if (guard.hasData) {
      const blockedIds = Array.from(guard.byWorker.keys());
      return NextResponse.json(
        {
          error: `选中工人中有 ${blockedIds.length} 人在【${guard.blockedModules.join('、')}】中已有数据，无法删除（删除会导致考勤/工资记录丢失）。请排除这些工人后重试，或先将他们改为「离职」状态停用。`,
          code: 'WORKER_HAS_DATA',
          blockedWorkerIds: blockedIds,
          blockedModules: guard.blockedModules,
        },
        { status: 400 }
      );
    }

    // 仅删除没有任何关联数据的工人（不再连带删除工资核算记录）
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
