import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { syncSalaryPaymentStatus } from '@/lib/business-logic';

function parseAmount(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStandalonePaymentType(paymentType?: string | null) {
  return ['预支款', '借支款', '其他'].includes(paymentType || '');
}

function paymentKey(payment: { worker_id: number; project_id: number | null; year_month: string | null }) {
  return `${payment.worker_id}:${payment.project_id || ''}:${payment.year_month || ''}`;
}

async function bindPaymentsToSalaries(
  client: ReturnType<typeof getSupabaseClient>,
  payments: any[],
  errors: string[]
) {
  const salaryKeys = [...new Set(
    payments
      .filter(p => p.worker_id && p.project_id && p.year_month)
      .map(paymentKey)
  )];

  if (salaryKeys.length === 0) return [];

  const workerIds = [...new Set(payments.map(p => p.worker_id).filter(Boolean))];
  const projectIds = [...new Set(payments.map(p => p.project_id).filter(Boolean))];
  const yearMonths = [...new Set(payments.map(p => p.year_month).filter(Boolean))];

  const { data: salaries, error } = await client
    .from('worker_salaries')
    .select('id, worker_id, project_id, year_month, net_pay')
    .in('worker_id', workerIds)
    .in('project_id', projectIds)
    .in('year_month', yearMonths);

  if (error) {
    throw new Error(`匹配工资核算单失败: ${error.message}`);
  }

  const salaryMap = new Map<string, any>();
  const duplicateKeys = new Set<string>();
  (salaries || []).forEach((salary: any) => {
    const key = paymentKey(salary);
    if (salaryMap.has(key)) duplicateKeys.add(key);
    salaryMap.set(key, salary);
  });

  const salaryIds = (salaries || []).map((salary: any) => salary.id);
  const paidMap = new Map<number, number>();
  if (salaryIds.length > 0) {
    const { data: existingPayments } = await client
      .from('salary_payments')
      .select('salary_id, payment_amount')
      .in('salary_id', salaryIds);

    (existingPayments || []).forEach((payment: any) => {
      if (!payment.salary_id) return;
      paidMap.set(payment.salary_id, (paidMap.get(payment.salary_id) || 0) + parseAmount(payment.payment_amount));
    });
  }

  const importPaidMap = new Map<number, number>();
  const validPayments: any[] = [];

  payments.forEach((payment, index) => {
    const rowLabel = `第${index + 1}条`;

    if (!payment.project_id || !payment.year_month) {
      if (isStandalonePaymentType(payment.payment_type)) {
        validPayments.push(payment);
      } else {
        errors.push(`${rowLabel}：月度工资发放必须提供项目和年月，用于匹配工资核算单`);
      }
      return;
    }

    const key = paymentKey(payment);
    if (duplicateKeys.has(key)) {
      errors.push(`${rowLabel}：该工人当前项目、当前月份存在多张工资核算单，请先处理重复工资记录`);
      return;
    }

    const salary = salaryMap.get(key);
    if (!salary) {
      if (isStandalonePaymentType(payment.payment_type)) {
        validPayments.push(payment);
      } else {
        errors.push(`${rowLabel}：未找到对应工资核算单，月度工资发放未导入`);
      }
      return;
    }

    const alreadyPaid = paidMap.get(salary.id) || 0;
    const importingPaid = importPaidMap.get(salary.id) || 0;
    const amount = parseAmount(payment.payment_amount);
    const netPay = parseAmount(salary.net_pay);

    if (alreadyPaid + importingPaid + amount > netPay) {
      errors.push(`${rowLabel}：发放超额，实发工资${netPay}，已发${alreadyPaid}，本批次已排队${importingPaid}，本次${amount}`);
      return;
    }

    importPaidMap.set(salary.id, importingPaid + amount);
    validPayments.push({
      ...payment,
      salary_id: salary.id,
      year_month: salary.year_month,
      project_id: salary.project_id,
    });
  });

  return validPayments;
}

// GET: 下载导入模板（生成 xlsx 文件）
export async function GET() {
  try {
    const XLSX = require('xlsx');
    const headers = ['工人姓名', '项目名称', '付款金额', '付款方式', '年月', '付款日期', '备注'];
    const sampleRow1 = ['张三', '测试项目', 5000, '银行转账', '2025-01', '2025-01-15', '1月份工资'];
    const sampleRow2 = ['李四', '测试项目', 3000, '现金', '2025-01', '', '预支款'];
    const data = [headers, sampleRow1, sampleRow2];
    const ws = XLSX.utils.aoa_to_sheet(data);
    // 设置列宽
    ws['!cols'] = [
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '工资发放导入');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent('工资发放导入模板.xlsx'),
      },
    });
  } catch (error: any) {
    console.error('[Worker Payments Batch Template] Error:', error);
    return NextResponse.json({ error: '生成模板失败' }, { status: 500 });
  }
}

// POST: 批量导入工资发放记录（支持文件上传和JSON数据）
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let paymentsToInsert: any[] = [];
    let errors: string[] = [];
    let notInRoster: { row: number; name: string }[] = [];

    if (contentType.includes('multipart/form-data')) {
      // 文件上传模式：解析 Excel/CSV
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: '请上传文件' }, { status: 400 });
      }

      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
        return NextResponse.json({ error: '请上传 Excel 文件（.xlsx, .xls）或 CSV 文件' }, { status: 400 });
      }

      let rows: any[][] = [];

      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      if (fileName.endsWith('.csv')) {
        // CSV 文件：手动解析，正确处理 BOM 和编码
        let startOffset = 0;
        if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
          startOffset = 3; // 跳过 UTF-8 BOM
        }
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(uint8.slice(startOffset));
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        rows = lines.map(line => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
              else inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
            else current += char;
          }
          result.push(current.trim());
          return result;
        });
      } else {
        // Excel 文件：使用 xlsx 库解析
        const XLSX = require('xlsx');
        const workbook = XLSX.read(uint8, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
      }

      if (rows.length < 2) {
        return NextResponse.json({ error: '文件内容为空或格式不正确' }, { status: 400 });
      }

      // 清洗字符串：去除隐藏字符（零宽空格、BOM、不间断空格等）
      const sanitize = (s: string): string => {
        if (!s) return '';
        return String(s)
          .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2028\u2029\u202F\u205F\u3000]/g, '')
          .trim();
      };

      // 自动检测表头行：扫描前5行
      const nameKeywords = ['工人姓名', '姓名', '工人', '员工姓名', '员工'];
      let headerRowIndex = 0;
      const headers: string[] = [];

      for (let r = 0; r < Math.min(5, rows.length); r++) {
        const sanitized = rows[r].map((h: any) => sanitize(String(h ?? '')));
        const hasNameCol = sanitized.some((h: string) =>
          nameKeywords.some(k => h.includes(k) || k.includes(h))
        );
        if (hasNameCol) {
          headerRowIndex = r;
          headers.push(...sanitized);
          break;
        }
        if (r === 0) {
          headers.push(...sanitized);
        }
      }

      // 提取纯中文字符（用于兜底匹配）
      const stripToChinese = (s: string): string => s.replace(/[^\u4e00-\u9fff]/g, '');

      // 动态查找列索引（支持多种列名，使用 includes 部分匹配）
      const findIndex = (names: string[]) => {
        for (const name of names) {
          const idx = headers.findIndex(h => h.includes(name) || name.includes(h));
          if (idx >= 0) return idx;
        }
        // 兜底：纯中文匹配
        for (const name of names) {
          const pureName = stripToChinese(name);
          const idx = headers.findIndex(h => {
            const pureH = stripToChinese(h);
            return pureH.includes(pureName) || pureName.includes(pureH);
          });
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const workerNameIdx = findIndex(['工人姓名', '姓名', '工人', '员工姓名', '员工']);
      const projectNameIdx = findIndex(['项目名称', '项目', '所属项目']);
      const paymentDateIdx = findIndex(['付款日期', '发放日期', '日期', '支付日期', '发放时间', '付款时间']);
      const amountIdx = findIndex(['付款金额', '金额', '发放金额', '支付金额', '实发金额', '发放额', '付款额']);
      const paymentTypeIdx = findIndex(['付款类型', '发放类型', '类型', '付款方式', '支付方式']);
      const yearMonthIdx = findIndex(['年月', '核算月份', '月份', '核算周期', '工资月份', '所属月份']);
      const remarkIdx = findIndex(['备注', '说明', '备注说明']);

      // 必填列：工人姓名和付款金额；付款日期可由年月推导
      const missingCols: string[] = [];
      if (workerNameIdx === -1) missingCols.push('工人姓名');
      if (amountIdx === -1) missingCols.push('付款金额');

      if (missingCols.length > 0) {
        return NextResponse.json({
          error: `缺少必要列：${missingCols.join('、')}。当前表头：${headers.join('、')}`,
        }, { status: 400 });
      }

      // 获取工人和项目映射
      const client = getSupabaseClient();
      const { data: workersData } = await client.from('workers').select('id, name');
      const { data: projectsData } = await client.from('projects').select('id, name');

      const workerMap = new Map((workersData || []).map(w => [w.name, w.id]));
      const projectMap = new Map((projectsData || []).map(p => [p.name, p.id]));

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const getCell = (idx: number) => idx >= 0 && idx < row.length ? String(row[idx] ?? '').trim() : '';

        const workerName = getCell(workerNameIdx);
        const projectName = getCell(projectNameIdx);
        const paymentDate = getCell(paymentDateIdx);
        const amountStr = getCell(amountIdx);
        const paymentType = getCell(paymentTypeIdx);
        const yearMonth = getCell(yearMonthIdx);
        const remark = getCell(remarkIdx);

        if (!workerName || !amountStr) {
          errors.push(`第${i + 1}行：缺少必填字段（工人姓名、付款金额）`);
          continue;
        }

        const worker_id = workerMap.get(workerName);
        if (!worker_id) {
          notInRoster.push({ row: i + 1, name: workerName });
          errors.push(`第${i + 1}行：未找到工人"${workerName}"（不在花名册中）`);
          continue;
        }

        const project_id = projectName ? (projectMap.get(projectName) || null) : null;

        // 金额解析：处理数字、字符串、科学计数法
        const amount = parseFloat(amountStr) || 0;
        if (amount <= 0) {
          errors.push(`第${i + 1}行：付款金额无效"${amountStr}"`);
          continue;
        }

        // 日期解析：Excel 可能返回数字序列号
        let finalPaymentDate = paymentDate;
        if (/^\d+$/.test(paymentDate) && parseInt(paymentDate) > 40000) {
          // Excel 日期序列号转换
          const excelEpoch = new Date(1899, 11, 30);
          const jsDate = new Date(excelEpoch.getTime() + parseInt(paymentDate) * 86400000);
          finalPaymentDate = jsDate.toISOString().split('T')[0];
        }

        // 年月解析（同时用于推导付款日期）
        let finalYearMonth = yearMonth;
        if (yearMonth && /^\d+$/.test(yearMonth)) {
          // 可能是 Excel 日期数字，尝试转换
          const num = parseFloat(yearMonth);
          if (num > 40000) {
            const excelEpoch = new Date(1899, 11, 30);
            const jsDate = new Date(excelEpoch.getTime() + num * 86400000);
            finalYearMonth = jsDate.toISOString().slice(0, 7);
          } else if (num > 1900 && num < 2100) {
            finalYearMonth = String(Math.floor(num));
          }
        }

        // 如果没有付款日期，用年月推导（默认取该月15号）
        if (!finalPaymentDate && finalYearMonth) {
          if (/^\d{4}-\d{2}$/.test(finalYearMonth)) {
            finalPaymentDate = `${finalYearMonth}-15`;
          } else if (/^\d{4}$/.test(finalYearMonth)) {
            finalPaymentDate = `${finalYearMonth}-01-15`;
          } else if (/^\d{4}年\d{1,2}月?$/.test(finalYearMonth)) {
            const match = finalYearMonth.match(/(\d{4})年(\d{1,2})/);
            if (match) finalPaymentDate = `${match[1]}-${match[2].padStart(2, '0')}-15`;
          }
        }

        paymentsToInsert.push({
          worker_id,
          project_id,
          payment_amount: amount,
          payment_date: finalPaymentDate,
          payment_type: paymentType || '月度工资',
          year_month: finalYearMonth || null,
          remark: remark || null,
        });
      }
    } else {
      // JSON 数据模式（兼容旧接口）
      const body = await request.json();
      const { payments } = body;

      if (!payments || !Array.isArray(payments) || payments.length === 0) {
        return NextResponse.json({ error: '无效的数据格式' }, { status: 400 });
      }

      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];

        if (!payment.worker_id || !payment.payment_date || !payment.amount) {
          errors.push(`第${i + 1}条：缺少必填字段`);
          continue;
        }

        paymentsToInsert.push({
          worker_id: parseInt(payment.worker_id),
          project_id: payment.project_id ? parseInt(payment.project_id) : null,
          payment_amount: parseFloat(payment.amount) || 0,
          payment_date: String(payment.payment_date),
          payment_type: payment.payment_type || '月度工资',
          year_month: payment.year_month || null,
          remark: payment.remark || null,
        });
      }
    }

    if (paymentsToInsert.length === 0) {
      return NextResponse.json({
        error: '没有有效的工资发放数据',
        details: errors.join('；')
      }, { status: 400 });
    }

    // 匹配工资核算单并做超额校验
    const client = getSupabaseClient();
    paymentsToInsert = await bindPaymentsToSalaries(client, paymentsToInsert, errors);

    if (paymentsToInsert.length === 0) {
      return NextResponse.json({
        error: '没有可导入的工资发放数据',
        details: errors.join('；')
      }, { status: 400 });
    }

    // 批量插入
    const { data, error } = await insertWithSequenceFix('salary_payments', paymentsToInsert, client);

    if (error) {
      console.error('[Worker Payments Batch] Insert error:', error);
      return NextResponse.json({ error: `批量导入失败: ${error.message}` }, { status: 500 });
    }

    const result: any = {
      success: true,
      count: data?.length || 0,
      message: `成功导入 ${data?.length || 0} 条工资发放记录`,
    };

    if (errors.length > 0) {
      result.warnings = errors;
    }

    if (notInRoster.length > 0) {
      result.notInRoster = notInRoster;
    }

    const affectedSalaryIds = [...new Set(paymentsToInsert.map(p => p.salary_id).filter(Boolean))];
    for (const salaryId of affectedSalaryIds) {
      await syncSalaryPaymentStatus(Number(salaryId));
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'salary_payment',
      resourceId: 0,
      details: { action: 'batch_import', count: result.count || 0, notInRoster: notInRoster.length },
      request,
    });

    // 钉钉推送通知
    if ((result.count || 0) > 0) {
      await pushBusinessNotification({
        type: 'new_worker_payment',
        title: '批量导入工资发放',
        content: `批量导入工资发放记录，成功导入 ${result.count || 0} 条${notInRoster.length > 0 ? `，${notInRoster.length} 人不在花名册中` : ''}`,
        severity: notInRoster.length > 0 ? 'warning' : 'info',
        projectId: undefined,
        relatedType: 'salary_payment_batch',
        metadata: { count: result.count, notInRosterCount: notInRoster.length },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Worker Payments Batch] API Error:', error);
    return NextResponse.json(
      { error: error.message || '批量导入失败' },
      { status: 500 }
    );
  }
}

// DELETE: 批量删除工资发放记录
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请选择要删除的记录' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 删除前获取关联的 salary_id，用于后续同步状态
    const { data: recordsToDelete } = await client
      .from('salary_payments')
      .select('id, salary_id')
      .in('id', ids);

    const { error } = await client
      .from('salary_payments')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`批量删除失败: ${error.message}`);
    }

    // 同步关联工资记录的发放状态
    const affectedSalaryIds = new Set<number>();
    (recordsToDelete || []).forEach((r: any) => {
      if (r.salary_id) affectedSalaryIds.add(r.salary_id);
    });
    if (affectedSalaryIds.size > 0) {
      const { syncSalaryPaymentStatus } = await import('@/lib/business-logic');
      for (const salaryId of affectedSalaryIds) {
        await syncSalaryPaymentStatus(salaryId);
      }
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('[Worker Payments Batch DELETE] Error:', error);
    return NextResponse.json(
      { error: error.message || '批量删除失败' },
      { status: 500 }
    );
  }
}
