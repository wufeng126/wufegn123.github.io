import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { isReviewedStatus, isVoidedStatus, REVIEW_STATUS, validateStatusTransition } from '@/lib/business-logic';

// 费用类型
const EXPENSE_TYPES = ['招待费', '差旅费', '房租水电', '现金帮工', '办公用品', '其他杂费'];

// 获取单条综合费用
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

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

    return NextResponse.json({ expense: { ...data, status: data.status || REVIEW_STATUS.DRAFT } });
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

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
      status,
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
    const expenseId = parseInt(id);

    const { data: currentExpense, error: currentError } = await client
      .from('comprehensive_expenses')
      .select('id, status, amount')
      .eq('id', expenseId)
      .single();

    if (currentError || !currentExpense) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    if (isVoidedStatus(currentExpense.status)) {
      return NextResponse.json({ error: '已作废记录不可修改' }, { status: 400 });
    }

    if (isReviewedStatus(currentExpense.status) && amount !== undefined && status !== REVIEW_STATUS.DRAFT) {
      return NextResponse.json({ error: '已审核记录不可修改金额，请先反审核' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (project_id !== undefined) updateData.project_id = project_id || null;
    if (expense_type) updateData.expense_type = expense_type;
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (expense_date) updateData.expense_date = expense_date;
    if (handler !== undefined) updateData.handler = handler || null;
    if (remark !== undefined) updateData.remark = remark || null;
    if (attachments !== undefined) updateData.attachments = attachments || null;
    if (status !== undefined) {
      const validation = validateStatusTransition(currentExpense.status || REVIEW_STATUS.DRAFT, status);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message || '状态流转不合法' }, { status: 400 });
      }
      updateData.status = status;
      if (status === REVIEW_STATUS.REVIEWED) {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = auth.user.name || auth.user.username || 'system';
      } else if (status === REVIEW_STATUS.DRAFT) {
        updateData.reviewed_at = null;
        updateData.reviewed_by = null;
      }
    }

    const { data, error } = await client
      .from('comprehensive_expenses')
      .update(updateData)
      .eq('id', expenseId)
      .select('*, projects(name)')
      .single();

    if (error) {
      throw new Error(`更新综合费用失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'comprehensive_expense',
      resourceId: expenseId,
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const expenseId = parseInt(id);
    const client = getSupabaseClient();

    // 先获取记录信息用于审计日志
    const { data: existingData } = await client
      .from('comprehensive_expenses')
      .select('id, expense_type, amount, project_id, status')
      .eq('id', expenseId)
      .single();

    if (isReviewedStatus(existingData?.status) || isVoidedStatus(existingData?.status)) {
      return NextResponse.json({ error: '已审核或已作废记录不可删除' }, { status: 400 });
    }

    const { error } = await client
      .from('comprehensive_expenses')
      .delete()
      .eq('id', expenseId);

    if (error) {
      throw new Error(`删除综合费用失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'comprehensive_expense',
      resourceId: expenseId,
      details: existingData || { id: expenseId },
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
