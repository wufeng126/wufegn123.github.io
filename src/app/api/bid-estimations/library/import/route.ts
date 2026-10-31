import { NextRequest } from 'next/server';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 历史中标价批量导入
 *
 * 前端把 Excel 解析成行后调用本接口：
 * - 优先按「标准清单编码」匹配
 * - 其次按标准清单名称 / 别名精确匹配
 * - 再按包含关系模糊匹配
 * - 都匹配不上时自动新建标准清单（编码 HIS-xxx），保证历史价不丢
 */
type ImportRow = {
  code?: string;
  /** 人工指定的标准清单 ID（同名不同叫法时由用户在预览里选） */
  standard_item_id?: number;
  standard_name?: string;
  unit?: string;
  price?: number | string;
  bid_year?: number | string;
  project_name?: string;
  region?: string;
  project_type?: string;
  material_included?: boolean | string;
  remark?: string;
};

function normalizeName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[（）()【】\[\]｛｝{}]/g, '')
    .replace(/[\s,，、.。:：;；\-—_/\\]/g, '')
    .trim();
}

function toPrice(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[¥￥,\s元]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  return ['是', '含', '含材料', 'true', 'yes', '1', 'y'].includes(text);
}

function toYear(value: unknown): number | null {
  const match = String(value ?? '').match(/(19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  return year >= 1990 && year <= 2100 ? year : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return apiBadRequest('没有可导入的数据');
    if (rows.length > 5000) return apiBadRequest('单次最多导入 5000 行');

    const supabase = getSupabaseClient();

    const [{ data: standards }, { data: aliases }] = await Promise.all([
      supabase.from('bid_standard_items').select('id, code, name, unit'),
      supabase.from('bid_item_aliases').select('standard_item_id, alias_name'),
    ]);

    type Standard = { id: number; code: string; name: string; unit: string | null };
    const standardList = (standards || []) as Standard[];
    const byCode = new Map<string, Standard>();
    const byName = new Map<string, Standard>();
    standardList.forEach((item) => {
      if (item.code) byCode.set(String(item.code).trim().toUpperCase(), item);
      const key = normalizeName(item.name);
      if (key && !byName.has(key)) byName.set(key, item);
    });
    (aliases || []).forEach((alias: { standard_item_id?: unknown; alias_name?: unknown }) => {
      const key = normalizeName(String(alias.alias_name || ''));
      const target = standardList.find((item) => item.id === Number(alias.standard_item_id));
      if (key && target && !byName.has(key)) byName.set(key, target);
    });

    let createdStandards = 0;
    let imported = 0;
    const errors: string[] = [];
    const pendingStandards: Array<{ code: string; name: string; unit: string | null }> = [];

    // 第一轮：确定每行归属的标准清单
    const resolved: Array<{ standard: Standard | null; row: ImportRow; price: number; rowIndex: number }> = [];
    rows.forEach((row, index) => {
      const price = toPrice(row.price);
      const name = String(row.standard_name || '').trim();
      if (!name) {
        errors.push(`第 ${index + 1} 行：清单项名称为空，已跳过`);
        return;
      }
      if (!(price > 0)) {
        errors.push(`第 ${index + 1} 行「${name}」：单价为空或不是正数，已跳过`);
        return;
      }

      const manualId = Number(row.standard_item_id) || 0;
      if (manualId > 0) {
        const manualStandard = standardList.find((item) => item.id === manualId) || null;
        resolved.push({ standard: manualStandard, row, price, rowIndex: index });
        return;
      }
      const code = String(row.code || '').trim().toUpperCase();
      let standard = code ? byCode.get(code) : undefined;
      if (!standard) {
        const key = normalizeName(name);
        standard = byName.get(key);
      }
      if (!standard) {
        // 宽松包含匹配：标准名包含在清单名里，或反过来
        const key = normalizeName(name);
        standard = standardList.find((item) => {
          const standardKey = normalizeName(item.name);
          if (!standardKey || !key) return false;
          return key.includes(standardKey) || standardKey.includes(key);
        });
      }
      resolved.push({ standard: standard || null, row, price, rowIndex: index });
    });

    // 第二轮：为没有归属的行创建标准清单
    for (const item of resolved) {
      if (item.standard) continue;
      const name = String(item.row.standard_name || '').trim();
      const generatedCode = `HIS-${Date.now().toString(36).toUpperCase()}-${pendingStandards.length + 1}`;
      const payload = {
        code: String(item.row.code || '').trim().toUpperCase() || generatedCode,
        name,
        unit: String(item.row.unit || '').trim() || null,
        status: 'active',
      };
      const { data: created, error } = await supabase
        .from('bid_standard_items')
        .insert(payload)
        .select('id, code, name, unit')
        .single();
      if (error || !created) {
        errors.push(`第 ${item.rowIndex + 1} 行「${name}」：新建标准清单失败（${error?.message || '未知错误'}）`);
        continue;
      }
      const standard = created as Standard;
      standardList.push(standard);
      byCode.set(String(standard.code).toUpperCase(), standard);
      byName.set(normalizeName(standard.name), standard);
      pendingStandards.push({ code: standard.code, name: standard.name, unit: standard.unit });
      createdStandards += 1;
      item.standard = standard;
    }

    // 记住"同一工作不同叫法"：把本次匹配上的原始名称存成别名，下次自动命中
    try {
      const aliasMap = new Map<string, { standard_item_id: number; alias_name: string; source_type: string }>();
      resolved.forEach((item) => {
        if (!item.standard) return;
        const original = String(item.row.standard_name || '').trim();
        if (!original) return;
        if (normalizeName(original) === normalizeName(item.standard.name)) return;
        const key = `${item.standard.id}|${normalizeName(original)}`;
        if (!aliasMap.has(key)) {
          aliasMap.set(key, { standard_item_id: item.standard.id, alias_name: original, source_type: 'import' });
        }
      });
      const aliasRows = Array.from(aliasMap.values());
      if (aliasRows.length > 0) {
        const { error: aliasError } = await supabase
          .from('bid_item_aliases')
          .upsert(aliasRows, { onConflict: 'standard_item_id,alias_name', ignoreDuplicates: true });
        if (aliasError) {
          errors.push(`别名保存失败（不影响历史价）：${aliasError.message}`);
        }
      }
    } catch (aliasError) {
      errors.push(`别名保存失败（不影响历史价）：${aliasError instanceof Error ? aliasError.message : '未知错误'}`);
    }
    // 第三轮：写入历史价
    const priceRows = resolved
      .filter((item) => item.standard)
      .map((item) => ({
        standard_item_id: item.standard!.id,
        project_name: String(item.row.project_name || '').trim() || null,
        region: String(item.row.region || '').trim() || null,
        project_type: String(item.row.project_type || '').trim() || null,
        item_original_name: String(item.row.standard_name || '').trim() || null,
        unit: String(item.row.unit || '').trim() || item.standard!.unit || null,
        price: item.price,
        bid_year: toYear(item.row.bid_year),
        material_included: toBool(item.row.material_included),
        remark: String(item.row.remark || '').trim() || null,
      }));

    for (let i = 0; i < priceRows.length; i += 200) {
      const chunk = priceRows.slice(i, i + 200);
      const { error } = await supabase.from('bid_price_history').insert(chunk);
      if (error) {
        errors.push(`写入历史价失败（第 ${i + 1}~${i + chunk.length} 条）：${error.message}`);
      } else {
        imported += chunk.length;
      }
    }

    return apiSuccess({
      imported,
      created_standards: createdStandards,
      skipped: rows.length - priceRows.length,
      errors: errors.slice(0, 20),
      new_standards: pendingStandards.slice(0, 50),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '历史中标价导入失败'));
  }
}
