import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix } from '@/lib/audit-log';

// GET: 获取月度对上报量记录
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subitemId = searchParams.get('subitem_id');
    const projectId = searchParams.get('project_id');
    const yearMonth = searchParams.get('year_month');

    const client = getSupabaseClient();

    let query = client
      .from('subitem_monthly_reports')
      .select(`
        *,
        subitem:work_item_subitems(id, subitem_name, unit, budget_quantity, contract_price)
      `)
      .order('year_month', { ascending: false });

    if (subitemId) {
      query = query.eq('subitem_id', parseInt(subitemId));
    }

    if (yearMonth) {
      query = query.eq('year_month', yearMonth);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询月度对上报量失败: ${error.message}`);
    }

    // 如果指定了项目，需要过滤
    let result = data || [];
    if (projectId && !subitemId) {
      const projectIdNum = parseInt(projectId);
      result = result.filter((item: any) => item.subitem?.project_id === projectIdNum || item.subitem?.projectId === projectIdNum);
    }

    return NextResponse.json({ records: result });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

// POST: 创建或更新月度对上报量记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subitem_id, year_month, report_quantity, remark } = body;

    if (!subitem_id || !year_month || report_quantity === undefined) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否已存在该月份的记录
    const { data: existing } = await client
      .from('subitem_monthly_reports')
      .select('*')
      .eq('subitem_id', subitem_id)
      .eq('year_month', year_month)
      .single();

    let result;
    if (existing) {
      // 更新现有记录
      const { data, error } = await client
        .from('subitem_monthly_reports')
        .update({
          report_quantity: report_quantity.toString(),
          remark: remark || null,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // 创建新记录
      const { data: rptData, error: rptError } = await insertWithSequenceFix('subitem_monthly_reports', {
          subitem_id,
          year_month,
          report_quantity: report_quantity.toString(),
          remark: remark || null,
        }, client);
      if (rptError) throw rptError;
      result = Array.isArray(rptData) ? rptData[0] : rptData;
    }

    // 更新累计对上报量到 completed_quantity 字段
    const { data: allReports } = await client
      .from('subitem_monthly_reports')
      .select('report_quantity')
      .eq('subitem_id', subitem_id);

    const totalReport = allReports?.reduce((sum: number, r: any) => {
      return sum + parseFloat(r.report_quantity || '0');
    }, 0) || 0;

    await client
      .from('work_item_subitems')
      .update({ completed_quantity: totalReport.toString() })
      .eq('id', subitem_id);

    return NextResponse.json({ record: result });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '操作失败' },
      { status: 500 }
    );
  }
}

// PUT: 批量更新月度对上报量
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { records } = body; // Array of { subitem_id, year_month, report_quantity }

    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ error: '无效的数据格式' }, { status: 400 });
    }

    const client = getSupabaseClient();
    let successCount = 0;

    for (const record of records) {
      const { subitem_id, year_month, report_quantity } = record;
      if (!subitem_id || !year_month || report_quantity === undefined) continue;

      // 检查是否已存在
      const { data: existing } = await client
        .from('subitem_monthly_reports')
        .select('*')
        .eq('subitem_id', subitem_id)
        .eq('year_month', year_month)
        .single();

      if (existing) {
        const { error } = await client
          .from('subitem_monthly_reports')
          .update({ report_quantity: report_quantity.toString() })
          .eq('id', existing.id);
        if (!error) successCount++;
      } else {
        const { error: insErr } = await insertWithSequenceFix('subitem_monthly_reports', {
            subitem_id,
            year_month,
            report_quantity: report_quantity.toString(),
          }, client);
        if (!insErr) successCount++;
      }
    }

    // 更新所有涉及的子项的累计对上报量
    const subitemIds = [...new Set(records.map((r: any) => r.subitem_id))];
    for (const subitem_id of subitemIds) {
      const { data: allReports } = await client
        .from('subitem_monthly_reports')
        .select('report_quantity')
        .eq('subitem_id', subitem_id);

      const totalReport = allReports?.reduce((sum: number, r: any) => {
        return sum + parseFloat(r.report_quantity || '0');
      }, 0) || 0;

      await client
        .from('work_item_subitems')
        .update({ completed_quantity: totalReport.toString() })
        .eq('id', subitem_id);
    }

    return NextResponse.json({ success: true, count: successCount });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '操作失败' },
      { status: 500 }
    );
  }
}

// DELETE: 删除月度对上报量记录
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '请提供记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 先获取要删除的记录，以便后续更新累计值
    const { data: record } = await client
      .from('subitem_monthly_reports')
      .select('subitem_id')
      .eq('id', parseInt(id))
      .single();

    const { error } = await client
      .from('subitem_monthly_reports')
      .delete()
      .eq('id', parseInt(id));

    if (error) throw error;

    // 更新累计对上报量
    if (record) {
      const { data: allReports } = await client
        .from('subitem_monthly_reports')
        .select('report_quantity')
        .eq('subitem_id', record.subitem_id);

      const totalReport = allReports?.reduce((sum: number, r: any) => {
        return sum + parseFloat(r.report_quantity || '0');
      }, 0) || 0;

      await client
        .from('work_item_subitems')
        .update({ completed_quantity: totalReport.toString() })
        .eq('id', record.subitem_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
