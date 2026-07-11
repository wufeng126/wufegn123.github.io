import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseExcelFile } from '@/lib/excel-utils';

// Excel 列名到数据库字段的映射
const IMPORT_HEADER_MAP: Record<string, string> = {
  '供应商名称': 'supplier_name',
  '供应商类型': 'supplier_type',
  '项目名称': 'project_name',
  '结算类型': 'settlement_type',
  '结算内容': 'settlement_content',
  '结算数量': 'settlement_quantity',
  '单位': 'settlement_unit',
  '结算金额': 'settlement_amount',
  '结算月份': 'settlement_month',
  '结算日期': 'settlement_date',
  '备注': 'remark',
};

// 必填字段（数据库字段名）
const REQUIRED_FIELDS_DB = ['supplier_name', 'settlement_amount', 'settlement_month'];

// 字段名映射（用于错误提示）
const FIELD_NAME_MAP: Record<string, string> = {
  supplier_name: '供应商名称',
  settlement_amount: '结算金额',
  settlement_month: '结算月份',
};

interface ImportRow {
  supplier_name: string;
  supplier_type?: string;
  project_name?: string;
  settlement_type?: string;
  settlement_content?: string;
  settlement_quantity?: string;
  settlement_unit?: string;
  settlement_amount: string;
  settlement_month: string;
  settlement_date?: string;
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

    // 获取供应商列表
    const { data: suppliers, error: suppliersError } = await client
      .from('suppliers')
      .select('id, name');

    if (suppliersError) {
      throw new Error(`获取供应商列表失败: ${suppliersError.message}`);
    }

    // 获取项目列表
    const { data: projects, error: projectsError } = await client
      .from('projects')
      .select('id, name');

    if (projectsError) {
      throw new Error(`获取项目列表失败: ${projectsError.message}`);
    }

    // 创建名称到 ID 的映射
    const supplierNameToId = new Map<string, number>();
    suppliers?.forEach((s: any) => {
      supplierNameToId.set(s.name, s.id);
    });

    const projectNameToId = new Map<string, number>();
    projects?.forEach((p: any) => {
      projectNameToId.set(p.name, p.id);
    });

    // 准备导入数据
    const records: any[] = [];
    const errors: string[] = [];

    rows.forEach((row, index) => {
      const supplierId = supplierNameToId.get(row.supplier_name);
      
      if (!supplierId) {
        errors.push(`第 ${index + 2} 行：供应商「${row.supplier_name}」不存在`);
        return;
      }

      // 验证金额格式
      const settlementAmount = parseFloat(row.settlement_amount);
      if (isNaN(settlementAmount)) {
        errors.push(`第 ${index + 2} 行：结算金额格式错误`);
        return;
      }

      // 验证月份格式 (YYYY-MM)
      const settlementMonth = row.settlement_month;
      if (!/^\d{4}-\d{2}$/.test(settlementMonth)) {
        errors.push(`第 ${index + 2} 行：结算月份格式错误，应为 YYYY-MM`);
        return;
      }

      // 验证日期格式 (可选)
      let settlementDate = row.settlement_date || null;
      if (settlementDate && !/^\d{4}-\d{2}-\d{2}$/.test(settlementDate)) {
        // 尝试解析 Excel 日期数字
        const dateNum = parseFloat(settlementDate);
        if (!isNaN(dateNum)) {
          // Excel 日期序列号转换
          const excelEpoch = new Date(1899, 11, 30);
          settlementDate = new Date(excelEpoch.getTime() + dateNum * 86400000).toISOString().split('T')[0];
        } else {
          errors.push(`第 ${index + 2} 行：结算日期格式错误，应为 YYYY-MM-DD`);
          return;
        }
      }

      // 获取项目 ID（可选）
      const projectId = row.project_name ? projectNameToId.get(row.project_name) : null;

      // 处理结算数量
      let settlementQuantity = null;
      if (row.settlement_quantity) {
        const num = parseFloat(row.settlement_quantity);
        if (!isNaN(num)) {
          settlementQuantity = num;
        }
      }

      records.push({
        supplier_id: supplierId,
        project_id: projectId,
        settlement_type: row.settlement_type || null,
        settlement_content: row.settlement_content || null,
        settlement_quantity: settlementQuantity,
        settlement_unit: row.settlement_unit || null,
        settlement_amount: settlementAmount,
        settlement_month: settlementMonth,
        settlement_date: settlementDate,
        remark: row.remark || null,
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
    const { data, error } = await client
      .from('settlements')
      .insert(records)
      .select();

    if (error) {
      throw new Error(`导入失败: ${error.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      count: data?.length || records.length,
      settlements: data 
    });
  } catch (error: any) {
    console.error('Import Error:', error);
    return NextResponse.json(
      { error: error.message || '导入失败' },
      { status: 500 }
    );
  }
}
