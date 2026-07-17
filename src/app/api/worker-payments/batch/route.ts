/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { syncSalaryPaymentStatus } from '@/lib/business-logic';
import { syncWorkerProjectAssignment } from '@/lib/worker-assignment-sync';

type DbRow = Record<string, any>;

type ImportIssueType = 'blocked' | 'confirm' | 'warning';

type ImportIssue = {
  row: number;
  type: ImportIssueType;
  code: string;
  message: string;
};

type ParsedPaymentRow = {
  row: number;
  worker_name: string;
  id_card: string;
  project_name: string;
  project_id: number;
  worker_id?: number | null;
  salary_id?: number | null;
  year_month: string;
  payment_amount: number;
  payment_date: string;
  payment_type: string;
  remark?: string | null;
  create_worker?: boolean;
};

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/[,，￥¥元\s]/g, '')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function normalizeIdCard(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function normalizeYearMonth(value?: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 7);
  }

  const text = String(value || '').trim();
  if (!text) return '';

  let match = text.match(/^(\d{4})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;

  match = text.match(/^(\d{4})[年/.](\d{1,2})月?$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;

  match = text.match(/^(\d{4})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}`;

  if (/^\d+$/.test(text)) {
    const num = Number(text);
    if (num > 40000) {
      const excelEpoch = new Date(1899, 11, 30);
      const jsDate = new Date(excelEpoch.getTime() + num * 86400000);
      return jsDate.toISOString().slice(0, 7);
    }
  }

  return text;
}

function normalizeDate(value?: unknown, yearMonth?: string | null) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value || '').trim();

  if (/^\d+$/.test(text) && Number(text) > 40000) {
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + Number(text) * 86400000);
    return jsDate.toISOString().slice(0, 10);
  }

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

  match = text.match(/^(\d{4})[年/.](\d{1,2})[月/.](\d{1,2})日?$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

  if (text) return text;
  return yearMonth ? `${yearMonth}-15` : '';
}

function duplicatePaymentKey(params: {
  workerName?: string | null;
  projectName?: string | null;
  yearMonth?: string | null;
  amount?: number | string | null;
}) {
  return [
    normalizeText(params.workerName),
    normalizeText(params.projectName),
    normalizeText(params.yearMonth),
    parseAmount(params.amount).toFixed(2),
  ].join('|');
}

function sanitize(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2028\u2029\u202F\u205F\u3000]/g, '')
    .trim();
}

function stripToChinese(value: string): string {
  return value.replace(/[^\u4e00-\u9fff]/g, '');
}

function findIndex(headers: string[], names: string[]) {
  for (const name of names) {
    const idx = headers.findIndex(h => h.includes(name) || name.includes(h));
    if (idx >= 0) return idx;
  }

  for (const name of names) {
    const pureName = stripToChinese(name);
    const idx = headers.findIndex(h => {
      const pureHeader = stripToChinese(h);
      return pureHeader && (pureHeader.includes(pureName) || pureName.includes(pureHeader));
    });
    if (idx >= 0) return idx;
  }

  return -1;
}

function parseCsv(text: string) {
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  });
}

async function readRowsFromFile(file: File) {
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
    throw new Error('请上传 Excel 文件（.xlsx/.xls）或 CSV 文件');
  }

  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  if (fileName.endsWith('.csv')) {
    const startOffset = uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF ? 3 : 0;
    return parseCsv(new TextDecoder('utf-8').decode(uint8.slice(startOffset)));
  }

  const XLSX = require('xlsx');
  const workbook = XLSX.read(uint8, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false }) as any[][];
}

async function analyzeRows(rows: any[][]) {
  if (rows.length < 2) {
    throw new Error('文件内容为空或格式不正确');
  }

  const nameKeywords = ['工人姓名', '姓名', '工人', '员工姓名', '员工'];
  let headerRowIndex = 0;
  let headers = rows[0].map((h: unknown) => sanitize(h));

  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const sanitized = rows[r].map((h: unknown) => sanitize(h));
    const hasNameCol = sanitized.some((h: string) => nameKeywords.some(k => h.includes(k) || k.includes(h)));
    if (hasNameCol) {
      headerRowIndex = r;
      headers = sanitized;
      break;
    }
  }

  const workerNameIdx = findIndex(headers, ['工人姓名', '姓名', '工人', '员工姓名', '员工']);
  const idCardIdx = findIndex(headers, ['身份证号', '身份证号码', '身份证', '证件号码']);
  const projectNameIdx = findIndex(headers, ['项目名称', '项目', '所属项目']);
  const paymentDateIdx = findIndex(headers, ['付款日期', '发放日期', '日期', '支付日期', '发放时间', '付款时间']);
  const amountIdx = findIndex(headers, ['实发金额', '付款金额', '金额', '发放金额', '支付金额', '发放额', '付款额']);
  const paymentTypeIdx = findIndex(headers, ['付款类型', '发放类型', '类型', '付款方式', '支付方式']);
  const yearMonthIdx = findIndex(headers, ['工资所属月份', '所属月份', '工资月份', '年月', '核算月份', '月份', '核算周期']);
  const remarkIdx = findIndex(headers, ['备注', '说明', '备注说明']);

  const missingCols: string[] = [];
  if (workerNameIdx === -1) missingCols.push('工人姓名');
  if (idCardIdx === -1) missingCols.push('身份证号');
  if (projectNameIdx === -1) missingCols.push('项目名称');
  if (yearMonthIdx === -1) missingCols.push('工资所属月份');
  if (amountIdx === -1) missingCols.push('实发金额');

  if (missingCols.length > 0) {
    throw new Error(`缺少必要列：${missingCols.join('、')}。当前表头：${headers.join('、')}`);
  }

  const client = getSupabaseClient();
  const [{ data: workersData }, { data: projectsData }] = await Promise.all([
    client.from('workers').select('id, name, id_card'),
    client.from('projects').select('id, name'),
  ]);

  const workerMap = new Map((workersData || [])
    .filter((worker: any) => normalizeIdCard(worker.id_card))
    .map((worker: any) => [normalizeIdCard(worker.id_card), worker]));
  const projectMap = new Map((projectsData || []).map((project: any) => [normalizeText(project.name), project]));
  const batchDuplicateKeys = new Set<string>();
  const parsedRows: ParsedPaymentRow[] = [];
  const issues: ImportIssue[] = [];
  let dataRowCount = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: unknown) => !sanitize(cell))) continue;

    dataRowCount++;
    const rowNo = i + 1;
    const getCell = (idx: number) => idx >= 0 && idx < row.length ? sanitize(row[idx]) : '';
    const workerName = getCell(workerNameIdx);
    const idCard = normalizeIdCard(getCell(idCardIdx));
    const projectName = getCell(projectNameIdx);
    const rawYearMonth = getCell(yearMonthIdx);
    const yearMonth = normalizeYearMonth(rawYearMonth);
    const rawAmount = getCell(amountIdx);
    const amount = parseAmount(rawAmount);
    const paymentDate = normalizeDate(getCell(paymentDateIdx), yearMonth);
    const paymentType = getCell(paymentTypeIdx) || '月度工资';
    const remark = getCell(remarkIdx);
    let blocked = false;

    const block = (code: string, message: string) => {
      blocked = true;
      issues.push({ row: rowNo, type: 'blocked', code, message });
    };

    if (!workerName) block('missing_worker_name', '工人姓名为空，已拦截');
    if (!idCard) block('missing_id_card', '身份证号为空，已拦截');
    if (!projectName) block('missing_project_name', '项目名称为空，已拦截');
    if (!yearMonth) block('missing_year_month', '工资所属月份为空，已拦截');
    if (yearMonth && !/^\d{4}-\d{2}$/.test(yearMonth)) {
      block('invalid_year_month', `工资所属月份“${rawYearMonth}”格式错误，应为 YYYY-MM，已拦截`);
    }
    if (!rawAmount || amount <= 0) block('invalid_amount', `实发金额“${rawAmount || '空'}”无效，已拦截`);

    const project = projectMap.get(normalizeText(projectName));
    if (projectName && !project) block('project_not_found', `项目“${projectName}”不存在，已拦截`);

    const duplicateKey = duplicatePaymentKey({ workerName, projectName, yearMonth, amount });
    if (workerName && projectName && yearMonth && amount > 0) {
      if (batchDuplicateKeys.has(duplicateKey)) {
        block('duplicate_in_file', '本次导入文件内存在重复记录（姓名+项目名称+月份+金额相同），已拦截');
      } else {
        batchDuplicateKeys.add(duplicateKey);
      }
    }

    if (blocked || !project) continue;

    const worker = workerMap.get(idCard);
    const parsed: ParsedPaymentRow = {
      row: rowNo,
      worker_name: workerName,
      id_card: idCard,
      project_name: project.name,
      project_id: project.id,
      worker_id: worker?.id || null,
      year_month: yearMonth,
      payment_amount: amount,
      payment_date: paymentDate,
      payment_type: paymentType,
      remark: remark || null,
      create_worker: !worker,
    };

    if (!worker) {
      issues.push({
        row: rowNo,
        type: 'confirm',
        code: 'worker_not_in_roster',
        message: `工人“${workerName}”不在花名册中，确认导入后将自动新增工人档案，缺失资料后续补充`,
      });
    }

    parsedRows.push(parsed);
  }

  const existingDuplicateKeys = new Set<string>();
  const projectIds = [...new Set(parsedRows.map(row => row.project_id))];
  const yearMonths = [...new Set(parsedRows.map(row => row.year_month))];
  if (projectIds.length > 0 && yearMonths.length > 0) {
    const { data: existingPayments, error } = await client
      .from('salary_payments')
      .select('payment_amount, year_month, project_id, workers(name), projects(name)')
      .in('project_id', projectIds)
      .in('year_month', yearMonths);

    if (error) throw new Error(`检查重复工资发放失败：${error.message}`);

    (existingPayments || []).forEach((payment: any) => {
      existingDuplicateKeys.add(duplicatePaymentKey({
        workerName: payment.workers?.name,
        projectName: payment.projects?.name,
        yearMonth: payment.year_month,
        amount: payment.payment_amount,
      }));
    });
  }

  const salaryWorkerIds = [...new Set(parsedRows.map(row => row.worker_id).filter(Boolean))];
  const salaryProjectIds = [...new Set(parsedRows.map(row => row.project_id).filter(Boolean))];
  const salaryYearMonths = [...new Set(parsedRows.map(row => row.year_month).filter(Boolean))];
  const salaryMap = new Map<string, any>();
  const duplicateSalaryKeys = new Set<string>();
  const paidMap = new Map<number, number>();

  if (salaryWorkerIds.length > 0 && salaryProjectIds.length > 0 && salaryYearMonths.length > 0) {
    const { data: salaries, error } = await client
      .from('worker_salaries')
      .select('id, worker_id, project_id, year_month, net_pay')
      .in('worker_id', salaryWorkerIds)
      .in('project_id', salaryProjectIds)
      .in('year_month', salaryYearMonths);

    if (error) throw new Error(`匹配工资核算单失败：${error.message}`);

    (salaries || []).forEach((salary: any) => {
      const key = `${salary.worker_id}:${salary.project_id}:${salary.year_month}`;
      if (salaryMap.has(key)) duplicateSalaryKeys.add(key);
      salaryMap.set(key, salary);
    });

    const salaryIds = (salaries || []).map((salary: any) => salary.id);
    if (salaryIds.length > 0) {
      const { data: existingSalaryPayments } = await client
        .from('salary_payments')
        .select('salary_id, payment_amount')
        .in('salary_id', salaryIds);

      (existingSalaryPayments || []).forEach((payment: any) => {
        if (!payment.salary_id) return;
        paidMap.set(payment.salary_id, (paidMap.get(payment.salary_id) || 0) + parseAmount(payment.payment_amount));
      });
    }
  }

  const importPaidMap = new Map<number, number>();
  const readyRows = parsedRows.filter(row => {
    const duplicateKey = duplicatePaymentKey({
      workerName: row.worker_name,
      projectName: row.project_name,
      yearMonth: row.year_month,
      amount: row.payment_amount,
    });

    if (existingDuplicateKeys.has(duplicateKey)) {
      issues.push({
        row: row.row,
        type: 'blocked',
        code: 'duplicate_existing',
        message: '系统中已存在相同工资发放记录（姓名+项目名称+月份+金额相同），已拦截',
      });
      return false;
    }

    if (!row.worker_id) return true;

    const salaryKey = `${row.worker_id}:${row.project_id}:${row.year_month}`;
    if (duplicateSalaryKeys.has(salaryKey)) {
      issues.push({
        row: row.row,
        type: 'blocked',
        code: 'duplicate_salary',
        message: '该工人在当前项目、当前月份存在多张工资核算单，请先处理重复工资记录',
      });
      return false;
    }

    const salary = salaryMap.get(salaryKey);
    if (!salary) {
      issues.push({
        row: row.row,
        type: 'confirm',
        code: 'salary_not_found',
        message: '该人员当月无工资核算记录，请核实；确认后仍可继续导入并特别标注',
      });
      row.salary_id = null;
      return true;
    }

    row.salary_id = salary.id;
    const alreadyPaid = paidMap.get(salary.id) || 0;
    const importingPaid = importPaidMap.get(salary.id) || 0;
    const netPay = parseAmount(salary.net_pay);

    if (alreadyPaid + importingPaid + row.payment_amount > netPay) {
      issues.push({
        row: row.row,
        type: 'warning',
        code: 'amount_exceeds_salary',
        message: `发放金额可能超过工资核算实发金额：实发 ${netPay}，已发 ${alreadyPaid}，本批已排 ${importingPaid}，本次 ${row.payment_amount}`,
      });
    }

    importPaidMap.set(salary.id, importingPaid + row.payment_amount);
    return true;
  });

  return {
    readyRows,
    issues,
    summary: {
      totalRows: dataRowCount,
      importable: readyRows.length,
      blocked: issues.filter(issue => issue.type === 'blocked').length,
      confirm: issues.filter(issue => issue.type === 'confirm').length,
      warning: issues.filter(issue => issue.type === 'warning').length,
      missingRoster: issues.filter(issue => issue.code === 'worker_not_in_roster').length,
      missingSalary: issues.filter(issue => issue.code === 'salary_not_found').length,
    },
  };
}

async function ensureMissingWorkers(rows: ParsedPaymentRow[]) {
  const client = getSupabaseClient();
  const missingRows = rows.filter(row => row.create_worker && !row.worker_id);
  if (missingRows.length === 0) return rows;

  const uniqueRows = new Map<string, ParsedPaymentRow>();
  missingRows.forEach(row => {
    if (!uniqueRows.has(row.id_card)) uniqueRows.set(row.id_card, row);
  });

  const insertRows = Array.from(uniqueRows.values()).map(row => ({
    name: row.worker_name,
    id_card: row.id_card,
    project_id: row.project_id,
    status: 'in_service',
    remark: `工资发放导入时自动创建，来源行号：${row.row}`,
  }));

  const { data, error } = await insertWithSequenceFix('workers', insertRows, client);
  if (error) throw new Error(`自动新增工人档案失败：${error.message}`);

  const createdWorkers = Array.isArray(data) ? data : (data ? [data] : []);
  const workerMap = new Map(createdWorkers.map((worker: any) => [normalizeIdCard(worker.id_card), worker]));

  for (const worker of createdWorkers) {
    if (worker.project_id && worker.id) {
      await syncWorkerProjectAssignment(client, {
        workerId: worker.id,
        projectId: worker.project_id,
        startDate: null,
      });
    }
  }

  return rows.map(row => {
    if (!row.worker_id && row.create_worker) {
      const worker = workerMap.get(row.id_card);
      if (!worker?.id) throw new Error(`自动新增工人档案后未能匹配身份证号：${row.id_card}`);
      return { ...row, worker_id: worker.id };
    }
    return row;
  });
}

async function confirmImport(rows: ParsedPaymentRow[], request: NextRequest) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '没有可导入的工资发放数据' }, { status: 400 });
  }

  const rowsWithWorkers = await ensureMissingWorkers(rows);
  const client = getSupabaseClient();

  const insertRows = rowsWithWorkers.map(row => ({
    salary_id: row.salary_id || null,
    worker_id: row.worker_id,
    project_id: row.project_id,
    year_month: row.year_month,
    payment_amount: row.payment_amount,
    payment_date: row.payment_date,
    payment_type: row.payment_type || '月度工资',
    remark: [
      row.remark || '',
      row.create_worker ? '导入时自动新增工人档案' : '',
      !row.salary_id ? '未匹配到当月工资核算记录，人工确认导入' : '',
    ].filter(Boolean).join('；') || null,
  }));

  const { data, error } = await insertWithSequenceFix('salary_payments', insertRows, client);
  if (error) {
    return NextResponse.json({ error: `批量导入失败：${error.message}` }, { status: 500 });
  }

  const affectedSalaryIds = [...new Set(insertRows.map(row => row.salary_id).filter(Boolean))];
  for (const salaryId of affectedSalaryIds) {
    await syncSalaryPaymentStatus(Number(salaryId));
  }

  await auditLog({
    operationType: 'create',
    resourceType: 'salary_payment',
    resourceId: 0,
    details: {
      action: 'batch_import_confirmed',
      count: data?.length || 0,
      autoCreatedWorkers: rowsWithWorkers.filter(row => row.create_worker).length,
      unmatchedSalary: rowsWithWorkers.filter(row => !row.salary_id).length,
    },
    request,
  });

  if ((data?.length || 0) > 0) {
    await pushBusinessNotification({
      type: 'new_worker_payment',
      title: '批量导入工资发放',
      content: `批量导入工资发放记录，成功导入 ${data?.length || 0} 条`,
      severity: rowsWithWorkers.some(row => row.create_worker || !row.salary_id) ? 'warning' : 'info',
      relatedType: 'salary_payment_batch',
      metadata: {
        count: data?.length || 0,
        autoCreatedWorkers: rowsWithWorkers.filter(row => row.create_worker).length,
        unmatchedSalary: rowsWithWorkers.filter(row => !row.salary_id).length,
      },
    });
  }

  return NextResponse.json({
    success: true,
    count: data?.length || 0,
    autoCreatedWorkers: rowsWithWorkers.filter(row => row.create_worker).length,
    unmatchedSalary: rowsWithWorkers.filter(row => !row.salary_id).length,
  });
}

export async function GET() {
  try {
    const XLSX = require('xlsx');
    const headers = ['工人姓名', '身份证号', '项目名称', '工资所属月份', '实发金额', '付款方式', '付款日期', '备注'];
    const sampleRow1 = ['张三', '110101199001010011', '测试项目', '2025-01', 5000, '银行转账', '2025-05-15', '发放1月份工资'];
    const sampleRow2 = ['李四', '110101199002020022', '测试项目', '2025-01', 3000, '现金', '', '付款日期可空，默认取工资月份15日'];
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow1, sampleRow2]);
    ws['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 28 },
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

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (!file) return NextResponse.json({ error: '请上传文件' }, { status: 400 });

      const rows = await readRowsFromFile(file);
      const preview = await analyzeRows(rows);
      return NextResponse.json({
        mode: 'preview',
        needsConfirmation: preview.readyRows.length > 0,
        ...preview,
      });
    }

    const body = await request.json();
    if (body?.mode === 'confirm') {
      return confirmImport(body.rows || [], request);
    }

    return NextResponse.json({ error: '无效的导入请求' }, { status: 400 });
  } catch (error: any) {
    console.error('[Worker Payments Batch] API Error:', error);
    return NextResponse.json(
      { error: error.message || '批量导入失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请选择要删除的记录' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from('salary_payments')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`批量删除失败：${error.message}`);
    }

    const { syncAllSalaryPaymentStatus } = await import('@/lib/business-logic');
    await syncAllSalaryPaymentStatus();

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('[Worker Payments Batch DELETE] Error:', error);
    return NextResponse.json(
      { error: error.message || '批量删除失败' },
      { status: 500 }
    );
  }
}
