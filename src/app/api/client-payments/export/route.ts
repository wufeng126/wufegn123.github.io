import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { exportToExcel } from '@/lib/excel-utils';

// 甲方付款导出字段映射
const EXPORT_HEADERS: Record<string, string> = {
  project_name: '项目名称',
  payment_amount: '付款金额',
  payment_date: '付款日期',
  payment_method: '付款方式',
  status: '状态',
  remark: '备注',
};

// 付款方式映射
const PAYMENT_METHOD_MAP: Record<string, string> = {
  bank_transfer: '银行转账',
  cash: '现金',
  check: '支票',
  other: '其他',
};

// 状态映射
const STATUS_MAP: Record<string, string> = {
  completed: '已完成',
  pending: '待确认',
  cancelled: '已取消',
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();
    
    // 查询甲方付款记录
    let query = client
      .from('client_payments')
      .select(`
        id,
        payment_amount,
        payment_date,
        payment_method,
        status,
        remark,
        project_id,
        projects (
          name
        )
      `)
      .order('payment_date', { ascending: false });

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', parseInt(projectId));
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询付款记录失败: ${error.message}`);
    }

    // 格式化导出数据
    const exportData = (data || []).map((item: any) => ({
      project_name: item.projects?.name || '',
      payment_amount: item.payment_amount || '0',
      payment_date: item.payment_date?.split('T')[0] || '',
      payment_method: PAYMENT_METHOD_MAP[item.payment_method] || item.payment_method || '银行转账',
      status: STATUS_MAP[item.status] || item.status || '已完成',
      remark: item.remark || '',
    }));

    const buffer = exportToExcel(exportData, EXPORT_HEADERS, '甲方付款');
    
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('甲方付款.xlsx')}`,
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
