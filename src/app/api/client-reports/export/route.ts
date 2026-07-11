import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { exportToExcel } from '@/lib/excel-utils';

// 产值结算导出字段映射
const EXPORT_HEADERS: Record<string, string> = {
  project_name: '项目名称',
  settlement_amount: '结算金额',
  invoice_amount: '开票金额',
  deduction_amount: '扣款金额',
  proportional_payment: '比例付款',
  report_date: '报量日期',
  remark: '备注',
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();
    
    // 查询产值结算记录
    let query = client
      .from('client_reports')
      .select(`
        id,
        settlement_amount,
        invoice_amount,
        deduction_amount,
        proportional_payment,
        report_date,
        remark,
        project_id,
        projects (
          name
        )
      `)
      .order('report_date', { ascending: false });

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', parseInt(projectId));
    }

    const { data, error } = await query;

    if (error) {
      // 如果新字段不存在，使用旧字段查询
      if (error.message.includes('column') || error.message.includes('does not exist')) {
        const fallbackQuery = client
          .from('client_reports')
          .select(`
            id,
            report_amount,
            report_date,
            remark,
            project_id,
            projects (
              name
            )
          `)
          .order('report_date', { ascending: false });

        if (projectId && projectId !== 'all') {
          fallbackQuery.eq('project_id', parseInt(projectId));
        }

        const fallbackResult = await fallbackQuery;
        
        if (fallbackResult.data) {
          const formattedData = fallbackResult.data.map((item: any) => ({
            project_name: item.projects?.name || '',
            settlement_amount: item.report_amount || '0',
            invoice_amount: '0',
            deduction_amount: '0',
            proportional_payment: '0',
            report_date: item.report_date?.split('T')[0] || '',
            remark: item.remark || '',
          }));

          const buffer = exportToExcel(formattedData, EXPORT_HEADERS, '产值结算');
          
          return new NextResponse(Buffer.from(buffer), {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('产值结算.xlsx')}`,
            },
          });
        }
      }
      throw new Error(`查询产值结算失败: ${error.message}`);
    }

    // 格式化导出数据
    const exportData = (data || []).map((item: any) => ({
      project_name: item.projects?.name || '',
      settlement_amount: item.settlement_amount || '0',
      invoice_amount: item.invoice_amount || '0',
      deduction_amount: item.deduction_amount || '0',
      proportional_payment: item.proportional_payment || '0',
      report_date: item.report_date?.split('T')[0] || '',
      remark: item.remark || '',
    }));

    const buffer = exportToExcel(exportData, EXPORT_HEADERS, '产值结算');
    
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('产值结算.xlsx')}`,
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
