import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 提交签证
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // 只有草稿或已驳回状态的签证可以提交
    if (!['草稿', '已驳回'].includes(visa.status)) {
      return NextResponse.json({ error: '当前状态不允许提交' }, { status: 400 });
    }

    // 更新为已提交状态
    const { data, error } = await client
      .from('visas')
      .update({
        status: '已提交',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`提交签证失败: ${error.message}`);
    }

    return NextResponse.json({ success: true, visa: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '提交失败' },
      { status: 500 }
    );
  }
}
