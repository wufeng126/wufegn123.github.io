import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
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

type ProjectRelation = { name?: string | null } | { name?: string | null }[] | null;

function getRelationName(relation: ProjectRelation | undefined): string {
  const project = Array.isArray(relation) ? relation[0] : relation;
  return project?.name || '';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
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
      throw new Error(`查询付款记录失败: ${error.message}`);
    }

    // 格式化导出数据
    const exportData = (data || []).map((item: {
      projects?: ProjectRelation;
      payment_amount?: string | number | null;
      payment_date?: string | null;
      payment_method?: string | null;
      status?: string | null;
      remark?: string | null;
    }) => {
      const paymentMethod = item.payment_method
        ? PAYMENT_METHOD_MAP[item.payment_method] || item.payment_method
        : '银行转账';
      const statusText = item.status
        ? STATUS_MAP[item.status] || item.status
        : '已完成';

      return {
        project_name: getRelationName(item.projects),
        payment_amount: item.payment_amount || '0',
        payment_date: item.payment_date?.split('T')[0] || '',
        payment_method: paymentMethod,
        status: statusText,
        remark: item.remark || '',
      };
    });

    const buffer = exportToExcel(exportData, EXPORT_HEADERS, '甲方付款');
    
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('甲方付款.xlsx')}`,
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
