import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { validateStatusTransition } from '@/lib/business-logic';
import { requireApiWritePermission } from '@/lib/api-auth';

/**
 * 统一审核/反审核/作废 API
 * POST /api/review
 * Body: { resource_type, resource_id, action }
 * - action: 'review' | 'unreview' | 'void'
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { resource_type, resource_id, action } = body;

    if (!resource_type || !resource_id || !action) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 资源类型到表名的映射
    const resourceMap: Record<string, { table: string; name: string }> = {
      client_report: { table: 'client_reports', name: '甲方报量' },
      client_payment: { table: 'client_payments', name: '甲方回款' },
      supplier_settlement: { table: 'supplier_settlements', name: '供应商结算' },
      supplier_payment: { table: 'supplier_payments', name: '供应商付款' },
      comprehensive_expense: { table: 'comprehensive_expenses', name: '综合费用' },
      miscellaneous_material: { table: 'miscellaneous_materials', name: '零星材料' },
    };

    const resource = resourceMap[resource_type];
    if (!resource) {
      return NextResponse.json({ error: '不支持的资源类型' }, { status: 400 });
    }

    // 状态映射
    const statusMap: Record<string, string> = {
      review: 'reviewed',
      unreview: 'draft',
      void: 'voided',
    };

    const targetStatus = statusMap[action];
    if (!targetStatus) {
      return NextResponse.json({ error: '不支持的操作类型' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询当前记录
    const { data: record, error: fetchError } = await client
      .from(resource.table)
      .select('id, status')
      .eq('id', parseInt(resource_id))
      .single();

    if (fetchError || !record) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    // 校验状态流转
    const validation = validateStatusTransition(record.status || 'draft', targetStatus);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    // 作废前检查：如果有关联的下级记录（如已付款），不允许作废
    if (action === 'void') {
      const voidCheck = await checkVoidConstraints(client, resource_type, parseInt(resource_id));
      if (!voidCheck.canVoid) {
        return NextResponse.json({ error: voidCheck.message }, { status: 400 });
      }
    }

    // 构建更新数据
    const updateData: Record<string, any> = { status: targetStatus };

    // 审核时记录审核人和时间
    if (action === 'review') {
      updateData.reviewed_at = new Date().toISOString();
      updateData.reviewed_by = auth.user.username || auth.user.name || 'system';
    }

    // 反审核时清除审核信息
    if (action === 'unreview') {
      updateData.reviewed_at = null;
      updateData.reviewed_by = null;
    }

    // 执行更新
    const { data, error } = await client
      .from(resource.table)
      .update(updateData)
      .eq('id', parseInt(resource_id))
      .select()
      .single();

    if (error) {
      throw new Error(`操作失败: ${error.message}`);
    }

    // 记录审计日志
    const actionNames: Record<string, string> = {
      review: '审核',
      unreview: '反审核',
      void: '作废',
    };

    await auditLog({
      operationType: action === 'void' ? 'void' : (action === 'review' ? 'review' : 'unreview'),
      resourceType: resource_type,
      resourceId: parseInt(resource_id),
      details: {
        action: actionNames[action],
        fromStatus: record.status || 'draft',
        toStatus: targetStatus,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data,
      message: `${resource.name}${actionNames[action]}成功`,
    });
  } catch (error: any) {
    console.error('审核API错误:', error);
    return NextResponse.json(
      { error: error.message || '操作失败' },
      { status: 500 }
    );
  }
}

/**
 * 检查作废约束：如果已有下级关联记录（付款等），不允许作废
 */
async function checkVoidConstraints(
  client: any,
  resourceType: string,
  resourceId: number
): Promise<{ canVoid: boolean; message: string }> {
  switch (resourceType) {
    case 'supplier_settlement': {
      // 检查是否已有付款
      const { data: payments } = await client
        .from('supplier_payments')
        .select('id, payment_amount')
        .eq('settlement_id', resourceId);
      
      if (payments && payments.length > 0) {
        const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);
        if (totalPaid > 0) {
          return { canVoid: false, message: `该结算已有付款记录（¥${totalPaid.toLocaleString()}），请先删除付款再作废` };
        }
      }
      break;
    }
    case 'client_report': {
      // 检查项目下是否已有回款超过该报量的金额（简单检查）
      // 这里不做严格限制，因为报量和回款是多对多关系
      break;
    }
  }
  return { canVoid: true, message: '' };
}
