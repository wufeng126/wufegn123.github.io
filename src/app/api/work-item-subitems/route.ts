import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workItemId = searchParams.get('work_item_id');
    const projectId = searchParams.get('project_id');
    const id = searchParams.get('id');

    const client = getSupabaseClient();
    
    if (id) {
      // 获取单个子项（关联项目名称）
      const { data, error } = await client
        .from('work_item_subitems')
        .select(`
          *,
          project:projects(id, name)
        `)
        .eq('id', parseInt(id))
        .single();

      if (error) {
        throw new Error(`查询子项失败: ${error.message}`);
      }

      // 格式化返回数据
      const subitem = {
        ...data,
        project_name: data.project?.name || '',
      };

      return NextResponse.json({ subitem });
    }

    // 查询列表（关联项目名称）
    let query = client
      .from('work_item_subitems')
      .select(`
        *,
        project:projects(id, name)
      `)
      .order('created_at', { ascending: false });

    if (workItemId) {
      query = query.eq('work_item_id', parseInt(workItemId));
    }
    
    if (projectId) {
      query = query.eq('project_id', parseInt(projectId));
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询分项工程失败: ${error.message}`);
    }

    // 格式化返回数据
    const subitems = (data || []).map((item: any) => ({
      ...item,
      project_name: item.project?.name || '',
    }));

    return NextResponse.json({ subitems });
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
    const { 
      work_item_id, 
      project_id,
      subitem_name, 
      item_name, // 兼容字段：分项工程名称
      unit, 
      budget_quantity, 
      completed_quantity, 
      unit_price, 
      contract_price,
      limit_price,
      remark 
    } = body;

    // 支持两种模式：
    // 1. 作为work_item的子项：需要work_item_id
    // 2. 作为独立的分项工程：需要project_id
    const name = subitem_name || item_name;
    
    if (!name || !unit) {
      return NextResponse.json({ error: '缺少必填字段（名称、单位）' }, { status: 400 });
    }

    if (!work_item_id && !project_id) {
      return NextResponse.json({ error: '需要提供work_item_id或project_id' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const insertData: any = {
      subitem_name: name,
      unit,
      budget_quantity: budget_quantity ? budget_quantity.toString() : '0',
      completed_quantity: (completed_quantity || 0).toString(),
      unit_price: unit_price ? unit_price.toString() : null,
      contract_price: contract_price ? contract_price.toString() : null,
      limit_price: limit_price ? limit_price.toString() : null,
      remark: remark || null,
    };

    if (work_item_id) {
      insertData.work_item_id = parseInt(work_item_id);
    } else if (project_id) {
      insertData.project_id = parseInt(project_id);
    }

    const { data, error } = await client
      .from('work_item_subitems')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`创建分项工程失败: ${error.message}`);
    }

    return NextResponse.json({ subitem: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      id, 
      subitem_name, 
      item_name,
      unit, 
      budget_quantity, 
      completed_quantity, 
      unit_price,
      contract_price,
      limit_price,
      remark 
    } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少子项ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const name = subitem_name || item_name;
    const updateData: any = {};
    if (name !== undefined) updateData.subitem_name = name;
    if (unit !== undefined) updateData.unit = unit;
    if (budget_quantity !== undefined) updateData.budget_quantity = budget_quantity.toString();
    if (completed_quantity !== undefined) updateData.completed_quantity = completed_quantity.toString();
    if (unit_price !== undefined) updateData.unit_price = unit_price ? unit_price.toString() : null;
    if (contract_price !== undefined) updateData.contract_price = contract_price ? contract_price.toString() : null;
    if (limit_price !== undefined) updateData.limit_price = limit_price ? limit_price.toString() : null;
    if (remark !== undefined) updateData.remark = remark || null;

    const { data, error } = await client
      .from('work_item_subitems')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`更新分项工程失败: ${error.message}`);
    }

    return NextResponse.json({ subitem: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: '请提供要删除的子项ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的子项ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { error } = await client
      .from('work_item_subitems')
      .delete()
      .in('id', idArray);

    if (error) {
      throw new Error(`删除清单子项失败: ${error.message}`);
    }

    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
