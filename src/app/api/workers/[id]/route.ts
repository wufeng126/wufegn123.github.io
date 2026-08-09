import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { syncWorkerProjectAssignment } from '@/lib/worker-assignment-sync';
import { checkWorkerDeleteGuard } from '@/lib/worker-delete-guard';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, work_type, id_card, phone, bank_card, project_id, status, entry_date, team_name, is_blacklist, remark } = body;

    const client = getSupabaseClient();
    const workerId = parseInt(id);
    const { data: previousWorker } = await client
      .from('workers')
      .select('project_id')
      .eq('id', workerId)
      .maybeSingle();
    
    // 只更新明确传入的字段，避免覆盖未提供的字段为 null
    const updateData: Record<string, unknown> = {};
    
    if (name !== undefined) updateData.name = name;
    if (work_type !== undefined) updateData.work_type = work_type;
    if (id_card !== undefined) updateData.id_card = id_card;
    if (phone !== undefined) updateData.phone = phone;
    if (bank_card !== undefined) updateData.bank_card = bank_card;
    if (project_id !== undefined) updateData.project_id = project_id || null;
    if (entry_date !== undefined) updateData.entry_date = entry_date || null;
    if (team_name !== undefined) updateData.team_name = team_name || null;
    if (is_blacklist !== undefined) updateData.is_blacklist = is_blacklist;
    if (remark !== undefined) updateData.remark = remark || null;
    
    // 处理状态变更
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'left') {
        updateData.left_at = new Date().toISOString();
      } else if (status === 'in_service' || status === 'archived') {
        updateData.left_at = null;
      }
    }
    
    const { data, error } = await client
      .from('workers')
      .update(updateData)
      .eq('id', workerId)
      .select()
      .single();

    if (error) {
      throw new Error(`更新工人失败: ${error.message}`);
    }

    if (project_id !== undefined) {
      await syncWorkerProjectAssignment(client, {
        workerId,
        projectId: project_id || null,
        previousProjectId: previousWorker?.project_id || null,
        startDate: entry_date || data?.entry_date || null,
      });
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'worker',
      resourceId: workerId,
      details: { name: data?.name, changes: updateData },
      request,
    });

    return NextResponse.json({ worker: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const client = getSupabaseClient();
    
    // 先获取工人信息用于审计日志
    const { data: workerData } = await client
      .from('workers')
      .select('name, work_type, project_id')
      .eq('id', parseInt(id))
      .single();

    // 删除守卫：工人在出勤/工资核算/工资发放中已有数据时阻止删除
    const guard = await checkWorkerDeleteGuard(client, [parseInt(id)]);
    if (guard.hasData) {
      return NextResponse.json(
        {
          error: `该工人在【${guard.blockedModules.join('、')}】中已有数据，删除会导致考勤/工资记录丢失。建议先将该工人改为「离职」状态停用，或确认数据清理方案后再操作。`,
          code: 'WORKER_HAS_DATA',
          blockedModules: guard.blockedModules,
        },
        { status: 400 }
      );
    }

    const { error } = await client
      .from('workers')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除工人失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'worker',
      resourceId: parseInt(id),
      details: { name: workerData?.name, work_type: workerData?.work_type },
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
