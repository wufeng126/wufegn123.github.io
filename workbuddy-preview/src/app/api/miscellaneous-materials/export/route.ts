import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

const EXPORT_HEADERS: { key: string; label: string }[] = [
  { key: 'project_name', label: '项目名称' },
  { key: 'material_name', label: '材料名称' },
  { key: 'specification', label: '规格型号' },
  { key: 'unit', label: '单位' },
  { key: 'quantity', label: '数量' },
  { key: 'unit_price', label: '单价' },
  { key: 'amount', label: '金额' },
  { key: 'purchase_date', label: '采购日期' },
  { key: 'purchaser', label: '采购人' },
  { key: 'remark', label: '备注' },
];

type ProjectRelation = { name?: string | null } | { name?: string | null }[] | null;

function getRelationName(relation: ProjectRelation | undefined): string {
  const project = Array.isArray(relation) ? relation[0] : relation;
  return project?.name || '';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
    let query = client
      .from('miscellaneous_materials')
      .select(`*, project:projects(id, name)`)
      .order('purchase_date', { ascending: false });

    if (projectId && projectId !== 'all') {
      const pid = Number(projectId);
      if (!Number.isInteger(pid)) {
        return NextResponse.json({ error: '项目参数不正确' }, { status: 400 });
      }
      if (accessibleProjects !== null && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ error: '当前账号没有权限导出该项目数据' }, { status: 403 });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询零星材料失败: ${error.message}`);
    }

    const exportData = (data || []).map((item: {
      project?: ProjectRelation;
      material_name?: string | null;
      specification?: string | null;
      unit?: string | null;
      quantity?: string | number | null;
      unit_price?: string | number | null;
      amount?: string | number | null;
      purchase_date?: string | null;
      purchaser?: string | null;
      remark?: string | null;
    }) => ({
      project_name: getRelationName(item.project),
      material_name: item.material_name || '',
      specification: item.specification || '',
      unit: item.unit || '',
      quantity: parseFloat(String(item.quantity ?? '0')).toFixed(2),
      unit_price: parseFloat(String(item.unit_price ?? '0')).toFixed(2),
      amount: parseFloat(String(item.amount ?? '0')).toFixed(2),
      purchase_date: item.purchase_date || '',
      purchaser: item.purchaser || '',
      remark: item.remark || '',
    }));

    const headerRow = EXPORT_HEADERS.map(h => h.label).join(',');
    const dataRows = exportData.map(row => 
      EXPORT_HEADERS.map(h => {
        const value = row[h.key as keyof typeof row];
        if (value && (String(value).includes(',') || String(value).includes('\n'))) {
          return `"${String(value).replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(',')
    );
    
    const csvContent = [headerRow, ...dataRows].join('\n');
    const buffer = Buffer.from('\uFEFF' + csvContent, 'utf-8');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('零星材料明细.csv')}`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '导出失败';
    console.error('Export Error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
