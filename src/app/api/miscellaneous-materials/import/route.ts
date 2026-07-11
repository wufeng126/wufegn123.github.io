import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv');

    let rows: string[][] = [];

    if (isCsv) {
      // CSV 文件：纯文本解析
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      rows = lines.map(line => line.split(/[,;\t]/).map(v => v.trim().replace(/^"|"$/g, '')));
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // Excel 文件：使用 xlsx 库解析
      const buffer = await file.arrayBuffer();
      const XLSX = require('xlsx');
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      rows = jsonData.map((row: any[]) => row.map((cell: any) => String(cell ?? '').trim()));
    } else {
      return NextResponse.json({ error: '请上传 Excel 文件（.xlsx, .xls）或 CSV 文件' }, { status: 400 });
    }

    if (rows.length < 2) {
      return NextResponse.json({ error: '文件内容为空或格式不正确' }, { status: 400 });
    }

    // 清洗字符串：去除隐藏字符
    const sanitize = (s: string): string => {
      if (!s) return '';
      return String(s).replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2028\u2029\u202F\u205F\u3000]/g, '').trim();
    };

    // 自动检测表头行
    const nameKw = ['项目名称', '项目', '材料名称', '材料'];
    let headerRowIndex = 0;
    let headers = rows[0].map(sanitize);
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const sanitized = rows[r].map(sanitize);
      if (sanitized.some(h => nameKw.some(k => h.includes(k) || k.includes(h)))) {
        headerRowIndex = r;
        headers = sanitized;
        break;
      }
    }

    const stripToChinese = (s: string): string => s.replace(/[^\u4e00-\u9fff]/g, '');

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

    const projectIdx = findIndex(['项目名称', '项目']);
    const materialIdx = findIndex(['材料名称', '材料']);
    const specIdx = findIndex(['规格型号', '规格']);
    const unitIdx = findIndex(['单位']);
    const quantityIdx = findIndex(['数量']);
    const priceIdx = findIndex(['单价']);
    const amountIdx = findIndex(['金额']);
    const dateIdx = findIndex(['采购日期', '日期']);
    const purchaserIdx = findIndex(['采购人']);
    const remarkIdx = findIndex(['备注']);

    if (projectIdx < 0 || materialIdx < 0) {
      return NextResponse.json({ error: '文件缺少必要列：项目名称、材料名称' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { data: projects, error: projectError } = await client
      .from('projects')
      .select('id, name');

    if (projectError) {
      throw new Error(`查询项目失败: ${projectError.message}`);
    }

    const projectNameMap: Record<string, number> = {};
    projects?.forEach((p: any) => {
      projectNameMap[p.name] = p.id;
    });

    const records: any[] = [];
    const errors: string[] = [];
    const duplicates: string[] = [];

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const values = rows[i];

      // 跳过全空行
      if (!values.some(v => v && v.trim())) continue;

      const projectName = values[projectIdx] || '';
      const materialName = values[materialIdx] || '';

      if (!projectName.trim() || !materialName.trim()) {
        errors.push(`第${i + 1}行：缺少项目名称或材料名称`);
        continue;
      }

      const projectId = projectNameMap[projectName.trim()];
      if (!projectId) {
        errors.push(`第${i + 1}行：项目"${projectName.trim()}"不存在`);
        continue;
      }

      const quantity = parseFloat(values[quantityIdx]) || 0;
      const unitPrice = parseFloat(values[priceIdx]) || 0;
      let amount = parseFloat(values[amountIdx]) || 0;
      
      if (amount === 0 && quantity > 0 && unitPrice > 0) {
        amount = Math.round(quantity * unitPrice * 100) / 100;
      }

      if (amount === 0) {
        errors.push(`第${i + 1}行：金额为空且无法计算`);
        continue;
      }

      // 处理日期格式 - Excel 可能返回数字序列号
      let purchaseDate = values[dateIdx] || '';
      if (purchaseDate && /^\d{5}$/.test(purchaseDate)) {
        // Excel 日期序列号转换
        const excelEpoch = new Date(1899, 11, 30);
        const jsDate = new Date(excelEpoch.getTime() + parseInt(purchaseDate) * 86400000);
        purchaseDate = jsDate.toISOString().split('T')[0];
      } else if (purchaseDate) {
        // 尝试解析常见日期格式
        const parsed = new Date(purchaseDate);
        if (!isNaN(parsed.getTime())) {
          purchaseDate = parsed.toISOString().split('T')[0];
        }
      }
      if (!purchaseDate) {
        purchaseDate = new Date().toISOString().split('T')[0];
      }
      
      const duplicateKey = `${projectId}-${materialName.trim()}-${purchaseDate}-${amount}`;
      if (duplicates.includes(duplicateKey)) {
        errors.push(`第${i + 1}行：可能为重复数据`);
        continue;
      }
      duplicates.push(duplicateKey);

      records.push({
        project_id: projectId,
        material_name: materialName.trim(),
        specification: values[specIdx] || null,
        unit: values[unitIdx] || null,
        quantity,
        unit_price: unitPrice,
        amount,
        purchase_date: purchaseDate,
        purchaser: values[purchaserIdx] || null,
        remark: values[remarkIdx] || null,
      });
    }

    if (records.length === 0) {
      return NextResponse.json({ 
        error: '没有有效的数据可导入',
        details: errors 
      }, { status: 400 });
    }

    const { data, error } = await insertWithSequenceFix('miscellaneous_materials', records, client);

    if (error) {
      throw new Error(`导入失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'import',
      resourceType: 'miscellaneous_material',
      resourceId: 0,
      details: { count: data?.length || 0, file_name: file.name },
      request,
    });

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Import Error:', error);
    return NextResponse.json(
      { error: error.message || '导入失败' },
      { status: 500 }
    );
  }
}
