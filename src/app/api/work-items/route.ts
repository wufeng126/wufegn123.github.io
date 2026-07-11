import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();
    
    // 先尝试查询包含新字段的版本
    let query = client
      .from('work_items')
      .select(`
        id,
        item_name,
        unit,
        budget_quantity,
        unit_price,
        contract_price,
        limit_price,
        project_id,
        projects (
          id,
          name
        )
      `)
      .order('id', { ascending: true });

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', parseInt(projectId));
    }

    let workItemsData: any = null;
    let error: any = null;
    
    const result = await query;
    workItemsData = result.data;
    error = result.error;

    // 如果新字段不存在，回退到基本字段查询
    if (error && error.message.includes('column')) {
      const fallbackQuery = client
        .from('work_items')
        .select(`
          id,
          item_name,
          unit,
          budget_quantity,
          unit_price,
          project_id,
          projects (
            id,
            name
          )
        `)
        .order('id', { ascending: true });

      if (projectId && projectId !== 'all') {
        fallbackQuery.eq('project_id', parseInt(projectId));
      }

      const fallbackResult = await fallbackQuery;
      workItemsData = fallbackResult.data?.map((item: any) => ({
        ...item,
        contract_price: null,
        limit_price: null,
      }));
      error = fallbackResult.error;
    }

    if (error) {
      throw new Error(`查询工程量失败: ${error.message}`);
    }

    if (!workItemsData || workItemsData.length === 0) {
      return NextResponse.json({ workItems: [] });
    }

    // 查询所有工程进度
    const workItemIds = workItemsData.map((item: any) => item.id);
    const { data: progressData, error: progressError } = await client
      .from('work_item_progress')
      .select('work_item_id, completed_quantity')
      .in('work_item_id', workItemIds);

    if (progressError) {
      throw new Error(`查询工程进度失败: ${progressError.message}`);
    }

    // 查询所有子项
    const { data: subitemsData } = await client
      .from('work_item_subitems')
      .select('*')
      .in('work_item_id', workItemIds);

    // 计算每个分项工程的完成量
    const progressMap = new Map<number, string>();
    progressData?.forEach(progress => {
      const workItemId = progress.work_item_id;
      const current = progressMap.get(workItemId) || '0';
      const total = parseFloat(current) + parseFloat(progress.completed_quantity || '0');
      progressMap.set(workItemId, total.toString());
    });

    // 按分项工程分组子项
    const subitemsMap = new Map<number, any[]>();
    subitemsData?.forEach(subitem => {
      const workItemId = subitem.work_item_id;
      if (!subitemsMap.has(workItemId)) {
        subitemsMap.set(workItemId, []);
      }
      subitemsMap.get(workItemId)!.push(subitem);
    });

    // 组装数据
    const workItems = workItemsData.map((item: any) => {
      const budgetQuantity = parseFloat(item.budget_quantity || '0');
      const unitPrice = parseFloat(item.unit_price || '0');
      const completedQuantity = parseFloat(progressMap.get(item.id) || '0');
      const remainingQuantity = Math.max(0, budgetQuantity - completedQuantity);
      const progressPercent = budgetQuantity > 0 ? (completedQuantity / budgetQuantity) * 100 : 0;
      
      const budgetCost = budgetQuantity * unitPrice;
      const actualCost = completedQuantity * unitPrice;
      const costVariance = actualCost - budgetCost;

      // 计算子项汇总
      const subitems = subitemsMap.get(item.id) || [];
      const subitemBudgetTotal = subitems.reduce((sum, s) => sum + parseFloat(s.budget_quantity || '0'), 0);
      const subitemCompletedTotal = subitems.reduce((sum, s) => sum + parseFloat(s.completed_quantity || '0'), 0);

      return {
        id: item.id,
        project_id: item.project_id,
        project_name: (item.projects as any)?.name || '未知项目',
        item_name: item.item_name,
        unit: item.unit,
        budget_quantity: item.budget_quantity,
        unit_price: item.unit_price,
        contract_price: item.contract_price,
        limit_price: item.limit_price,
        completed_quantity: completedQuantity.toFixed(2),
        remaining_quantity: remainingQuantity.toFixed(2),
        progress_percent: progressPercent,
        budget_cost: budgetCost.toFixed(2),
        actual_cost: actualCost.toFixed(2),
        cost_variance: costVariance.toFixed(2),
        subitems: subitems,
        subitem_budget_total: subitemBudgetTotal.toFixed(2),
        subitem_completed_total: subitemCompletedTotal.toFixed(2),
      };
    });

    return NextResponse.json({ workItems });
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
    
    // 支持批量新增
    const items = Array.isArray(body) ? body : [body];
    
    const client = getSupabaseClient();
    
    const insertData = items.map(item => ({
      project_id: parseInt(item.project_id),
      item_name: item.item_name,
      unit: item.unit,
      budget_quantity: item.budget_quantity,
      unit_price: item.unit_price,
      contract_price: item.contract_price || null,
      limit_price: item.limit_price || null,
    }));

    let data: any;
    let error: any;
    
    try {
      const result = await insertWithSequenceFix('work_items', insertData, client);
      data = result.data;
      error = result.error;
    } catch (e: any) {
      error = e;
    }

    if (error) {
      // 如果新字段不存在，尝试不使用新字段插入
      if (error.message?.includes('column') || error.message?.includes('does not exist')) {
        const fallbackData = items.map((item: any) => ({
          project_id: parseInt(item.project_id),
          item_name: item.item_name,
          unit: item.unit,
          budget_quantity: item.budget_quantity,
          unit_price: item.unit_price,
        }));
        
        const fallbackResult = await insertWithSequenceFix('work_items', fallbackData, client);
        
        await auditLog({
          operationType: 'create',
          resourceType: 'work_item',
          resourceId: 0,
          details: { action: 'batch_create', count: items.length, fallback: true },
          request,
        });
        
        return NextResponse.json({ workItems: fallbackResult.data });
      }
      throw new Error(`创建分项工程失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'work_item',
      resourceId: 0,
      details: { action: 'batch_create', count: items.length },
      request,
    });

    return NextResponse.json({ workItems: data });
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
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: '请提供要删除的分项工程ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的分项工程ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 删除分项工程（关联的子项和进度会级联删除）
    const { error } = await client
      .from('work_items')
      .delete()
      .in('id', idArray);

    if (error) {
      throw new Error(`删除分项工程失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'work_item',
      resourceId: 0,
      details: { action: 'batch_delete', count: idArray.length, ids: idArray },
      request,
    });

    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, item_name, unit, budget_quantity, unit_price, contract_price, limit_price } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少分项工程ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const updateData: any = {};
    if (item_name !== undefined) updateData.item_name = item_name;
    if (unit !== undefined) updateData.unit = unit;
    if (budget_quantity !== undefined) updateData.budget_quantity = budget_quantity.toString();
    if (unit_price !== undefined) updateData.unit_price = unit_price.toString();
    if (contract_price !== undefined) updateData.contract_price = contract_price ? contract_price.toString() : null;
    if (limit_price !== undefined) updateData.limit_price = limit_price ? limit_price.toString() : null;

    const { data, error } = await client
      .from('work_items')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`更新分项工程失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'work_item',
      resourceId: parseInt(id),
      details: { updatedFields: Object.keys(updateData) },
      request,
    });

    return NextResponse.json({ workItem: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}
