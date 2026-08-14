import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { buildSubitemCostComparison } from '@/lib/subitem-cost-comparison';

/**
 * P0-6 成本三层对比 API（GET）
 * 参数：project_id（可选，缺省为全部项目）
 * 返回：分项级「合同收入 vs 限价成本 vs 实际成本」三层对比 + 项目汇总
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectIdParam = searchParams.get('project_id');

    const client = getSupabaseClient();
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);

    // 项目筛选：指定项目（含权限校验）或全部（按可见项目过滤）
    let projectFilter: number | null = null;
    if (projectIdParam && projectIdParam !== 'all') {
      const pid = parseInt(projectIdParam);
      if (!Number.isFinite(pid)) {
        return NextResponse.json({ error: 'project_id 参数无效' }, { status: 400 });
      }
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ rows: [], summary: null });
      }
      projectFilter = pid;
    }

    // 1. 分项清单（三层价格 + 预算/完成/结算量 + 项目名）
    let subitemsQuery = client
      .from('work_item_subitems')
      .select(`
        id,
        project_id,
        subitem_name,
        unit,
        budget_quantity,
        completed_quantity,
        settlement_quantity,
        contract_price,
        limit_price,
        projects ( name )
      `)
      .order('project_id', { ascending: true })
      .order('id', { ascending: true });

    if (projectFilter !== null) {
      subitemsQuery = subitemsQuery.eq('project_id', projectFilter);
    } else if (accessibleProjects !== null) {
      subitemsQuery = subitemsQuery.in('project_id', accessibleProjects);
    }

    const { data: subitems, error: subitemsError } = await subitemsQuery;

    if (subitemsError) {
      throw new Error(`查询分项失败: ${subitemsError.message}`);
    }

    const subitemIds = (subitems || []).map((s: any) => s.id);

    // 2. 月度对下结算（全部月份，用于实际成本）
    const { data: settlements, error: settlementsError } = subitemIds.length > 0
      ? await client
          .from('subitem_monthly_progress')
          .select('subitem_id, completed_quantity, unit_price')
          .in('subitem_id', subitemIds)
      : { data: [], error: null };

    if (settlementsError) {
      throw new Error(`查询月度对下结算失败: ${settlementsError.message}`);
    }

    const { rows, summary } = buildSubitemCostComparison({
      subitems: (subitems || []).map((s: any) => ({
        id: s.id,
        project_id: s.project_id,
        project_name: (s.projects as any)?.name || '',
        subitem_name: s.subitem_name,
        unit: s.unit,
        budget_quantity: s.budget_quantity,
        completed_quantity: s.completed_quantity,
        settlement_quantity: s.settlement_quantity,
        contract_price: s.contract_price,
        limit_price: s.limit_price,
      })),
      settlements: (settlements || []).map((s: any) => ({
        subitem_id: s.subitem_id,
        completed_quantity: s.completed_quantity,
        unit_price: s.unit_price,
      })),
    });

    return NextResponse.json({ rows, summary });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
