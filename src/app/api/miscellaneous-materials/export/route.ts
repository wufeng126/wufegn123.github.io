import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();
    
    let query = client
      .from('miscellaneous_materials')
      .select(`*, project:projects(id, name)`)
      .order('purchase_date', { ascending: false });

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', parseInt(projectId));
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询零星材料失败: ${error.message}`);
    }

    const exportData = (data || []).map((item: any) => ({
      project_name: item.project?.name || '',
      material_name: item.material_name || '',
      specification: item.specification || '',
      unit: item.unit || '',
      quantity: parseFloat(item.quantity || '0').toFixed(2),
      unit_price: parseFloat(item.unit_price || '0').toFixed(2),
      amount: parseFloat(item.amount || '0').toFixed(2),
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
  } catch (error: any) {
    console.error('Export Error:', error);
    return NextResponse.json(
      { error: error.message || '导出失败' },
      { status: 500 }
    );
  }
}
