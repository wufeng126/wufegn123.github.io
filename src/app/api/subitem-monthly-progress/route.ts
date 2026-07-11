import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const yearMonth = searchParams.get('year_month');
    const subitemId = searchParams.get('subitem_id');

    const client = getSupabaseClient();
    
    let query = client
      .from('subitem_monthly_progress')
      .select(`
        id,
        subitem_id,
        year_month,
        completed_quantity,
        remark,
        created_at,
        work_item_subitems (
          id,
          subitem_name,
          unit,
          budget_quantity,
          contract_price,
          project_id
        )
      `)
      .order('year_month', { ascending: false });

    if (subitemId) {
      query = query.eq('subitem_id', parseInt(subitemId));
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询月度报量失败: ${error.message}`);
    }

    // 如果指定了项目或月份，进行过滤
    let filteredData = data || [];
    
    if (projectId) {
      filteredData = filteredData.filter((record: any) => 
        record.work_item_subitems?.project_id === parseInt(projectId)
      );
    }
    
    if (yearMonth) {
      filteredData = filteredData.filter((record: any) => 
        record.year_month === yearMonth
      );
    }

    // 格式化返回数据
    const records = filteredData.map((record: any) => ({
      id: record.id,
      subitem_id: record.subitem_id,
      subitem_name: record.work_item_subitems?.subitem_name || '未知子项',
      unit: record.work_item_subitems?.unit || '',
      budget_quantity: record.work_item_subitems?.budget_quantity || '0',
      contract_price: record.work_item_subitems?.contract_price || null,
      project_id: record.work_item_subitems?.project_id || null,
      year_month: record.year_month,
      completed_quantity: record.completed_quantity,
      remark: record.remark,
      created_at: record.created_at,
    }));

    return NextResponse.json({ records });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 支持批量创建/更新
    const records = Array.isArray(body.records) ? body.records : [body];
    
    const client = getSupabaseClient();
    const results = [];
    
    for (const record of records) {
      const { subitem_id, year_month, completed_quantity, remark } = record;

      if (!subitem_id || !year_month || completed_quantity === undefined) {
        continue;
      }

      // 检查是否已存在该月份的记录
      const { data: existing } = await client
        .from('subitem_monthly_progress')
        .select('id')
        .eq('subitem_id', parseInt(subitem_id))
        .eq('year_month', year_month)
        .single();

      if (existing) {
        // 更新已有记录
        const { data, error } = await client
          .from('subitem_monthly_progress')
          .update({ 
            completed_quantity: completed_quantity.toString(),
            remark 
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (!error && data) {
          results.push(data);
        }
      } else {
        // 创建新记录
        const { data, error } = await client
          .from('subitem_monthly_progress')
          .insert({ 
            subitem_id: parseInt(subitem_id),
            year_month,
            completed_quantity: completed_quantity.toString(),
            remark 
          })
          .select()
          .single();

        if (!error && data) {
          results.push(data);
        }
      }
    }

    // 更新 work_item_subitems 的 settlement_quantity（累计对下结算量）
    for (const record of results) {
      // 计算该子项所有月份的累计结算量
      const { data: allProgress } = await client
        .from('subitem_monthly_progress')
        .select('completed_quantity')
        .eq('subitem_id', record.subitem_id);

      const totalCompleted = allProgress?.reduce((sum: number, p: any) => {
        return sum + parseFloat(p.completed_quantity || '0');
      }, 0) || 0;

      // 更新子项的 settlement_quantity（对下结算量）
      await client
        .from('work_item_subitems')
        .update({ settlement_quantity: totalCompleted.toString() })
        .eq('id', record.subitem_id);
    }

    return NextResponse.json({ success: true, records: results });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 先获取记录信息，用于更新累计值
    const { data: record } = await client
      .from('subitem_monthly_progress')
      .select('subitem_id')
      .eq('id', parseInt(id))
      .single();

    // 删除记录
    const { error } = await client
      .from('subitem_monthly_progress')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除月度报量失败: ${error.message}`);
    }

    // 更新累计结算量
    if (record) {
      const { data: allProgress } = await client
        .from('subitem_monthly_progress')
        .select('completed_quantity')
        .eq('subitem_id', record.subitem_id);

      const totalCompleted = allProgress?.reduce((sum: number, p: any) => {
        return sum + parseFloat(p.completed_quantity || '0');
      }, 0) || 0;

      await client
        .from('work_item_subitems')
        .update({ settlement_quantity: totalCompleted.toString() })
        .eq('id', record.subitem_id);
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
