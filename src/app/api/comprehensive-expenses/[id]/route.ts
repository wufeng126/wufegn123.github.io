import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';

// 费用类型
const EXPENSE_TYPES = ['招待费', '差旅费', '房租水电', '现金帮工', '办公用品', '其他杂费'];

// 获取单条综合费用
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('comprehensive_expenses')
      .select('*, projects(name)')
      .eq('id', parseInt(id))
      .single();

    if (error) {
      throw new Error(`查询综合费用失败: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    return NextResponse.json({ expense: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

// 更新综合费用
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      project_id,
      expense_type,
      amount,
      expense_date,
      handler,
      remark,
      attachments,
    } = body;

    // 验证费用类型
    if (expense_type && !EXPENSE_TYPES.includes(expense_type)) {
      return NextResponse.json(
        { error: '无效的费用类型' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    
    // 构建更新数据
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (project_id !== undefined) updateData.project_id = project_id || null;
    if (expense_type) updateData.expense_type = expense_type;
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (expense_date) updateData.expense_date = expense_date;
    if (handler !== undefined) updateData.handler = handler || null;
    if (remark !== undefined) updateData.remark = remark || null;
    if (attachments !== undefined) updateData.attachments = attachments || null;

    const { data, error } = await client
      .from('comprehensive_expenses')
      .update(updateData)
      .eq('id', parseInt(id))
      .select('*, projects(name)')
      .single();

    if (error) {
      throw new Error(`更新综合费用失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'comprehensive_expense',
      resourceId: parseInt(id),
      details: updateData,
      request,
    });

    return NextResponse.json({ expense: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

// 删除综合费用
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 先获取记录信息用于审计日志
    const { data: existingData } = await client
      .from('comprehensive_expenses')
      .select('id, expense_type, amount, project_id')
      .eq('id', parseInt(id))
      .single();

    const { error } = await client
      .from('comprehensive_expenses')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除综合费用失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'comprehensive_expense',
      resourceId: parseInt(id),
      details: existingData || { id: parseInt(id) },
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
