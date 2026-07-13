import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseExcelFile } from '@/lib/excel-utils';
import { insertWithSequenceFix } from '@/lib/audit-log';
import { REVIEW_STATUS } from '@/lib/business-logic';
import { requireApiWritePermission } from '@/lib/api-auth';

// Excel 列名到数据库字段的映射
const IMPORT_HEADER_MAP: Record<string, string> = {
  '项目名称': 'project_name',
  '付款金额': 'payment_amount',
  '付款日期': 'payment_date',
  '付款方式': 'payment_method_text',
  '状态': 'status_text',
  '备注': 'remark',
};

// 必填字段（数据库字段名）
const REQUIRED_FIELDS_DB = ['project_name', 'payment_amount', 'payment_date'];

// 字段名映射（用于错误提示）
const FIELD_NAME_MAP: Record<string, string> = {
  project_name: '项目名称',
  payment_amount: '付款金额',
  payment_date: '付款日期',
};

// 付款方式映射
const PAYMENT_METHOD_MAP: Record<string, string> = {
  '银行转账': 'bank_transfer',
  '现金': 'cash',
  '支票': 'check',
  '其他': 'other',
  'bank_transfer': 'bank_transfer',
  'cash': 'cash',
  'check': 'check',
  'other': 'other',
};

// 状态映射
const STATUS_MAP: Record<string, string> = {
  '已完成': 'completed',
  '待确认': 'pending',
  '已取消': 'cancelled',
  'completed': 'completed',
  'pending': 'pending',
  'cancelled': 'cancelled',
  'draft': REVIEW_STATUS.DRAFT,
  'reviewed': REVIEW_STATUS.REVIEWED,
  'voided': REVIEW_STATUS.VOIDED,
};

interface ImportRow {
  project_name: string;
  payment_amount: string;
  payment_date: string;
  payment_method_text?: string;
  status_text?: string;
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

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
      const paymentAmount = parseFloat(row.payment_amount);
      if (isNaN(paymentAmount)) {
        errors.push(`第 ${index + 2} 行：付款金额格式错误`);
        return;
      }

      // 验证日期格式
      const paymentDate = row.payment_date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        errors.push(`第 ${index + 2} 行：付款日期格式错误，应为 YYYY-MM-DD`);
        return;
      }

      // 转换付款方式和状态
      const paymentMethod = PAYMENT_METHOD_MAP[row.payment_method_text || ''] || 'bank_transfer';
      const status = STATUS_MAP[row.status_text || ''] || 'completed';

      records.push({
        project_id: projectId,
        payment_amount: paymentAmount.toString(),
        payment_date: paymentDate,
        payment_method: paymentMethod,
        status: status,
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
    const { data, error } = await insertWithSequenceFix('client_payments', records, client);

    if (error) {
      throw new Error(`导入失败: ${error.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      count: data?.length || records.length,
      payments: data 
    });
  } catch (error: any) {
    console.error('Import Error:', error);
    return NextResponse.json(
      { error: error.message || '导入失败' },
      { status: 500 }
    );
  }
}
