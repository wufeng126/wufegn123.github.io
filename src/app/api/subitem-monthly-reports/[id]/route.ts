import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET 获取月度报量列表或详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseClient();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const yearMonth = searchParams.get('year_month');

    // 获取单条记录详情
    if (id && id !== 'list') {
      const { data, error } = await supabase
        .from('subitem_monthly_reports')
        .select('*')
        .eq('id', parseInt(id))
        .single();

      if (error) {
        return NextResponse.json({ error: '记录不存在' }, { status: 404 });
      }

      return NextResponse.json({ data });
    }

    // 获取列表
    let query = supabase
      .from('subitem_monthly_reports')
      .select('*')
      .order('year_month', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', parseInt(projectId));
    }

    if (yearMonth) {
      query = query.eq('year_month', yearMonth);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 按年月分组统计
    const summary: Record<string, { count: number; totalQuantity: number }> = {};
    
    if (data) {
      data.forEach((item: any) => {
        const month = item.year_month;
        if (!summary[month]) {
          summary[month] = { count: 0, totalQuantity: 0 };
        }
        summary[month].count++;
        summary[month].totalQuantity += parseFloat(item.report_quantity || 0);
      });
    }

    return NextResponse.json({
      data: data || [],
      summary: Object.entries(summary).map(([month, stats]) => ({
        year_month: month,
        ...stats,
      })),
    });

  } catch (error: any) {
    console.error('获取月度报量失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT 更新月度报量
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    const { data: existing } = await supabase
      .from('subitem_monthly_reports')
      .select('subitem_id')
      .eq('id', parseInt(id))
      .single();

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    const updateData: any = {};
    
    if (body.report_quantity !== undefined) {
      updateData.report_quantity = body.report_quantity;
    }
    if (body.remark !== undefined) {
      updateData.remark = body.remark;
    }

    const { data, error } = await supabase
      .from('subitem_monthly_reports')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 更新累计对上报量到 completed_quantity 字段
    const { data: allReports } = await supabase
      .from('subitem_monthly_reports')
      .select('report_quantity')
      .eq('subitem_id', existing.subitem_id);

    const totalReport = allReports?.reduce((sum: number, r: any) => {
      return sum + parseFloat(r.report_quantity || '0');
    }, 0) || 0;

    await supabase
      .from('work_item_subitems')
      .update({ completed_quantity: totalReport.toString() })
      .eq('id', existing.subitem_id);

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error('更新月度报量失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE 删除月度报量
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseClient();
    const { id } = await params;

    // 先获取记录以获取 subitem_id
    const { data: existing } = await supabase
      .from('subitem_monthly_reports')
      .select('subitem_id')
      .eq('id', parseInt(id))
      .single();

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    const { error } = await supabase
      .from('subitem_monthly_reports')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 更新累计对上报量
    const { data: allReports } = await supabase
      .from('subitem_monthly_reports')
      .select('report_quantity')
      .eq('subitem_id', existing.subitem_id);

    const totalReport = allReports?.reduce((sum: number, r: any) => {
      return sum + parseFloat(r.report_quantity || '0');
    }, 0) || 0;

    await supabase
      .from('work_item_subitems')
      .update({ completed_quantity: totalReport.toString() })
      .eq('id', existing.subitem_id);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('删除月度报量失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
