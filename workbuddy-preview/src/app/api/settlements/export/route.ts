import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
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
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const projectId = searchParams.get('project_id');
    const month = searchParams.get('month');

    const client = getSupabaseClient();
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
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
      const pid = parseInt(projectId);
      if (accessibleProjects !== null && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ error: '无权导出此项目' }, { status: 403 });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }
    if (month) {
      query = query.eq('settlement_month', month);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询结算记录失败: ${error.message}`);
    }

    // 格式化导出数据
    const exportData = (data || []).map((item: {
      supplier?: { name?: string | null; type?: string | null } | null;
      project?: { name?: string | null } | null;
      settlement_type?: string | null;
      settlement_content?: string | null;
      settlement_quantity?: string | number | null;
      settlement_unit?: string | null;
      settlement_amount?: string | number | null;
      settlement_month?: string | null;
      settlement_date?: string | null;
      remark?: string | null;
    }) => ({
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '导出失败';
    console.error('Export Error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
