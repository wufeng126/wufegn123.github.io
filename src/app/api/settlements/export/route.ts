import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { exportToExcel } from '@/lib/excel-utils';

// 供应商结算导出字段映射
const EXPORT_HEADERS: Record<string, string> = {
  supplier_name: '供应商名称',
  supplier_type: '供应商类型',
  project_name: '项目名称',
  settlement_type: '结算类型',
  settlement_content: '结算内容',
  settlement_quantity: '结算数量',
  settlement_unit: '单位',
  settlement_amount: '结算金额',
  settlement_month: '结算月份',
  settlement_date: '结算日期',
  remark: '备注',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const projectId = searchParams.get('project_id');
    const month = searchParams.get('month');

    const client = getSupabaseClient();
    
    // 查询结算记录
    let query = client
      .from('settlements')
      .select(`
        id,
        settlement_type,
        settlement_content,
        settlement_quantity,
        settlement_unit,
        settlement_amount,
        settlement_month,
        settlement_date,
        remark,
        supplier:suppliers(id, name, type),
        project:projects(id, name)
      `)
      .order('settlement_date', { ascending: false });

    if (supplierId) {
      query = query.eq('supplier_id', parseInt(supplierId));
    }
    if (projectId) {
      query = query.eq('project_id', parseInt(projectId));
    }
    if (month) {
      query = query.eq('settlement_month', month);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询结算记录失败: ${error.message}`);
    }

    // 格式化导出数据
    const exportData = (data || []).map((item: any) => ({
      supplier_name: item.supplier?.name || '',
      supplier_type: item.supplier?.type || '',
      project_name: item.project?.name || '',
      settlement_type: item.settlement_type || '',
      settlement_content: item.settlement_content || '',
      settlement_quantity: item.settlement_quantity || '',
      settlement_unit: item.settlement_unit || '',
      settlement_amount: item.settlement_amount || '0',
      settlement_month: item.settlement_month || '',
      settlement_date: item.settlement_date || '',
      remark: item.remark || '',
    }));

    const buffer = exportToExcel(exportData, EXPORT_HEADERS, '供应商结算');
    
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('供应商结算.xlsx')}`,
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
