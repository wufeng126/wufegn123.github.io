import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 审核签证（通过或驳回）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // 只有已提交状态的签证可以审核
    if (visa.status !== '已提交') {
      return NextResponse.json({ error: '当前状态不允许审核' }, { status: 400 });
    }

    let updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      // 审核通过
      updateData.status = '审核通过';
      updateData.review_comment = review_comment || null;
      updateData.reviewer_id = null; // TODO: 从登录用户获取
      updateData.reviewer_name = null; // TODO: 从登录用户获取
      updateData.reviewed_at = new Date().toISOString();
    } else if (action === 'reject') {
      // 驳回
      if (!reject_reason || !reject_reason.trim()) {
        return NextResponse.json({ error: '驳回原因不能为空' }, { status: 400 });
      }
      updateData.status = '已驳回';
      updateData.reject_reason = reject_reason;
      updateData.reviewer_id = null; // TODO: 从登录用户获取
      updateData.reviewer_name = null; // TODO: 从登录用户获取
      updateData.reviewed_at = new Date().toISOString();
    } else {
      return NextResponse.json({ error: '无效的审核操作' }, { status: 400 });
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

    return NextResponse.json({ success: true, visa: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '审核失败' },
      { status: 500 }
    );
  }
}
