import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 结算签证
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

    // 只有审核通过状态的签证可以结算
    if (visa.status !== '审核通过') {
      return NextResponse.json({ error: '当前状态不允许结算' }, { status: 400 });
    }

    const { data, error } = await client
      .from('visas')
      .update({
        status: '已结算',
        updated_at: new Date().toISOString(),
      })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`结算签证失败: ${error.message}`);
    }

    return NextResponse.json({ success: true, visa: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '结算失败' },
      { status: 500 }
    );
  }
}
