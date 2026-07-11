import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import * as XLSX from 'xlsx';

// 将各种日期格式统一为 YYYY-MM
function normalizeYearMonth(value: any): string {
  if (value === null || value === undefined || value === '') return '';

  const str = String(value).trim();

  // 已经是标准格式 YYYY-MM
  if (/^\d{4}-\d{2}$/.test(str)) return str;

  // YYYY-MM-DD 格式，截取年月
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.substring(0, 7);

  // YYYY/M/D 或 YYYY/MM/DD 格式
  const slashDateMatch = str.match(/^(\d{4})\/(\d{1,2})(?:\/\d{1,2})?$/);
  if (slashDateMatch) {
    return `${slashDateMatch[1]}-${slashDateMatch[2].padStart(2, '0')}`;
  }

  // M/D/YYYY 美式格式
  const usDateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDateMatch) {
    return `${usDateMatch[3]}-${usDateMatch[1].padStart(2, '0')}`;
  }

  // 中文格式 2026年3月
  const chineseMatch = str.match(/^(\d{4})年(\d{1,2})月?$/);
  if (chineseMatch) {
    return `${chineseMatch[1]}-${chineseMatch[2].padStart(2, '0')}`;
  }

  // Excel 英文缩写 Mar-26
  const monthMap: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  };
  const shortMatch = str.match(/^([a-zA-Z]{3})-(\d{2})$/);
  if (shortMatch) {
    const month = monthMap[shortMatch[1].toLowerCase()];
    if (month) return `20${shortMatch[2]}-${month}`;
  }
  const longMatch = str.match(/^([a-zA-Z]+)-(\d{4})$/);
  if (longMatch) {
    const month = monthMap[longMatch[1].toLowerCase().substring(0, 3)];
    if (month) return `${longMatch[2]}-${month}`;
  }

  // Excel 日期序列号（数字类型）
  const num = Number(value);
  if (!isNaN(num) && num > 10000 && num < 100000) {
    // Excel 日期序列号转日期
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + num * 86400000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  // 无法识别，原样返回
  console.warn(`[Salaries Batch] 未识别的年月格式: "${str}"`);
  return str;
}

// 解析单元格值
function getCellValue(row: any[], index: number): any {
  if (index >= row.length) return '';
  const val = row[index];
  return val !== null && val !== undefined ? val : '';
}

// GET: 下载导入模板
export async function GET() {
  try {
    const XLSXModule = await import('xlsx');
    const data = [
      ['工人姓名', '项目名称', '年月', '工时', '工价', '包活工资', '个税', '借支', '劳保', '罚款', '备注'],
      ['张三', '示例项目', '2026-01', 200, 35, 0, 0, 0, 45, 0, '1月份工资'],
    ];
    const ws = XLSXModule.utils.aoa_to_sheet(data);
    // 设置列宽
    ws['!cols'] = [
      { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 6 }, { wch: 6 },
      { wch: 8 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 12 },
    ];
    const wb = XLSXModule.utils.book_new();
    XLSXModule.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSXModule.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': "attachment; filename*=UTF-8''%E6%9C%88%E5%BA%A6%E5%B7%A5%E8%B5%84%E5%AF%BC%E5%85%A5%E6%A8%A1%E6%9D%BF.xlsx",
      },
    });
  } catch (error: any) {
    console.error('[Salaries Batch] Template download error:', error);
    return NextResponse.json({ error: '生成模板失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const client = getSupabaseClient();

    // ========== 获取所有工人和项目（用于姓名匹配） ==========
    const { data: workersData } = await client.from('workers').select('id, name, project_id');
    const { data: projectsData } = await client.from('projects').select('id, name');
    const workersList = workersData || [];
    const projectsList = projectsData || [];

    let recordsToInsert: any[] = [];
    let errors: string[] = [];
    let warnings: string[] = [];
    let notInRoster: { row: number; name: string }[] = [];
    let notFoundProjects: string[] = [];
    let importedYearMonths: Set<string> = new Set();
    let totalRows = 0;
    let headerRowIndex = 0;
    let totalDataRows = 0;
    let skippedEmpty = 0;
    let skippedNoName = 0;

    // ========== 文件上传模式 ==========
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: '请上传文件' }, { status: 400 });
      }

      const fileName = file.name.toLowerCase();
      let rows: any[][] = [];

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Excel 文件解析
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      } else if (fileName.endsWith('.csv')) {
        // CSV 文件解析
        const arrayBuffer = await file.arrayBuffer();
        let uint8 = new Uint8Array(arrayBuffer);
        // 跳过 BOM
        if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
          uint8 = uint8.slice(3);
        }
        const text = new TextDecoder('utf-8').decode(uint8);
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        for (let i = 0; i < lines.length; i++) {
          const cells: string[] = [];
          let current = '';
          let inQuotes = false;
          for (const ch of lines[i]) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; }
            else { current += ch; }
          }
          cells.push(current.trim());
          rows.push(cells);
        }
      } else {
        return NextResponse.json({ error: '请上传 Excel 文件（.xlsx, .xls）或 CSV 文件' }, { status: 400 });
      }

      totalRows = rows.length;
      if (rows.length < 2) {
        return NextResponse.json({ error: '文件内容为空或格式不正确' }, { status: 400 });
      }

      // 查找列索引
      // 清洗字符串：去除隐藏字符（零宽空格、BOM、不间断空格等）
      const sanitize = (s: string): string => {
        if (!s) return '';
        return String(s)
          .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2028\u2029\u202F\u205F\u3000]/g, '')
          .trim();
      };

      // 自动检测表头行：扫描前5行，找到包含"工人姓名"或"姓名"等关键词的行
      const nameKeywords = ['工人姓名', '姓名', '员工姓名', '工人', '员工'];
      let header: string[] = [];

      for (let r = 0; r < Math.min(5, rows.length); r++) {
        const sanitized = rows[r].map((h: any) => sanitize(String(h || '')));
        const hasNameCol = sanitized.some((h: string) =>
          nameKeywords.some(k => h.includes(k) || k.includes(h))
        );
        if (hasNameCol) {
          headerRowIndex = r;
          header = sanitized;
          break;
        }
        // 如果第一行没匹配到，先记录下来继续找
        if (r === 0) {
          header = sanitized;
          headerRowIndex = 0;
        }
      }

      console.log('[Salaries Batch] Detected header row index:', headerRowIndex);
      console.log('[Salaries Batch] Raw row[' + headerRowIndex + ']:', JSON.stringify(rows[headerRowIndex]));
      console.log('[Salaries Batch] Sanitized headers:', JSON.stringify(header));
      console.log('[Salaries Batch] Total rows:', rows.length);

      // 提取纯中文字符（用于兜底匹配）
      const stripToChinese = (s: string): string => s.replace(/[^\u4e00-\u9fff]/g, '');

      const findIndex = (names: string[]) => {
        // 第一轮：标准匹配（includes 双向）
        for (const name of names) {
          const idx = header.findIndex(h => h.includes(name) || name.includes(h));
          if (idx >= 0) return idx;
        }
        // 第二轮：纯中文匹配（去除所有非中文字符后比较）
        for (const name of names) {
          const pureName = stripToChinese(name);
          const idx = header.findIndex(h => {
            const pureH = stripToChinese(h);
            return pureH.includes(pureName) || pureName.includes(pureH);
          });
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const workerNameIdx = findIndex(['工人姓名', '姓名', '员工姓名', '工人', '员工']);
      const projectNameIdx = findIndex(['项目名称', '所属项目', '项目']);
      const yearMonthIdx = findIndex(['年月', '工资月份', '所属月份', '月份']);
      const workHoursIdx = findIndex(['工时', '工作小时', '出勤天数', '天数']);
      const hourlyRateIdx = findIndex(['工价', '时薪', '单价', '日薪']);
      const contractPayIdx = findIndex(['包活工资', '包工工资', '包活', '计件工资']);
      const incomeTaxIdx = findIndex(['个税', '个人所得税', '所得税']);
      const advancePayIdx = findIndex(['借支', '预支', '预支款', '借款']);
      const laborInsIdx = findIndex(['劳保', '劳保费', '社保']);
      const fineIdx = findIndex(['罚款', '扣款', '罚款扣款']);
      const remarkIdx = findIndex(['备注', '说明', '备注说明']);

      // 必填列检查
      const missingCols: string[] = [];
      if (workerNameIdx < 0) missingCols.push('工人姓名');
      if (yearMonthIdx < 0) missingCols.push('年月');
      if (missingCols.length > 0) {
        // 输出每个表头的 hex 编码，帮助排查隐藏字符
        const headerDebug = header.map((h: string) => {
          const hex = Array.from(h).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ');
          return `"${h}" [${hex}]`;
        }).join(', ');
        console.error('[Salaries Batch] Header match failed! Debug:', headerDebug);
        return NextResponse.json({
          error: `缺少必要列: ${missingCols.join('、')}。当前表头: ${header.join('、')}`,
          debug: headerDebug,
        }, { status: 400 });
      }

      // 逐行解析（从表头行的下一行开始）
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) { skippedEmpty++; continue; }

        const workerName = String(getCellValue(row, workerNameIdx)).trim();
        const projectName = String(getCellValue(row, projectNameIdx)).trim();
        const rawYearMonth = getCellValue(row, yearMonthIdx);
        const yearMonth = normalizeYearMonth(rawYearMonth);
        const rowNumber = i + 1; // Excel行号（1-based，含表头）

        totalDataRows++;
        if (!workerName) { skippedNoName++; }

        if (!workerName) { errors.push(`第${rowNumber}行：工人姓名为空`); continue; }
        if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
          errors.push(`第${rowNumber}行：月份格式错误"${rawYearMonth}"，应为YYYY-MM格式`);
          continue;
        }

        // 金额字段校验
        const rawWorkHours = getCellValue(row, workHoursIdx);
        const rawHourlyRate = getCellValue(row, hourlyRateIdx);
        const rawContractPay = getCellValue(row, contractPayIdx);
        const rawIncomeTax = getCellValue(row, incomeTaxIdx);
        const rawAdvancePay = getCellValue(row, advancePayIdx);
        const rawLaborIns = getCellValue(row, laborInsIdx);
        const rawFine = getCellValue(row, fineIdx);

        const validateNumber = (raw: any, fieldName: string): number | null => {
          if (raw === '' || raw === null || raw === undefined) return 0;
          const num = Number(raw);
          if (isNaN(num)) {
            errors.push(`第${rowNumber}行：${fieldName}"${raw}"不是有效数字`);
            return null;
          }
          return num;
        };

        const workHours = validateNumber(rawWorkHours, '工时');
        if (workHours === null) continue;
        const hourlyRate = validateNumber(rawHourlyRate, '工价');
        if (hourlyRate === null) continue;
        const contractWorkPay = validateNumber(rawContractPay, '包活工资');
        if (contractWorkPay === null) continue;
        const incomeTax = validateNumber(rawIncomeTax, '个税');
        if (incomeTax === null) continue;
        const advancePay = validateNumber(rawAdvancePay, '借支');
        if (advancePay === null) continue;
        const laborInsurance = validateNumber(rawLaborIns, '劳保');
        if (laborInsurance === null) continue;
        const fine = validateNumber(rawFine, '罚款');
        if (fine === null) continue;
        const remark = String(getCellValue(row, remarkIdx)).trim();

        // 匹配工人
        const worker = workersList.find(w => w.name.trim() === workerName);
        if (!worker) {
          if (!notInRoster.find(n => n.name === workerName)) {
            notInRoster.push({ row: rowNumber, name: workerName });
            warnings.push(`第${rowNumber}行：未找到工人"${workerName}"（不在花名册中）`);
          }
          continue;
        }

        // 匹配项目
        let projectId: number | null = worker.project_id;
        if (projectName) {
          const project = projectsList.find(p => p.name.trim() === projectName);
          if (project) {
            projectId = project.id;
          } else {
            errors.push(`第${rowNumber}行：项目名称"${projectName}"不存在`);
            continue;
          }
        }

        // 计算应发和实发
        const grossPay = workHours * hourlyRate + contractWorkPay;
        const netPay = grossPay - incomeTax - advancePay - laborInsurance - fine;

        importedYearMonths.add(yearMonth);

        recordsToInsert.push({
          worker_id: worker.id,
          project_id: projectId,
          year_month: yearMonth,
          work_hours: workHours,
          hourly_rate: hourlyRate,
          contract_work_pay: contractWorkPay,
          gross_pay: grossPay,
          income_tax: incomeTax,
          advance_pay: advancePay,
          labor_insurance: laborInsurance,
          fine: fine,
          net_pay: netPay,
          remark: remark || null,
        });
      }

    } else {
      // ========== JSON 模式（向后兼容） ==========
      const body = await request.json();
      const { salaries } = body;

      if (!salaries || !Array.isArray(salaries) || salaries.length === 0) {
        return NextResponse.json({ error: '请提供有效的工资数据' }, { status: 400 });
      }

      for (let i = 0; i < salaries.length; i++) {
        const s = salaries[i];
        if (!s.worker_id) { errors.push(`第${i + 1}条记录缺少工人信息`); continue; }
        if (!s.year_month) { errors.push(`第${i + 1}条记录缺少年月信息`); continue; }

        const workerId = parseInt(s.worker_id);
        let projectId: number | null = s.project_id ? parseInt(s.project_id) : null;
        if (!projectId) {
          const { data: worker } = await client.from('workers').select('project_id').eq('id', workerId).single();
          projectId = worker?.project_id || null;
        }

        const workHours = Number(s.work_hours) || 0;
        const hourlyRate = Number(s.hourly_rate) || 0;
        const contractWorkPay = Number(s.contract_work_pay) || 0;
        const incomeTax = Number(s.income_tax) || 0;
        const advancePay = Number(s.advance_pay) || 0;
        const laborInsurance = Number(s.labor_insurance) || 0;
        const fine = Number(s.fine) || 0;
        const grossPay = Number(s.gross_pay) || (workHours * hourlyRate + contractWorkPay);
        const netPay = Number(s.net_pay) || (grossPay - incomeTax - advancePay - laborInsurance - fine);

        // 确保 year_month 格式为 YYYY-MM
        const normalizedYM = normalizeYearMonth(s.year_month);
        importedYearMonths.add(normalizedYM);

        recordsToInsert.push({
          worker_id: workerId,
          project_id: projectId,
          year_month: normalizedYM,
          work_hours: workHours,
          hourly_rate: hourlyRate,
          contract_work_pay: contractWorkPay,
          gross_pay: grossPay,
          income_tax: incomeTax,
          advance_pay: advancePay,
          labor_insurance: laborInsurance,
          fine: fine,
          net_pay: netPay,
          remark: s.remark || null,
        });
      }
    }

    if (recordsToInsert.length === 0) {
      const debugInfo = {
        totalRows,
        headerRowIndex,
        totalDataRows,
        skippedEmpty,
        skippedNoName,
        notInRosterCount: notInRoster.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        firstErrors: errors.slice(0, 5),
        firstWarnings: warnings.slice(0, 5),
        notInRosterNames: notInRoster.slice(0, 10).map(n => n.name),
      };
      console.error('[Salaries Batch] No valid records. Debug:', JSON.stringify(debugInfo));
      return NextResponse.json({
        error: '没有有效的工资数据',
        details: errors.join('；') || warnings.join('；') || `共${totalDataRows}行数据，全部被跳过`,
        debug: debugInfo,
      }, { status: 400 });
    }

    console.log('[Salaries Batch] Inserting', recordsToInsert.length, 'records');

    const { data, error: insertError } = await insertWithSequenceFix('worker_salaries', recordsToInsert, client);

    if (insertError) {
      console.error('[Salaries Batch] Insert error:', insertError);
      return NextResponse.json({ error: `批量创建工资记录失败: ${insertError.message}` }, { status: 500 });
    }

    console.log('[Salaries Batch] Successfully inserted', data?.length || 0, 'records');

    const result: any = {
      salaries: data,
      count: data?.length || 0,
      imported: data?.length || 0,
      errors: errors,
      warnings: warnings,
      notInRoster: notInRoster,
      notFoundProjects: notFoundProjects,
      successCount: data?.length || 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      message: errors.length > 0
        ? `成功导入 ${data?.length || 0} 条，失败 ${errors.length} 条`
        : `成功导入 ${data?.length || 0} 条工资记录`,
      importedYearMonths: Array.from(importedYearMonths),
    };

    await auditLog({
      operationType: 'import',
      resourceType: 'worker_salary',
      details: { count: data?.length || 0, errors: errors.length },
      request,
    });

    // 钉钉推送通知
    if (result.imported > 0 || result.updated > 0) {
      await pushBusinessNotification({
        type: 'new_worker_salary',
        title: '批量导入月度工资',
        content: `批量导入月度工资记录，新增 ${result.imported || 0} 条，更新 ${result.updated || 0} 条${notInRoster.length > 0 ? `，${notInRoster.length} 人不在花名册中` : ''}`,
        severity: notInRoster.length > 0 ? 'warning' : 'info',
        projectId: undefined,
        relatedType: 'worker_salary_batch',
        metadata: { imported: result.imported, updated: result.updated, notInRosterCount: notInRoster.length },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Salaries Batch] API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败，请稍后重试' },
      { status: 500 }
    );
  }
}
