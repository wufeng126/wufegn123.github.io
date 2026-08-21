import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { REVIEW_STATUS, validateStatusTransition } from '@/lib/business-logic';
import { requireApiWritePermission } from '@/lib/api-auth';
import type { RequestAuthUser } from '@/lib/auth';

type ReviewUpdateData = {
  status: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

type SupplierPaymentRow = {
  id: number;
  payment_amount: number | string | null;
};

type SupplierSettlementReviewRow = {
  settlement_type?: string | null;
  contract_id?: number | null;
  settlement_no?: string | null;
  settlement_amount?: number | string | null;
  payable_amount?: number | string | null;
};

function parsePositiveId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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
    const resourceId = parsePositiveId(resource_id);

    if (!resource_type || !resourceId || !action) {
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
      .select('*')
      .eq('id', resourceId)
      .single();

    if (fetchError || !record) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    // 校验状态流转
    const currentStatusForValidation = resource_type === 'client_payment' && record.status === 'completed'
      ? REVIEW_STATUS.REVIEWED
      : record.status || REVIEW_STATUS.DRAFT;
    const validation = validateStatusTransition(currentStatusForValidation, targetStatus);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    // 作废前检查：如果有关联的下级记录（如已付款），不允许作废
    if (action === 'void') {
      const voidCheck = await checkVoidConstraints(client, resource_type, resourceId);
      if (!voidCheck.canVoid) {
        return NextResponse.json({ error: voidCheck.message }, { status: 400 });
      }
    }

    // 构建更新数据
    const updateData: ReviewUpdateData = { status: targetStatus };

    // 审核时记录审核人和时间
    if (action === 'review') {
      updateData.reviewed_at = new Date().toISOString();
      updateData.reviewed_by = auth.user.name || auth.user.username || 'system';
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
      .eq('id', resourceId)
      .select()
      .single();

    if (error) {
      throw new Error(`操作失败: ${error.message}`);
    }

    if (resource_type === 'supplier_settlement') {
      await syncSupplierSettlementReviewSideEffects(client, data, targetStatus, auth.user);
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
      resourceId,
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
  } catch (error: unknown) {
    console.error('审核API错误:', error);
    const message = error instanceof Error ? error.message : '操作失败';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * 检查作废约束：如果已有下级关联记录（付款等），不允许作废
 */
async function checkVoidConstraints(
  client: SupabaseClient,
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
      
      const paymentRows = (payments || []) as SupplierPaymentRow[];
      if (paymentRows.length > 0) {
        const totalPaid = paymentRows.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
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

async function syncSupplierSettlementReviewSideEffects(
  client: SupabaseClient,
  settlement: SupplierSettlementReviewRow | null,
  targetStatus: string,
  user: RequestAuthUser
) {
  if (!settlement || settlement.settlement_type !== 'final' || !settlement.contract_id) {
    return;
  }

  const shouldLock = targetStatus === REVIEW_STATUS.REVIEWED;

  await client
    .from('supplier_contracts')
    .update({
      contract_status: shouldLock ? '\u5df2\u5b8c\u7ed3' : '\u5c65\u7ea6\u4e2d',
      locked: shouldLock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settlement.contract_id);

  if (shouldLock) {
    await client.from('supplier_contract_logs').insert({
      contract_id: settlement.contract_id,
      action: '\u603b\u7ec8\u7ed3\u7b97\u5ba1\u6838\u901a\u8fc7',
      operator_id: user.id,
      operator_name: user.name || user.username,
      detail: {
        settlement_no: settlement.settlement_no,
        settlement_amount: settlement.settlement_amount,
        payable_amount: settlement.payable_amount,
      },
    });
  }
}
