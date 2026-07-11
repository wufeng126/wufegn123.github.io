import * as XLSX from 'xlsx';

/**
 * 去除字符串中的 BOM 标记
 */
function stripBOM(str: string): string {
  return str.replace(/^\ufeff/, '');
}

/**
 * 解析 Excel 文件为 JSON 数据
 * @param file 上传的文件
 * @param headerMap 字段映射配置 { Excel列名: 数据库字段名 }
 * @returns 解析后的数据数组
 */
export async function parseExcelFile<T>(
  file: File,
  headerMap?: Record<string, string>
): Promise<T[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  // 获取第一个工作表
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // 转换为 JSON
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: '',
  });

  if (jsonData.length === 0) {
    return [];
  }

  // 如果有字段映射，进行字段名转换
  if (headerMap) {
    return jsonData.map((row) => {
      const mappedRow: Record<string, unknown> = {};
      for (const [excelHeader, dbField] of Object.entries(headerMap)) {
        // 尝试匹配原始列名和去除 BOM 的列名
        let value = row[excelHeader];
        if (value === undefined) {
          // 尝试去除 BOM 后匹配
          for (const [rowKey, rowValue] of Object.entries(row)) {
            if (stripBOM(rowKey) === excelHeader) {
              value = rowValue;
              break;
            }
          }
        }
        if (value !== undefined) {
          mappedRow[dbField] = value;
        }
      }
      // 保留未映射的字段
      for (const [key, value] of Object.entries(row)) {
        const cleanKey = stripBOM(key);
        if (!(cleanKey in headerMap) && !(key in headerMap)) {
          mappedRow[cleanKey] = value;
        }
      }
      return mappedRow as T;
    });
  }

  // 去除所有列名的 BOM
  return jsonData.map((row) => {
    const cleanRow: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      cleanRow[stripBOM(key)] = value;
    }
    return cleanRow as T;
  });
}

/**
 * 将数据导出为 Excel 文件
 * @param data 要导出的数据
 * @param headers 表头配置 { 数据库字段名: Excel列名 }
 * @param fileName 文件名（不含扩展名）
 * @returns Excel 文件的 Uint8Array
 */
export function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  headers: Record<string, string>,
  fileName: string
): Uint8Array {
  // 转换数据格式
  const exportData = data.map((row) => {
    const mappedRow: Record<string, unknown> = {};
    for (const [dbField, excelHeader] of Object.entries(headers)) {
      mappedRow[excelHeader] = row[dbField] ?? '';
    }
    return mappedRow;
  });

  // 创建工作表
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  
  // 设置列宽
  const colWidths = Object.values(headers).map((header) => ({
    wch: Math.max(header.length * 2, 15),
  }));
  worksheet['!cols'] = colWidths;

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // 生成 Uint8Array
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(buffer);
}

/**
 * 生成 Excel 模板
 * @param headers 表头配置 { 数据库字段名: Excel列名 }
 * @param exampleData 示例数据（可选）
 * @returns Excel 文件的 Uint8Array
 */
export function generateExcelTemplate(
  headers: Record<string, string>,
  exampleData?: Record<string, unknown>[]
): Uint8Array {
  // 创建表头行
  const headerRow: Record<string, string> = {};
  for (const [, excelHeader] of Object.entries(headers)) {
    headerRow[excelHeader] = '';
  }

  // 合并表头和示例数据
  const data = exampleData ? 
    exampleData.map((row) => {
      const mappedRow: Record<string, unknown> = {};
      for (const [dbField, excelHeader] of Object.entries(headers)) {
        mappedRow[excelHeader] = row[dbField] ?? '';
      }
      return mappedRow;
    }) : 
    [headerRow];

  // 创建工作表
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // 设置列宽
  const colWidths = Object.values(headers).map((header) => ({
    wch: Math.max(header.length * 2, 15),
  }));
  worksheet['!cols'] = colWidths;

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // 生成 Uint8Array
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(buffer);
}

/**
 * 验证必填字段
 * @param data 数据
 * @param requiredFields 必填字段列表
 * @returns 验证结果和错误信息
 */
export function validateRequiredFields(
  data: Record<string, unknown>[],
  requiredFields: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  data.forEach((row, index) => {
    requiredFields.forEach((field) => {
      const value = row[field];
      if (value === undefined || value === null || value === '') {
        errors.push(`第 ${index + 2} 行：${field} 不能为空`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
