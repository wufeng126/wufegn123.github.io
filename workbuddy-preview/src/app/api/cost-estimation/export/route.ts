import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import * as XLSX from 'xlsx';

type ProjectRelation = { name?: string | null } | { name?: string | null }[] | null;

function getRelationName(relation: ProjectRelation | undefined): string {
  const project = Array.isArray(relation) ? relation[0] : relation;
  return project?.name || '';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const accessibleProjects = await getAccessibleProjectIds(supabase, auth.user);

    // 获取价格参考库
    let priceQuery = supabase
      .from('unit_prices')
      .select('*, projects(name)')
      .order('created_at', { ascending: false });

    if (projectId && projectId !== 'all') {
      const pid = Number(projectId);
      if (!Number.isInteger(pid)) {
        return NextResponse.json({ success: false, error: '项目参数不正确' }, { status: 400 });
      }
      if (accessibleProjects !== null && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ success: false, error: '当前账号没有权限导出该项目数据' }, { status: 403 });
      }
      priceQuery = priceQuery.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      if (accessibleProjects.length > 0) {
        priceQuery = priceQuery.or(`project_id.is.null,project_id.in.(${accessibleProjects.join(',')})`);
      } else {
        priceQuery = priceQuery.is('project_id', null);
      }
    }

    const { data: prices } = await priceQuery;

    // 获取标准工序清单
    const { data: standards } = await supabase
      .from('work_type_standards')
      .select('*')
      .order('sort_order');

    // 创建工作簿
    const wb = XLSX.utils.book_new();

    // Sheet 1: 价格参考库
    const priceRows = (prices || []).map((p: {
      work_type?: string | null;
      unit?: string | null;
      min_price?: string | number | null;
      median_price?: string | number | null;
      max_price?: string | number | null;
      projects?: ProjectRelation;
      remark?: string | null;
    }) => ({
      '工序名称': p.work_type || '',
      '单位': p.unit || '',
      '最低价': p.min_price || 0,
      '中位价': p.median_price || 0,
      '最高价': p.max_price || 0,
      '来源项目': getRelationName(p.projects),
      '备注': p.remark || '',
    }));
    const ws1 = XLSX.utils.json_to_sheet(priceRows);
    XLSX.utils.book_append_sheet(wb, ws1, '价格参考库');

    // Sheet 2: 标准工序
    const stdRows = (standards || []).map((s: {
      category?: string | null;
      name?: string | null;
      unit?: string | null;
      sort_order?: string | number | null;
    }) => ({
      '分类': s.category || '',
      '工序名称': s.name || '',
      '单位': s.unit || '',
      '排序': s.sort_order || 0,
    }));
    const ws2 = XLSX.utils.json_to_sheet(stdRows);
    XLSX.utils.book_append_sheet(wb, ws2, '标准工序清单');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="成本测算_价格参考库_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '导出失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
