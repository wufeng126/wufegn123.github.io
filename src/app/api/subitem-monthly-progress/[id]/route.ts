import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

// GET 获取对下结算量详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

    // 获取单条记录详情
    if (id && id !== 'list') {
      const { data, error } = await supabase
        .from('subitem_monthly_progress')
        .select('*, work_item_subitems(project_id)')
        .eq('id', parseInt(id))
        .single();

      if (error) {
        return NextResponse.json({ error: '记录不存在' }, { status: 404 });
      }

      // 项目级数据权限：仅可读取自己可访问项目的结算记录
      const accessibleProjects = await getAccessibleProjectIds(supabase, auth.user);
      const recordProjectId = Number((data as { work_item_subitems?: { project_id?: unknown } })?.work_item_subitems?.project_id || 0);
      if (accessibleProjects && recordProjectId && !accessibleProjects.includes(recordProjectId)) {
        return NextResponse.json({ error: '无权访问该项目结算记录' }, { status: 403 });
      }

      return NextResponse.json({ data });
    }

    // 获取列表（支持按项目筛选）
    const accessibleProjects = await getAccessibleProjectIds(supabase, auth.user);
    if (projectId && accessibleProjects && !accessibleProjects.includes(parseInt(projectId))) {
      return NextResponse.json({ error: '无权访问该项目' }, { status: 403 });
    }

    let query = supabase
      .from('subitem_monthly_progress')
      .select(`
        *,
        work_item_subitems (
          id,
          subitem_name,
          unit,
          project_id
        )
      `)
      .order('year_month', { ascending: false });

    if (projectId) {
      query = query.eq('work_item_subitems.project_id', parseInt(projectId));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 未指定项目时按可访问项目过滤（超管返回全部）
    const filtered = accessibleProjects
      ? (data || []).filter((row: { work_item_subitems?: { project_id?: unknown } }) => {
          const pid = Number(row?.work_item_subitems?.project_id || 0);
          return pid > 0 && accessibleProjects.includes(pid);
        })
      : (data || []);

    return NextResponse.json({ data: filtered });

  } catch (error: any) {
    console.error('获取对下结算量失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT 更新对下结算量
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    // 先获取记录以获取 subitem_id
    const { data: existing } = await supabase
      .from('subitem_monthly_progress')
      .select('subitem_id, work_item_subitems(project_id)')
      .eq('id', parseInt(id))
      .single();

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    // 项目级数据权限：仅可修改自己可访问项目的结算记录
    const accessibleProjects = await getAccessibleProjectIds(supabase, auth.user);
    const recordProjectId = Number((existing as { work_item_subitems?: { project_id?: unknown } })?.work_item_subitems?.project_id || 0);
    if (accessibleProjects && recordProjectId && !accessibleProjects.includes(recordProjectId)) {
      return NextResponse.json({ error: '无权操作该项目结算记录' }, { status: 403 });
    }

    const updateData: any = {};
    
    if (body.completed_quantity !== undefined) {
      updateData.completed_quantity = body.completed_quantity;
    }
    if (body.remark !== undefined) {
      updateData.remark = body.remark;
    }

    const { data, error } = await supabase
      .from('subitem_monthly_progress')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 更新累计对下结算量到 settlement_quantity 字段
    const { data: allProgress } = await supabase
      .from('subitem_monthly_progress')
      .select('completed_quantity')
      .eq('subitem_id', existing.subitem_id);

    const totalSettlement = allProgress?.reduce((sum: number, r: any) => {
      return sum + parseFloat(r.completed_quantity || '0');
    }, 0) || 0;

    await supabase
      .from('work_item_subitems')
      .update({ settlement_quantity: totalSettlement.toString() })
      .eq('id', existing.subitem_id);

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error('更新对下结算量失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE 删除对下结算量
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { id } = await params;

    // 先获取记录以获取 subitem_id
    const { data: existing } = await supabase
      .from('subitem_monthly_progress')
      .select('subitem_id, work_item_subitems(project_id)')
      .eq('id', parseInt(id))
      .single();

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    // 项目级数据权限：仅可删除自己可访问项目的结算记录
    const accessibleProjects = await getAccessibleProjectIds(supabase, auth.user);
    const recordProjectId = Number((existing as { work_item_subitems?: { project_id?: unknown } })?.work_item_subitems?.project_id || 0);
    if (accessibleProjects && recordProjectId && !accessibleProjects.includes(recordProjectId)) {
      return NextResponse.json({ error: '无权删除该项目结算记录' }, { status: 403 });
    }

    const { error } = await supabase
      .from('subitem_monthly_progress')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 更新累计对下结算量
    const { data: allProgress } = await supabase
      .from('subitem_monthly_progress')
      .select('completed_quantity')
      .eq('subitem_id', existing.subitem_id);

    const totalSettlement = allProgress?.reduce((sum: number, r: any) => {
      return sum + parseFloat(r.completed_quantity || '0');
    }, 0) || 0;

    await supabase
      .from('work_item_subitems')
      .update({ settlement_quantity: totalSettlement.toString() })
      .eq('id', existing.subitem_id);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('删除对下结算量失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
