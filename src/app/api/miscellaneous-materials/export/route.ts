import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { REVIEW_STATUS } from '@/lib/business-logic';

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
  { key: 'status', label: '状态' },
  { key: 'remark', label: '备注' },
];

const STATUS_LABELS: Record<string, string> = {
  [REVIEW_STATUS.DRAFT]: '草稿',
  [REVIEW_STATUS.REVIEWED]: '已审核',
  [REVIEW_STATUS.VOIDED]: '已作废',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || searchParams.get('project_id');
    const materialName = searchParams.get('materialName') || searchParams.get('material_name');
    const specification = searchParams.get('specification');
    const purchaser = searchParams.get('purchaser');
    const startDate = searchParams.get('startDate') || searchParams.get('start_date');
    const endDate = searchParams.get('endDate') || searchParams.get('end_date');
    const status = searchParams.get('status');
    let rows: any[] = [];

    const client = getSupabaseClient();
    
    let query = client
      .from('miscellaneous_materials')
      .select(`*, projects(id, name)`)
      .order('purchase_date', { ascending: false });

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', parseInt(projectId));
    }
    if (materialName) {
      query = query.ilike('material_name', `%${materialName}%`);
    }
    if (specification) {
      query = query.ilike('specification', `%${specification}%`);
    }
    if (purchaser) {
      query = query.ilike('purchaser', `%${purchaser}%`);
    }
    if (startDate) {
      query = query.gte('purchase_date', startDate);
    }
    if (endDate) {
      query = query.lte('purchase_date', endDate);
    }
    if (status && status !== 'all') {
      query = status === REVIEW_STATUS.DRAFT
        ? query.or('status.eq.draft,status.is.null')
        : query.eq('status', status);
    }

    // 数据权限：非超管仅导出其可访问项目的数据（防止越权导出全量）
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects !== null && accessibleProjects.length === 0) {
      rows = [];
    } else {
      if (accessibleProjects) {
        query = query.in('project_id', accessibleProjects);
      }
      const { data, error } = await query;

      if (error) {
        throw new Error(`查询零星材料失败: ${error.message}`);
      }
      rows = data || [];
    }

    const exportData = rows.map((item: any) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const amount = Math.round(quantity * unitPrice * 100) / 100;

      return {
      project_name: item.projects?.name || item.project?.name || '',
      material_name: item.material_name || '',
      specification: item.specification || '',
      unit: item.unit || '',
      quantity: quantity.toFixed(2),
      unit_price: unitPrice.toFixed(2),
      amount: amount.toFixed(2),
      purchase_date: item.purchase_date || '',
      purchaser: item.purchaser || '',
      status: STATUS_LABELS[item.status || REVIEW_STATUS.DRAFT] || '草稿',
      remark: item.remark || '',
      };
    });

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
  } catch (error: any) {
    console.error('Export Error:', error);
    return NextResponse.json(
      { error: error.message || '导出失败' },
      { status: 500 }
    );
  }
}
