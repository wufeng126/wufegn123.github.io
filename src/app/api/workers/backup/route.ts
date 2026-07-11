import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取可恢复的备份数据列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // 查询可恢复的备份数据
    const { data: backups, error, count } = await client
      .from('workers_backup')
      .select('*', { count: 'exact' })
      .eq('restore_available', true)
      .order('deleted_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) {
      throw new Error(`查询备份数据失败: ${error.message}`);
    }

    // 查询删除日志
    const { data: logs } = await client
      .from('worker_deletion_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      backups: backups || [],
      total: count || 0,
      page,
      pageSize,
      logs: logs || [],
    });
  } catch (error: any) {
    console.error('Get backup error:', error);
    return NextResponse.json(
      { error: error.message || '获取备份数据失败' },
      { status: 500 }
    );
  }
}

// 执行备份、清空或恢复操作
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { action, workerIds, operator } = body;

    if (action === 'backup_and_clear') {
      // 1. 查询所有工人数据
      const { data: workers, error: fetchError } = await client
        .from('workers')
        .select('*');

      if (fetchError) {
        throw new Error(`查询工人数据失败: ${fetchError.message}`);
      }

      if (!workers || workers.length === 0) {
        return NextResponse.json({
          success: true,
          message: '无数据需要备份',
          backupCount: 0,
        });
      }

      // 2. 备份到 workers_backup 表
      const backupData = workers.map((w: any) => ({
        original_id: w.id,
        name: w.name,
        work_type: w.work_type,
        phone: w.phone,
        id_card: w.id_card,
        bank_card: w.bank_card,
        project_id: w.project_id,
        status: w.status,
        left_at: w.left_at,
        created_at: w.created_at,
        deleted_by: operator || 'system',
        restore_available: true,
      }));

      const { error: backupError } = await client
        .from('workers_backup')
        .insert(backupData);

      if (backupError) {
        throw new Error(`备份失败: ${backupError.message}`);
      }

      // 3. 删除原数据
      const { error: deleteError } = await client
        .from('workers')
        .delete()
        .neq('id', 0); // 删除所有

      if (deleteError) {
        throw new Error(`删除失败: ${deleteError.message}`);
      }

      // 4. 记录日志
      await client.from('worker_deletion_logs').insert({
        action: 'backup',
        worker_ids: JSON.stringify(workers.map((w: any) => w.id)),
        count: workers.length,
        operator: operator || 'system',
        details: `备份并清空了 ${workers.length} 条工人数据`,
      });

      return NextResponse.json({
        success: true,
        message: `成功备份并清空 ${workers.length} 条工人数据`,
        backupCount: workers.length,
      });
    }

    if (action === 'restore') {
      // 恢复指定的备份数据
      if (!workerIds || workerIds.length === 0) {
        return NextResponse.json(
          { error: '请选择要恢复的数据' },
          { status: 400 }
        );
      }

      // 1. 查询备份数据
      const { data: backups, error: fetchError } = await client
        .from('workers_backup')
        .select('*')
        .in('id', workerIds)
        .eq('restore_available', true);

      if (fetchError) {
        throw new Error(`查询备份数据失败: ${fetchError.message}`);
      }

      if (!backups || backups.length === 0) {
        return NextResponse.json(
          { error: '未找到可恢复的数据' },
          { status: 400 }
        );
      }

      // 2. 恢复到 workers 表（生成新 ID）
      const restoreData = backups.map((b: any) => ({
        name: b.name,
        work_type: b.work_type,
        phone: b.phone,
        id_card: b.id_card,
        bank_card: b.bank_card,
        project_id: b.project_id,
        status: b.status,
        left_at: b.left_at,
      }));

      const { error: restoreError } = await client
        .from('workers')
        .insert(restoreData);

      if (restoreError) {
        throw new Error(`恢复失败: ${restoreError.message}`);
      }

      // 3. 标记备份为已恢复
      const { error: markError } = await client
        .from('workers_backup')
        .update({ restore_available: false })
        .in('id', workerIds);

      if (markError) {
        console.error('标记备份失败:', markError);
      }

      // 4. 记录日志
      await client.from('worker_deletion_logs').insert({
        action: 'restore',
        worker_ids: JSON.stringify(workerIds),
        count: backups.length,
        operator: operator || 'system',
        details: `恢复了 ${backups.length} 条工人数据`,
      });

      return NextResponse.json({
        success: true,
        message: `成功恢复 ${backups.length} 条工人数据`,
        restoreCount: backups.length,
      });
    }

    if (action === 'permanent_delete') {
      // 永久删除备份数据
      if (!workerIds || workerIds.length === 0) {
        return NextResponse.json(
          { error: '请选择要删除的数据' },
          { status: 400 }
        );
      }

      const { error: deleteError } = await client
        .from('workers_backup')
        .delete()
        .in('id', workerIds);

      if (deleteError) {
        throw new Error(`删除失败: ${deleteError.message}`);
      }

      // 记录日志
      await client.from('worker_deletion_logs').insert({
        action: 'permanent_delete',
        worker_ids: JSON.stringify(workerIds),
        count: workerIds.length,
        operator: operator || 'system',
        details: `永久删除了 ${workerIds.length} 条备份数据`,
      });

      return NextResponse.json({
        success: true,
        message: `成功永久删除 ${workerIds.length} 条备份数据`,
        deleteCount: workerIds.length,
      });
    }

    return NextResponse.json(
      { error: '无效的操作' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Backup action error:', error);
    return NextResponse.json(
      { error: error.message || '操作失败' },
      { status: 500 }
    );
  }
}
