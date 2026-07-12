import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // 获取价格参考库
    const { data: prices } = await supabase
      .from('unit_prices')
      .select('*, projects(name)')
      .order('created_at', { ascending: false });

    // 获取标准工序清单
    const { data: standards } = await supabase
      .from('work_type_standards')
      .select('*')
      .order('sort_order');

    // 创建工作簿
    const wb = XLSX.utils.book_new();

    // Sheet 1: 价格参考库
    const priceRows = (prices || []).map((p: any) => ({
      '工序名称': p.work_type || '',
      '单位': p.unit || '',
      '最低价': p.min_price || 0,
      '中位价': p.median_price || 0,
      '最高价': p.max_price || 0,
      '来源项目': p.projects?.name || '',
      '备注': p.remark || '',
    }));
    const ws1 = XLSX.utils.json_to_sheet(priceRows);
    XLSX.utils.book_append_sheet(wb, ws1, '价格参考库');

    // Sheet 2: 标准工序
    const stdRows = (standards || []).map((s: any) => ({
      '分类': s.category || '',
      '工序名称': s.name || '',
      '单位': s.unit || '',
      '排序': s.sort_order || 0,
    }));
    const ws2 = XLSX.utils.json_to_sheet(stdRows);
    XLSX.utils.book_append_sheet(wb, ws2, '标准工序清单');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="成本测算_价格参考库_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
