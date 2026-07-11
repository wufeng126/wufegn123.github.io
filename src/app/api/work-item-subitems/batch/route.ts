import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix } from '@/lib/audit-log';

// 批量导入子项（支持 work_item_id 或 project_id 模式）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { work_item_id, project_id, subitems } = body;

    if (!subitems || !Array.isArray(subitems) || subitems.length === 0) {
      return NextResponse.json({ error: '请提供子项数据' }, { status: 400 });
    }

    if (!work_item_id && !project_id) {
      return NextResponse.json({ error: '需要提供 work_item_id 或 project_id' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 清理数值字段：提取前导数字部分，忽略后面的单位文字
    const cleanNumber = (val: unknown): number | null => {
      if (val == null || val === '') return null;
      const str = String(val).trim();
      // 匹配字符串开头的数字（含小数点和负号）
      const match = str.match(/^[-+]?\d*\.?\d+/);
      if (!match) return null;
      const num = Number(match[0]);
      return isNaN(num) ? null : num;
    };

    // 逐行校验，收集错误信息
    const errors: { row: number; message: string }[] = [];
    const validItems: Record<string, unknown>[] = [];

    subitems.forEach((item: Record<string, unknown>, idx: number) => {
      const rowNum = idx + 2; // Excel行号（第1行是表头）
      const name = item.subitem_name || item['子项名称'] || item['名称'] || '';
      const unit = item.unit || item['单位'] || '';
      const budgetQty = cleanNumber(item.budget_quantity || item['预算工程量'] || item['预算量']);

      if (!name) {
        errors.push({ row: rowNum, message: '分项名称为空' });
        return;
      }
      if (!unit) {
        errors.push({ row: rowNum, message: `单位为空（${name}）` });
        return;
      }
      if (budgetQty !== null && budgetQty < 0) {
        errors.push({ row: rowNum, message: `预算量为负数（${name}：${budgetQty}）` });
      }

      const record: Record<string, unknown> = {
        subitem_name: name,
        unit: unit,
        budget_quantity: budgetQty ?? 0,
        completed_quantity: cleanNumber(item.completed_quantity || item['完成工程量'] || item['完成量']) ?? 0,
        unit_price: cleanNumber(item.unit_price || item['单价']),
        contract_price: cleanNumber(item.contract_price || item['合同单价']),
        limit_price: cleanNumber(item.limit_price),
        remark: item.remark || item['备注'] || null,
      };

      if (work_item_id) {
        record.work_item_id = parseInt(String(work_item_id));
      } else if (project_id) {
        record.project_id = parseInt(String(project_id));
      }

      validItems.push(record);
    });

    if (validItems.length === 0 && errors.length > 0) {
      return NextResponse.json({
        success: false,
        count: 0,
        inserted: 0,
        failed: errors.length,
        errors,
        message: `所有 ${errors.length} 条数据均有错误，无法导入`,
      }, { status: 400 });
    }

    // 查重检测：同项目下相同 subitem_name 视为重复
    let existingNames: string[] = [];
    if (project_id) {
      const pid = parseInt(String(project_id));
      const { data: existing, error: existError } = await client
        .from('work_item_subitems')
        .select('subitem_name')
        .eq('project_id', pid);
      if (existError) {
        console.error('[batch] duplicate check error:', existError);
      }
      existingNames = (existing || []).map((r: any) => r.subitem_name);
    } else if (work_item_id) {
      const { data: existing } = await client
        .from('work_item_subitems')
        .select('subitem_name')
        .eq('work_item_id', parseInt(String(work_item_id)));
      existingNames = (existing || []).map((r: any) => r.subitem_name);
    }

    const existingSet = new Set(existingNames);
    const newItems = validItems.filter(item => !existingSet.has(item.subitem_name as string));
    const duplicateCount = validItems.length - newItems.length;

    if (newItems.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        inserted: 0,
        duplicates: duplicateCount,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        skipped: validItems.length,
        message: `所有 ${validItems.length} 条数据已存在，跳过导入`,
      });
    }

    // 使用 insertWithSequenceFix 批量插入（自带序列修复）
    const { data, error } = await insertWithSequenceFix(
      'work_item_subitems',
      newItems,
      client
    );

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: '子项表尚未创建，请联系管理员执行数据库迁移' },
          { status: 500 }
        );
      }
      throw new Error(`批量导入失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      inserted: data?.length || 0,
      duplicates: duplicateCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      subitems: data,
      message: errors.length > 0
        ? `成功导入 ${data?.length || 0} 条，重复跳过 ${duplicateCount} 条，失败 ${errors.length} 条`
        : undefined,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '导入失败' },
      { status: 500 }
    );
  }
}
