import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { REVIEW_STATUS } from '@/lib/business-logic';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { invalidateAggregationCache } from '@/lib/data-aggregation';
import {
  calculateMiscellaneousMaterialAmount,
  parsePositiveMiscellaneousMaterialNumber,
} from '@/lib/miscellaneous-materials';
import { DEFAULT_MISC_CATEGORY, guessMiscCategory, isValidSubcategory, MISC_CATEGORY_VALUES, type MiscMaterialCategory } from '@/lib/misc-material-categories';
import { isVoidedStatus } from '@/lib/review-status';

type XlsxModule = {
  read: (data: Uint8Array, options: { type: 'array' }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (worksheet: unknown, options: { header: 1 }) => unknown[][];
  };
};

type ProjectRow = {
  id: number;
  name: string;
};

type MiscellaneousMaterialImportRecord = {
  project_id: number;
  material_name: string;
  specification: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  purchase_date: string;
  purchaser: string | null;
  remark: string | null;
  category: string;
  subcategory: string | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

/**
 * 将导入单元格中的日期归一化为 YYYY-MM-DD。
 * 容错：Date 对象、Excel 5 位序列号、时间戳、YYYY-MM-DD、YYYY/MM/DD、YYYYMMDD、
 * YYYY年M月D日（允许空格），以及模板被 Excel 破坏产生的畸形串
 * （如 "202504-05-01" / "2025-0405-01" / "2025040501"，多余位多为粘连的小时）。
 * 任何无法可靠识别的输入返回 null，绝不抛错（避免 new Date 误判时区偏移后
 * toISOString 抛 RangeError: time zone displacement out of range 崩掉整批导入）。
 */
function normalizeImportDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;

  // xlsx 在 cellDates 模式下可能直接返回 Date 对象
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0];
  }

  let s = String(raw).trim();
  if (!s) return null;

  // 纯数字：Excel 日期序列号（5 位）或毫秒时间戳（12-13 位）
  if (/^\d+$/.test(s)) {
    if (s.length === 5) {
      return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().split('T')[0];
    }
    if (s.length >= 12 && s.length <= 13) {
      const ms = new Date(Number(s));
      if (!Number.isNaN(ms.getTime())) return ms.toISOString().split('T')[0];
    }
  }

  // 中文日期：2025年4月5日 / 2025 年 4 月 5 日（保留空格，不预先截断）
  const cnMatch = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(s);
  if (cnMatch) {
    const iso = toIsoDate(cnMatch[1], cnMatch[2], cnMatch[3]);
    if (iso) return iso;
  }

  // 截取可能附带的时间部分（ISO 或 "2025-04-05 00:00:00"），仅当日期本身是分隔格式时
  const datePart = s.split(/[ Tt]/)[0] || s;

  // 标准分隔：YYYY-MM-DD / YYYY/M/D / YYYY.M.D（严格 3 段）
  const sepMatch = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/.exec(datePart);
  if (sepMatch) {
    const iso = toIsoDate(sepMatch[1], sepMatch[2], sepMatch[3]);
    if (iso) return iso;
  }

  // 紧凑/畸形数字串：Excel 有时会在日期里插入多余分隔符或粘连小时，
  // 如 "202504-05-01"→["202504","05","01"]、"2025-0405-01"→["2025","0405","01"]、
  // "2025040501"→["2025040501"]（8 位日期 + 2 位小时）。
  const segments = s.match(/\d+/g);
  if (segments) {
    const yearIdx = segments.findIndex(seg =>
      /^\d{4}/.test(seg) && Number(seg.slice(0, 4)) >= 1900 && Number(seg.slice(0, 4)) <= 2100,
    );
    if (yearIdx >= 0) {
      const seg = segments[yearIdx];
      const year = seg.slice(0, 4);
      // 年份段内可能粘连月份（如 202504），把年之后的数字全部拼成"月日+多余位"
      const tailDigits = seg.slice(4) + segments.slice(yearIdx + 1).join('');
      const iso = pickMonthDay(year, tailDigits);
      if (iso) return iso;
    }
    // 纯 8 位连续数字 YYYYMMDD
    const joined = segments.join('');
    const m8 = /^(\d{4})(\d{2})(\d{2})$/.exec(joined);
    if (m8) {
      const iso = toIsoDate(m8[1], m8[2], m8[3]);
      if (iso) return iso;
    }
  }

  return null;
}

/**
 * 从年份之后的数字串中切分月日。
 * 4 位→MMDD；3 位→MDD/MMD；5-6 位（日期后粘连小时/分钟）→取前 4 位 MMDD。
 */
function pickMonthDay(year: string, tail: string): string | null {
  if (!tail) return null;
  const candidates: Array<[string, string]> = [];
  if (tail.length === 4) {
    candidates.push([tail.slice(0, 2), tail.slice(2, 4)]);
  } else if (tail.length === 3) {
    candidates.push([tail.slice(0, 1), tail.slice(1, 3)]);
    candidates.push([tail.slice(0, 2), tail.slice(2, 3)]);
  } else if (tail.length >= 5) {
    // 粘连了小时/分钟（如 040501=04-05 +01 时），优先按前 4 位 MMDD
    candidates.push([tail.slice(0, 2), tail.slice(2, 4)]);
  }
  for (const [m, d] of candidates) {
    const iso = toIsoDate(year, m, d);
    if (iso) return iso;
  }
  return null;
}

/** 组装并校验合法公历日期，非法（如 13 月、32 日）返回 null */
function toIsoDate(yearStr: string, monthStr: string, dayStr: string): string | null {
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  // 用 Date.UTC 反向校验，防止 2 月 30 日等不存在日期
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${paddedMonth}-${paddedDay}`;
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
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '文件不能超过 10MB' }, { status: 400 });
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 条件加载 xlsx（仅 Excel 文件）
      const XLSX = require('xlsx') as XlsxModule;
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      rows = jsonData.map((row) => row.map((cell) => String(cell ?? '').trim()));
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
    const dateIdx = findIndex(['采购日期', '日期']);
    const purchaserIdx = findIndex(['采购人']);
    const remarkIdx = findIndex(['备注']);
    const categoryIdx = findIndex(['材料分类', '分类', '类别']);
    const subcategoryIdx = findIndex(['材料子类', '子类', '子类别']);

    if (projectIdx < 0 || materialIdx < 0 || quantityIdx < 0 || priceIdx < 0) {
      return NextResponse.json(
        { error: '文件缺少必要列：项目名称、材料名称、数量、单价' },
        { status: 400 },
      );
    }

    const client = getSupabaseClient();
    
    const { data: projects, error: projectError } = await client
      .from('projects')
      .select('id, name');

    if (projectError) {
      throw new Error(`查询项目失败: ${projectError.message}`);
    }

    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects !== null && accessibleProjects.length === 0) {
      return NextResponse.json({ error: '当前账号没有可导入的项目' }, { status: 403 });
    }

    const projectNameMap: Record<string, number> = {};
    ((projects || []) as ProjectRow[]).forEach((p) => {
      if (!accessibleProjects || accessibleProjects.includes(p.id)) {
        projectNameMap[p.name] = p.id;
      }
    });

    const records: MiscellaneousMaterialImportRecord[] = [];
    const errors: string[] = [];

    // 重复判定键：项目 + 材料名称 + 采购日期 + 数量 + 单价（金额 = 数量 × 单价）。
    // 仅当以上字段完全一致才视为重复；金额（数量/单价）或采购日期不同视为新记录，允许导入。
    // 已作废记录不参与查重（作废即视为该笔业务不再有效，重新录入同名同额材料应放行）。
    const buildDupKey = (
      pId: number | string,
      name: string,
      date: string,
      qty: number | string,
      price: number | string
    ): string => `${pId}__${name.trim()}__${date}__${Number(qty)}__${Number(price)}`;

    // 预加载库中可访问范围内的非作废记录，构建查重集，防止同一文件重复导入 / 分批导入造成重复落库。
    const seenDupKeys = new Set<string>();
    {
      let existingQuery = client
        .from('miscellaneous_materials')
        .select('project_id, material_name, purchase_date, quantity, unit_price, status');
      if (accessibleProjects !== null) {
        existingQuery = existingQuery.in('project_id', accessibleProjects);
      }
      const { data: existingRows, error: existingError } = await existingQuery;
      if (existingError) {
        throw new Error(`查询已有零星材料失败: ${existingError.message}`);
      }
      (existingRows || []).forEach((row: {
        project_id: number;
        material_name: string;
        purchase_date: string;
        quantity: number;
        unit_price: number;
        status?: string | null;
      }) => {
        if (isVoidedStatus(row.status || undefined)) return;
        const datePart = String(row.purchase_date || '').slice(0, 10);
        seenDupKeys.add(buildDupKey(row.project_id, row.material_name || '', datePart, row.quantity, row.unit_price));
      });
    }

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
        errors.push(`第${i + 1}行：项目"${projectName.trim()}"不存在或无权限导入`);
        continue;
      }

      const quantity = parsePositiveMiscellaneousMaterialNumber(values[quantityIdx]);
      if (quantity === null) {
        errors.push(`第${i + 1}行：数量必须是大于0的数字`);
        continue;
      }

      const unitPrice = parsePositiveMiscellaneousMaterialNumber(values[priceIdx]);
      if (unitPrice === null) {
        errors.push(`第${i + 1}行：单价必须是大于0的数字`);
        continue;
      }

      const amount = calculateMiscellaneousMaterialAmount(quantity, unitPrice);

      // 处理日期格式 - Excel 可能返回数字序列号，模板也可能出现被破坏的畸形日期串。
      // 禁止用裸 new Date(str)：像 "202504-05-01" 会被当成 ISO 时区偏移 "+202504"，
      // 随后 toISOString() 抛 RangeError（time zone displacement out of range）导致整批导入失败。
      let purchaseDate = normalizeImportDate(values[dateIdx]);
      if (!purchaseDate) {
        purchaseDate = new Date().toISOString().split('T')[0];
      }
      
      const duplicateKey = buildDupKey(projectId, materialName, purchaseDate, quantity, unitPrice);
      if (seenDupKeys.has(duplicateKey)) {
        errors.push(`第${i + 1}行：与已有记录重复（同项目、同材料、同日期、同数量单价），如需重复录入请修改金额或日期`);
        continue;
      }
      seenDupKeys.add(duplicateKey);

      const trimmedMaterialName = materialName.trim();
      // 分类（两级）：分类列支持"一级/二级"组合文本；子类列独立指定；
      // 均无法识别时按材料名推断（guessMiscCategory 返回一级+二级）
      const rawCategoryCell = categoryIdx >= 0 ? (values[categoryIdx] || '').trim() : '';
      const rawSubcategory = subcategoryIdx >= 0 ? (values[subcategoryIdx] || '').trim() : '';
      // 拆分"一级/二级"或"一级-二级"组合写法
      let rawCategory = rawCategoryCell;
      let subFromCell = '';
      const splitMatch = rawCategoryCell.match(/^([^/\-—]+)[/\-—](.+)$/);
      if (splitMatch) {
        rawCategory = splitMatch[1].trim();
        subFromCell = splitMatch[2].trim();
      }
      const guessed = guessMiscCategory(trimmedMaterialName);
      let finalCategory: MiscMaterialCategory = guessed.category;
      let finalSubcategory: string | null = guessed.subcategory;
      if (rawCategory) {
        let matched: MiscMaterialCategory | null = null;
        if (MISC_CATEGORY_VALUES.includes(rawCategory as MiscMaterialCategory)) {
          matched = rawCategory as MiscMaterialCategory;
        } else {
          const fuzzy = MISC_CATEGORY_VALUES.find(c => c.includes(rawCategory) || rawCategory.includes(c));
          if (fuzzy) matched = fuzzy;
        }
        if (matched) {
          finalCategory = matched;
          // 一级被显式指定后，仅保留仍属于该一级的推断子类
          finalSubcategory = finalSubcategory && isValidSubcategory(matched, finalSubcategory) ? finalSubcategory : null;
        }
      }
      // 显式子类（独立列或"一级/二级"组合中的二级部分）优先，必须属于最终一级
      const explicitSub = rawSubcategory || subFromCell;
      if (explicitSub) {
        finalSubcategory = isValidSubcategory(finalCategory, explicitSub) ? explicitSub : finalSubcategory;
      }

      records.push({
        project_id: projectId,
        material_name: trimmedMaterialName,
        specification: values[specIdx] || null,
        unit: values[unitIdx] || null,
        quantity,
        unit_price: unitPrice,
        amount,
        purchase_date: purchaseDate,
        purchaser: values[purchaserIdx] || null,
        remark: values[remarkIdx] || null,
        category: finalCategory || DEFAULT_MISC_CATEGORY,
        subcategory: finalSubcategory,
        // 零星材料免审核：导入即已审核并计入成本
        status: REVIEW_STATUS.REVIEWED,
        reviewed_at: new Date().toISOString(),
        reviewed_by: auth.user.name || auth.user.username || 'system',
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

    invalidateAggregationCache();

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
  } catch (error: unknown) {
    console.error('Import Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}
