import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getUserDisplayName, notifyVisaWorkflow } from '@/lib/visa-workflow';

// 审核签证（通过或驳回）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const { action, review_comment, reject_reason } = body;

    // 获取当前签证信息
    const { data: visa, error: visaError } = await client
      .from('visas')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (visaError || !visa) {
      return NextResponse.json({ error: '签证不存在' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const actorName = getUserDisplayName(auth.user);
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (action === 'signed' || action === 'approve') {
      if (visa.status !== '已提交') {
        return NextResponse.json({ error: '当前状态不允许确认签字' }, { status: 400 });
      }

      updateData.status = '已签字';
      updateData.review_comment = review_comment || null;
      updateData.reviewer_id = auth.user.id;
      updateData.reviewer_name = actorName || null;
      updateData.reviewed_at = now;
      updateData.signed_at = now;
      updateData.workflow_step_updated_at = now;
      updateData.workflow_comment = review_comment || null;
      updateData.current_responsible_user_id = visa.project_manager_user_id || visa.current_responsible_user_id || auth.user.id;
      updateData.current_responsible_name = visa.project_manager_name || visa.current_responsible_name || actorName || null;
    } else if (action === 'business_confirmed') {
      if (visa.status !== '已签字') {
        return NextResponse.json({ error: '当前状态不允许提交预算员确认' }, { status: 400 });
      }

      updateData.status = '待预算员确认';
      updateData.review_comment = review_comment || visa.review_comment || null;
      updateData.reviewer_id = auth.user.id;
      updateData.reviewer_name = actorName || null;
      updateData.reviewed_at = now;
      updateData.business_confirmed_at = now;
      updateData.workflow_step_updated_at = now;
      updateData.workflow_comment = review_comment || null;
      updateData.current_responsible_user_id = visa.budget_user_id || null;
      updateData.current_responsible_name = visa.budget_user_name || null;
    } else if (action === 'reject') {
      if (!['已提交', '已签字', '待预算员确认'].includes(visa.status)) {
        return NextResponse.json({ error: '当前状态不允许驳回' }, { status: 400 });
      }
      // 驳回
      if (!reject_reason || !reject_reason.trim()) {
        return NextResponse.json({ error: '驳回原因不能为空' }, { status: 400 });
      }
      updateData.status = '已驳回';
      updateData.reject_reason = reject_reason;
      updateData.reviewer_id = auth.user.id;
      updateData.reviewer_name = actorName || null;
      updateData.reviewed_at = now;
      updateData.workflow_step_updated_at = now;
      updateData.workflow_comment = reject_reason;
      updateData.current_responsible_user_id = visa.budget_user_id || visa.current_responsible_user_id || null;
      updateData.current_responsible_name = visa.budget_user_name || visa.current_responsible_name || null;
    } else {
      return NextResponse.json({ error: '无效的流转操作' }, { status: 400 });
    }

    const { data, error } = await client
      .from('visas')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`审核签证失败: ${error.message}`);
    }

    if (action === 'business_confirmed' && visa.budget_user_id) {
      await notifyVisaWorkflow({
        type: 'visa_workflow',
        title: '签证待预算员确认',
        content: `签证 ${visa.visa_number} 已完成甲方商务确认，请确认是否已计入结算。`,
        projectId: visa.project_id,
        visaId: Number(id),
        recipientUserId: visa.budget_user_id,
        metadata: {
          visaNumber: visa.visa_number,
          visaName: visa.visa_name,
          visaAmount: visa.visa_amount,
          status: '待预算员确认',
          targetNames: [visa.budget_user_name],
          businessSummary: `签证 ${visa.visa_number}${visa.visa_name ? `（${visa.visa_name}）` : ''}已完成甲方商务确认，待预算员确认计入结算${visa.visa_amount ? `，金额 ¥${Number(visa.visa_amount).toLocaleString()}` : ''}`,
        },
      });
    }

    return NextResponse.json({ success: true, visa: data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '审核失败' },
      { status: 500 }
    );
  }
}
