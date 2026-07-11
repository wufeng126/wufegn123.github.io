import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET 获取对下结算量详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseClient();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

    // 获取单条记录详情
    if (id && id !== 'list') {
      const { data, error } = await supabase
        .from('subitem_monthly_progress')
        .select('*')
        .eq('id', parseInt(id))
        .single();

      if (error) {
        return NextResponse.json({ error: '记录不存在' }, { status: 404 });
      }

      return NextResponse.json({ data });
    }

    // 获取列表（支持按项目筛选）
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

    return NextResponse.json({ data: data || [] });

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
    const supabase = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    // 先获取记录以获取 subitem_id
    const { data: existing } = await supabase
      .from('subitem_monthly_progress')
      .select('subitem_id')
      .eq('id', parseInt(id))
      .single();

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
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
    const supabase = getSupabaseClient();
    const { id } = await params;

    // 先获取记录以获取 subitem_id
    const { data: existing } = await supabase
      .from('subitem_monthly_progress')
      .select('subitem_id')
      .eq('id', parseInt(id))
      .single();

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
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
