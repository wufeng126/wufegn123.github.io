import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseExcelFile } from '@/lib/excel-utils';
import { insertWithSequenceFix } from '@/lib/audit-log';

// Excel 列名到数据库字段的映射
const IMPORT_HEADER_MAP: Record<string, string> = {
  '项目名称': 'project_name',
  '结算金额': 'settlement_amount',
  '开票金额': 'invoice_amount',
  '扣款金额': 'deduction_amount',
  '比例付款': 'proportional_payment',
  '报量日期': 'report_date',
  '备注': 'remark',
};

// 必填字段（中文名）
const REQUIRED_FIELDS_CN = ['项目名称', '结算金额', '报量日期'];

// 必填字段（数据库字段名）
const REQUIRED_FIELDS_DB = ['project_name', 'settlement_amount', 'report_date'];

// 字段名映射（用于错误提示）
const FIELD_NAME_MAP: Record<string, string> = {
  project_name: '项目名称',
  settlement_amount: '结算金额',
  report_date: '报量日期',
};

interface ImportRow {
  project_name: string;
  settlement_amount: string;
  invoice_amount?: string;
  deduction_amount?: string;
  proportional_payment?: string;
  report_date: string;
  remark?: string;
}

// 验证必填字段（返回中文错误信息）
function validateRequiredFieldsCN(
  data: Record<string, unknown>[],
  requiredFields: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  data.forEach((row, index) => {
    requiredFields.forEach((field) => {
      const value = row[field];
      if (value === undefined || value === null || value === '') {
        const fieldName = FIELD_NAME_MAP[field] || field;
        errors.push(`第 ${index + 2} 行：「${fieldName}」不能为空`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    // 检查文件类型
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return NextResponse.json({ error: '请上传 Excel 文件（.xlsx, .xls）或 CSV 文件' }, { status: 400 });
    }

    // 解析 Excel 文件
    const rows = await parseExcelFile<ImportRow>(file, IMPORT_HEADER_MAP);

    if (rows.length === 0) {
      return NextResponse.json({ error: '文件内容为空' }, { status: 400 });
    }

    // 检查是否有必填的列名
    const firstRow = rows[0] as unknown as Record<string, unknown>;
    const missingColumns: string[] = [];
    REQUIRED_FIELDS_DB.forEach((field) => {
      if (firstRow[field] === undefined) {
        missingColumns.push(FIELD_NAME_MAP[field]);
      }
    });
    
    if (missingColumns.length > 0) {
      return NextResponse.json({ 
        error: `Excel 文件缺少必要的列：${missingColumns.join('、')}。请下载最新模板后再试。`, 
      }, { status: 400 });
    }

    // 验证必填字段
    const validation = validateRequiredFieldsCN(rows as unknown as Record<string, unknown>[], REQUIRED_FIELDS_DB);
    if (!validation.valid) {
      return NextResponse.json({ 
        error: '数据验证失败', 
        details: validation.errors.slice(0, 10) // 最多显示10条错误
      }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取项目列表用于匹配项目名称
    const { data: projects, error: projectsError } = await client
      .from('projects')
      .select('id, name');

    if (projectsError) {
      throw new Error(`获取项目列表失败: ${projectsError.message}`);
    }

    // 创建项目名称到 ID 的映射
    const projectNameToId = new Map<string, number>();
    projects?.forEach((p: any) => {
      projectNameToId.set(p.name, p.id);
    });

    // 准备导入数据
    const records: any[] = [];
    const errors: string[] = [];

    rows.forEach((row, index) => {
      const projectId = projectNameToId.get(row.project_name);
      
      if (!projectId) {
        errors.push(`第 ${index + 2} 行：项目「${row.project_name}」不存在`);
        return;
      }

      // 验证金额格式
      const settlementAmount = parseFloat(row.settlement_amount);
      if (isNaN(settlementAmount)) {
        errors.push(`第 ${index + 2} 行：结算金额格式错误`);
        return;
      }

      // 验证日期格式
      const reportDate = row.report_date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
        errors.push(`第 ${index + 2} 行：报量日期格式错误，应为 YYYY-MM-DD`);
        return;
      }

      records.push({
        project_id: projectId,
        settlement_amount: settlementAmount.toString(),
        invoice_amount: row.invoice_amount ? parseFloat(row.invoice_amount).toString() : '0',
        deduction_amount: row.deduction_amount ? parseFloat(row.deduction_amount).toString() : '0',
        proportional_payment: row.proportional_payment ? parseFloat(row.proportional_payment).toString() : '0',
        report_date: reportDate,
        remark: row.remark || '',
      });
    });

    if (errors.length > 0) {
      return NextResponse.json({ 
        error: '数据验证失败', 
        details: errors 
      }, { status: 400 });
    }

    if (records.length === 0) {
      return NextResponse.json({ error: '没有有效的数据可导入' }, { status: 400 });
    }

    // 批量插入
    const { data, error } = await insertWithSequenceFix('client_reports', records, client);

    if (error) {
      // 如果新字段不存在，尝试使用旧字段结构
      if (error.message.includes('column') || error.message.includes('does not exist')) {
        const legacyRecords = records.map((r) => ({
          project_id: r.project_id,
          report_amount: r.settlement_amount,
          report_date: r.report_date,
          remark: r.remark,
        }));

        const { data: legacyData, error: legacyError } = await client
          .from('client_reports')
          .insert(legacyRecords)
          .select();

        if (legacyError) {
          throw new Error(`导入失败: ${legacyError.message}`);
        }

        return NextResponse.json({ 
          success: true, 
          count: legacyData?.length || legacyRecords.length,
          reports: legacyData 
        });
      }
      throw new Error(`导入失败: ${error.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      count: data?.length || records.length,
      reports: data 
    });
  } catch (error: any) {
    console.error('Import Error:', error);
    return NextResponse.json(
      { error: error.message || '导入失败' },
      { status: 500 }
    );
  }
}
