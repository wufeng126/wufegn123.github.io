import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requireApiWritePermission } from '@/lib/api-auth';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';

// GET /api/worker-assignments?worker_id=X or ?project_id=X
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const workerId = searchParams.get('worker_id');
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();

    let query = client.from('worker_assignments').select(`
      id,
      worker_id,
      project_id,
      start_date,
      end_date,
      status,
      created_at,
      projects (
        id,
        name
      ),
      workers (
        id,
        name,
        work_type,
        id_card,
        phone,
        status
      )
    `);

    if (workerId) {
      query = query.eq('worker_id', parseInt(workerId));
    }
    if (projectId) {
      query = query.eq('project_id', parseInt(projectId));
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw new Error(`查询分配记录失败: ${error.message}`);

    const formatted = (data || []).map((a: any) => ({
      id: a.id,
      worker_id: a.worker_id,
      project_id: a.project_id,
      project_name: a.projects?.name || null,
      start_date: a.start_date,
      end_date: a.end_date,
      status: a.status,
      created_at: a.created_at,
      worker_name: a.workers?.name || null,
      worker_work_type: a.workers?.work_type || null,
      worker_id_card: a.workers?.id_card || null,
      worker_status: a.workers?.status || null,
    }));

    return NextResponse.json({ assignments: formatted });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}

// POST /api/worker-assignments - 分配工人到项目（支持调动）
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { worker_id, project_id, start_date, action } = body;

    if (!worker_id || !project_id) {
      return NextResponse.json({ error: '工人ID和项目ID不能为空' }, { status: 400 });
    }

    const client = getSupabaseClient();

    if (action === 'transfer') {
      // 调动：结束旧项目分配，创建新项目分配
      const { source_project_id } = body;
      
      if (source_project_id) {
        // 结束原项目分配
        await client
          .from('worker_assignments')
          .update({ 
            status: 'transferred', 
            end_date: new Date().toISOString().split('T')[0] 
          })
          .eq('worker_id', worker_id)
          .eq('project_id', source_project_id)
          .eq('status', 'active');
      }

      // 创建新项目分配
      const { data: assignData, error: assignError } = await insertWithSequenceFix(
        'worker_assignments',
        {
          worker_id,
          project_id,
          start_date: start_date || new Date().toISOString().split('T')[0],
          status: 'active',
        },
        client
      );

      if (assignError) {
        // 如果是重复键，尝试更新
        if (assignError.code === '23505') {
          await client
            .from('worker_assignments')
            .update({ status: 'active', start_date: start_date || new Date().toISOString().split('T')[0], end_date: null })
            .eq('worker_id', worker_id)
            .eq('project_id', project_id);
        } else {
          throw assignError;
        }
      }

      // 更新工人的当前项目
      await client
        .from('workers')
        .update({ project_id, status: 'in_service' })
        .eq('id', worker_id);

      await auditLog({
        operationType: 'transfer',
        resourceType: 'worker',
        resourceId: worker_id,
        details: { from_project: source_project_id, to_project: project_id },
        request,
      });

      return NextResponse.json({ success: true, message: '调动成功' });
    }

    // 普通分配：将工人分配到项目
    const { data: assignData, error: assignError } = await insertWithSequenceFix(
      'worker_assignments',
      {
        worker_id,
        project_id,
        start_date: start_date || null,
        status: 'active',
      },
      client
    );

    if (assignError) {
      if (assignError.code === '23505') {
        return NextResponse.json({ error: '该工人已在此项目中' }, { status: 400 });
      }
      throw assignError;
    }

    // 更新工人当前项目（如果没有当前项目）
    const { data: worker } = await client.from('workers').select('project_id').eq('id', worker_id).single();
    if (!worker?.project_id) {
      await client.from('workers').update({ project_id }).eq('id', worker_id);
    }

    await auditLog({
      operationType: 'assign',
      resourceType: 'worker',
      resourceId: worker_id,
      details: { project_id },
      request,
    });

    return NextResponse.json({ assignment: assignData });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 });
  }
}

// DELETE /api/worker-assignments?id=X - mark one project assignment as left while keeping history.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const assignmentId = Number(request.nextUrl.searchParams.get('id'));
    if (!assignmentId) {
      return NextResponse.json({ error: '分配ID不能为空' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: assignment, error: fetchError } = await client
      .from('worker_assignments')
      .select('id, worker_id, project_id, status')
      .eq('id', assignmentId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`查询分配记录失败: ${fetchError.message}`);
    }
    if (!assignment) {
      return NextResponse.json({ error: '未找到分配记录' }, { status: 404 });
    }

    const { data, error } = await client
      .from('worker_assignments')
      .update({ status: 'left', end_date: today })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      throw new Error(`退场失败: ${error.message}`);
    }

    const { data: worker } = await client
      .from('workers')
      .select('project_id')
      .eq('id', assignment.worker_id)
      .maybeSingle();

    if (worker?.project_id === assignment.project_id) {
      const { data: activeAssignments } = await client
        .from('worker_assignments')
        .select('project_id')
        .eq('worker_id', assignment.worker_id)
        .eq('status', 'active')
        .neq('id', assignmentId)
        .order('start_date', { ascending: false })
        .limit(1);

      const nextProjectId = activeAssignments?.[0]?.project_id || null;
      await client
        .from('workers')
        .update({ project_id: nextProjectId, status: nextProjectId ? 'in_service' : 'left' })
        .eq('id', assignment.worker_id);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'worker',
      resourceId: assignment.worker_id,
      details: { action: 'leave_assignment', assignment_id: assignmentId, project_id: assignment.project_id },
      request,
    });

    return NextResponse.json({ assignment: data, success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || '退场失败' }, { status: 500 });
  }
}

// PUT /api/worker-assignments - 更新分配状态
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, status, end_date } = body;

    if (!id) {
      return NextResponse.json({ error: '分配ID不能为空' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: any = {};
    if (status) updateData.status = status;
    if (end_date) updateData.end_date = end_date;

    const { data, error } = await client
      .from('worker_assignments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ assignment: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 500 });
  }
}
