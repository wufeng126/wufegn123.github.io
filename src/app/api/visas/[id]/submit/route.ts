import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getUserById, getUserDisplayName, notifyVisaWorkflow } from '@/lib/visa-workflow';

// 提交签证
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
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

    // 只有草稿、已驳回或旧待办理状态的签证可以提交
    if (!['草稿', '已驳回', '待办理'].includes(visa.status)) {
      return NextResponse.json({ error: '当前状态不允许提交' }, { status: 400 });
    }

    const managerUserId = Number(body.project_manager_user_id || visa.project_manager_user_id || 0);
    if (!managerUserId) {
      return NextResponse.json({ error: '提交签证时必须选择项目经理负责人' }, { status: 400 });
    }

    const manager = await getUserById(client, managerUserId);
    if (!manager) {
      return NextResponse.json({ error: '选择的项目经理不存在' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const managerName = getUserDisplayName(manager);
    const budgetName = getUserDisplayName(auth.user);

    // 更新为已提交状态
    const { data, error } = await client
      .from('visas')
      .update({
        status: '已提交',
        budget_user_id: visa.budget_user_id || auth.user.id,
        budget_user_name: visa.budget_user_name || budgetName || null,
        project_manager_user_id: managerUserId,
        project_manager_name: managerName || null,
        current_responsible_user_id: managerUserId,
        current_responsible_name: managerName || null,
        submitted_at: now,
        workflow_step_updated_at: now,
        updated_at: now,
      })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`提交签证失败: ${error.message}`);
    }

    await notifyVisaWorkflow({
      type: 'visa_workflow',
      title: '签证待办理',
      content: `${budgetName || '预算员'}提交了签证 ${visa.visa_number}，请推进甲方工程部签字。`,
      projectId: visa.project_id,
      visaId: Number(id),
      recipientUserId: managerUserId,
      metadata: {
        visaNumber: visa.visa_number,
        visaName: visa.visa_name,
        visaAmount: visa.visa_amount,
        status: '已提交',
        targetNames: [managerName],
        businessSummary: `签证 ${visa.visa_number}${visa.visa_name ? `（${visa.visa_name}）` : ''}已提交给${managerName || '项目经理'}办理甲方工程部签字${visa.visa_amount ? `，金额 ¥${Number(visa.visa_amount).toLocaleString()}` : ''}`,
      },
    });

    return NextResponse.json({ success: true, visa: data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '提交失败' },
      { status: 500 }
    );
  }
}
