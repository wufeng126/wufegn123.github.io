import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
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
    const dataRows = (subitems || []).map(s => [s.subitem_name, s.unit, 0]);

    const wsData = [headerRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 12 }];

    // Add data validation note in a second sheet
    const noteData = [
      ['填写说明'],
      ['1. 分项工程名称：必须与系统中已有的分项工程名称完全一致，否则无法匹配'],
      ['2. 单位：自动填充，无需修改'],
      ['3. 上报量：填写当月对上报量数值，必须大于0'],
      ['4. 带星号(*)的列为必填项'],
      ['5. 请勿修改分项工程名称和单位列的内容'],
      ['6. 不需要上报的分项工程，上报量填0或留空即可'],
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

// POST: Import monthly report data from Excel/CSV file
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const contentType = request.headers.get('content-type') || '';

    let file: File | null = null;
    let projectId = '';
    let yearMonth: string | null = '';
    let reportType = '对上报量';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      file = formData.get('file') as File;
      projectId = (formData.get('project_id') as string) || '';
      yearMonth = (formData.get('year_month') as string) || '';
      reportType = (formData.get('report_type') as string) || '对上报量';
    } else {
      return NextResponse.json({ error: '请使用文件上传方式导入' }, { status: 400 });
    }

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    }
    if (!yearMonth) {
      return NextResponse.json({ error: '请选择年月' }, { status: 400 });
    }

    // Normalize year_month format
    yearMonth = normalizeYearMonth(yearMonth);
    if (!yearMonth) {
      return NextResponse.json({ error: '年月格式不正确，请使用 YYYY-MM 格式' }, { status: 400 });
    }

    // Parse file
    const fileName = file.name.toLowerCase();
    let rows: (string | number)[][];

    if (fileName.endsWith('.csv')) {
      // Parse CSV
      const buffer = Buffer.from(await file.arrayBuffer());
      let text = new TextDecoder('utf-8').decode(buffer);
      // Skip BOM
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      rows = text.split(/\r?\n/).filter(line => line.trim()).map(line => {
        const cols: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuotes = !inQuotes; }
          else if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
          else { current += ch; }
        }
        cols.push(current.trim());
        return cols;
      });
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // Parse Excel
      const buffer = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    } else {
      return NextResponse.json({ error: '请上传 Excel 文件（.xlsx, .xls）或 CSV 文件' }, { status: 400 });
    }

    if (rows.length < 2) {
      return NextResponse.json({ error: '文件中没有数据行' }, { status: 400 });
    }

    // Find column indices
    // 清洗字符串：去除隐藏字符
    const sanitize = (s: string): string => {
      if (!s) return '';
      return String(s).replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2028\u2029\u202F\u205F\u3000]/g, '').trim();
    };

    // 自动检测表头行
    const nameKw = ['分项工程名称', '分项名称', '子项名称', '工程名称', '名称'];
    let headerRowIndex = 0;
    const headers = rows[0].map(h => sanitize(String(h || '')));
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const sanitized = rows[r].map(h => sanitize(String(h || '')));
      if (sanitized.some((h: string) => nameKw.some(k => h.includes(k) || k.includes(h)))) {
        headerRowIndex = r;
        headers.length = 0;
        headers.push(...sanitized);
        break;
      }
    }

    const stripToChinese = (s: string): string => s.replace(/[^\u4e00-\u9fff]/g, '');
    const nameIdx = findIndex(headers, ['分项工程名称', '分项名称', '子项名称', '子项工程名称', '工程名称', '名称'], stripToChinese);
    const qtyIdx = findIndex(headers, ['上报量', '对上报量', '报量', '完成量', '数量', '工程量'], stripToChinese);

    if (nameIdx === -1) {
      return NextResponse.json({
        error: `缺少必要列: 分项工程名称。当前表头: ${headers.join('、')}`,
      }, { status: 400 });
    }
    if (qtyIdx === -1) {
      return NextResponse.json({
        error: `缺少必要列: 上报量。当前表头: ${headers.join('、')}`,
      }, { status: 400 });
    }

    // Fetch subitems for the project
    const { data: subitems, error: subitemError } = await supabase
      .from('work_item_subitems')
      .select('id, subitem_name')
      .eq('project_id', projectId);

    if (subitemError) {
      return NextResponse.json({ error: '查询分项工程失败' }, { status: 500 });
    }

    // Build name-to-id map
    const nameToId = new Map<string, number>();
    for (const s of subitems || []) {
      nameToId.set(s.subitem_name.trim(), s.id);
    }

    // Process data rows
    const results: { subitem_id: number; subitem_name: string; quantity: number }[] = [];
    const warnings: string[] = [];
    const notFoundItems: { row: number; name: string }[] = [];
    let skippedZero = 0;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const name = String(row[nameIdx] || '').trim();
      const qtyStr = String(row[qtyIdx] || '0').trim();
      const quantity = parseFloat(qtyStr);

      if (!name) continue; // skip empty rows

      if (isNaN(quantity) || quantity <= 0) {
        skippedZero++;
        continue; // skip rows with zero or invalid quantity
      }

      const subitemId = nameToId.get(name);
      if (!subitemId) {
        warnings.push(`第${i + 1}行：未找到分项工程"${name}"`);
        notFoundItems.push({ row: i + 1, name });
        continue;
      }

      results.push({ subitem_id: subitemId, subitem_name: name, quantity });
    }

    if (results.length === 0) {
      const msg = warnings.length > 0
        ? `没有可导入的数据。${warnings.join('；')}`
        : '文件中没有有效的上报量数据（上报量需大于0）';
      return NextResponse.json({ error: msg, warnings, notFoundItems }, { status: 400 });
    }

    // Check existing records for the same year_month and subitems in this project
    const subitemIds = (subitems || []).map(s => s.id);
    const { data: existing, error: existingError } = await supabase
      .from('subitem_monthly_reports')
      .select('id, subitem_id, report_quantity')
      .eq('year_month', yearMonth)
      .in('subitem_id', subitemIds);

    if (existingError) {
      console.error('Query existing records error:', existingError);
    }

    // Build existing map
    const existingMap = new Map<number, { id: number; quantity: number }>();
    for (const e of existing || []) {
      existingMap.set(e.subitem_id, { id: e.id, quantity: parseFloat(String(e.report_quantity)) });
    }

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const r of results) {
      const existingRecord = existingMap.get(r.subitem_id);

      if (existingRecord) {
        // Update existing record (add to current quantity)
        const newQty = existingRecord.quantity + r.quantity;
        const { error: updateError } = await supabase
          .from('subitem_monthly_reports')
          .update({ report_quantity: newQty })
          .eq('id', existingRecord.id);

        if (updateError) {
          errors.push(`更新"${r.subitem_name}"失败: ${updateError.message}`);
        } else {
          updated++;
        }
      } else {
        // Insert new record
        const { error: insertError } = await insertWithSequenceFix(
          'subitem_monthly_reports',
          {
            subitem_id: r.subitem_id,
            year_month: yearMonth,
            report_quantity: r.quantity,
            remark: null,
          },
          supabase
        );

        if (insertError) {
          errors.push(`插入"${r.subitem_name}"失败: ${insertError.message}`);
        } else {
          inserted++;
        }
      }
    }

    const successCount = inserted + updated;
    const message = `成功导入 ${successCount} 条记录（新增 ${inserted} 条，更新 ${updated} 条）${skippedZero > 0 ? `，跳过 ${skippedZero} 条零值记录` : ''}`;

    return NextResponse.json({
      success: true,
      count: successCount,
      inserted,
      updated,
      skippedZero,
      message,
      warnings: warnings.length > 0 ? warnings : undefined,
      notFoundItems: notFoundItems.length > 0 ? notFoundItems : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (err) {
    console.error('Import error:', err);
    return NextResponse.json({ error: `导入失败: ${err instanceof Error ? err.message : '未知错误'}` }, { status: 500 });
  }
}

// Find column index by keywords (supports bidirectional matching + Chinese fallback)
function findIndex(headers: string[], keywords: string[], stripToChinese?: (s: string) => string): number {
  for (const kw of keywords) {
    const idx = headers.findIndex(h => h.includes(kw) || kw.includes(h));
    if (idx !== -1) return idx;
  }
  // 兜底：纯中文匹配
  if (stripToChinese) {
    for (const kw of keywords) {
      const pureKw = stripToChinese(kw);
      const idx = headers.findIndex(h => {
        const pureH = stripToChinese(h);
        return pureH.includes(pureKw) || pureKw.includes(pureH);
      });
      if (idx !== -1) return idx;
    }
  }
  return -1;
}

// Normalize year_month to YYYY-MM format
function normalizeYearMonth(value: string): string | null {
  if (!value) return null;
  value = value.trim();

  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(value)) return value;

  // YYYY/MM or YYYY.MM
  const slashMatch = value.match(/^(\d{4})[\/\.](\d{1,2})$/);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}`;

  // YYYY-MM-DD → YYYY-MM
  const dateMatch = value.match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
  if (dateMatch) return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}`;

  // YYYY/MM/DD → YYYY-MM
  const slashDateMatch = value.match(/^(\d{4})\/(\d{1,2})\/\d{1,2}$/);
  if (slashDateMatch) return `${slashDateMatch[1]}-${slashDateMatch[2].padStart(2, '0')}`;

  // Chinese format: 2026年5月
  const cnMatch = value.match(/^(\d{4})年(\d{1,2})月?$/);
  if (cnMatch) return `${cnMatch[1]}-${cnMatch[2].padStart(2, '0')}`;

  // Excel date number
  const numVal = parseFloat(value);
  if (!isNaN(numVal) && numVal > 30000 && numVal < 100000) {
    const date = new Date((numVal - 25569) * 86400 * 1000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    if (y > 2000 && y < 2100) return `${y}-${m}`;
  }

  return null;
}
