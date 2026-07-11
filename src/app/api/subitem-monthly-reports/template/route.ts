import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';


// GET: Download import template (xlsx format, pre-filled with subitem names)
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    }

    // Fetch subitems for the project from work_item_subitems table
    const { data: subitems, error } = await supabase
      .from('work_item_subitems')
      .select('id, subitem_name, unit')
      .eq('project_id', projectId)
      .order('id');

    if (error) {
      return NextResponse.json({ error: '查询分项工程失败' }, { status: 500 });
    }

    // Build Excel data
    const headerRow = ['分项工程名称*', '单位', '上报量*'];
    const dataRows = (subitems || []).map(s => [s.subitem_name, s.unit, '']);

    const wsData = [headerRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 12 }];

    // Add instructions in a second sheet
    const noteData = [
      ['填写说明'],
      ['1. 分项工程名称：必须与系统中已有的分项工程名称完全一致，否则无法匹配'],
      ['2. 单位：自动填充，无需修改'],
      ['3. 上报量：填写当月对上报量数值，必须大于0'],
      ['4. 带星号(*)的列为必填项'],
      ['5. 请勿修改分项工程名称和单位列的内容'],
      ['6. 不需要上报的分项工程，上报量留空即可'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(noteData);
    ws2['!cols'] = [{ wch: 80 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '月度对上报量');
    XLSX.utils.book_append_sheet(wb, ws2, '填写说明');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('月度对上报量导入模板.xlsx')}`,
      },
    });
  } catch (err) {
    console.error('Template generation error:', err);
    return NextResponse.json({ error: '生成模板失败' }, { status: 500 });
  }
}
