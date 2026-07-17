import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getUserDisplayName, notifyVisaWorkflow } from '@/lib/visa-workflow';

// 结算签证
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const client = getSupabaseClient();

    // 获取当前签证信息
    const { data: visa, error: visaError } = await client
      .from('visas')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (visaError || !visa) {
      return NextResponse.json({ error: '签证不存在' }, { status: 404 });
    }

    // 新流程：待预算员确认后完成；兼容旧流程的审核通过/已结算前置状态
    if (!['待预算员确认', '审核通过', '已结算'].includes(visa.status)) {
      return NextResponse.json({ error: '当前状态不允许确认完成' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const actorName = getUserDisplayName(auth.user);
    const { data, error } = await client
      .from('visas')
      .update({
        status: '已完成',
        completed_at: now,
        workflow_step_updated_at: now,
        workflow_comment: '预算员确认已计入结算',
        current_responsible_user_id: null,
        current_responsible_name: null,
        reviewer_id: auth.user.id,
        reviewer_name: actorName || null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`结算签证失败: ${error.message}`);
    }

    if (visa.project_manager_user_id) {
      await notifyVisaWorkflow({
        type: 'visa_workflow',
        title: '签证已完成',
        content: `签证 ${visa.visa_number} 已由预算员确认计入结算，流程完成。`,
        projectId: visa.project_id,
        visaId: Number(id),
        recipientUserId: visa.project_manager_user_id,
        metadata: {
          visaNumber: visa.visa_number,
          visaName: visa.visa_name,
          visaAmount: visa.visa_amount,
          status: '已完成',
          targetNames: [visa.project_manager_name],
          businessSummary: `签证 ${visa.visa_number}${visa.visa_name ? `（${visa.visa_name}）` : ''}已由预算员确认计入结算，流程完成${visa.visa_amount ? `，金额 ¥${Number(visa.visa_amount).toLocaleString()}` : ''}`,
        },
      });
    }

    return NextResponse.json({ success: true, visa: data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '结算失败' },
      { status: 500 }
    );
  }
}
