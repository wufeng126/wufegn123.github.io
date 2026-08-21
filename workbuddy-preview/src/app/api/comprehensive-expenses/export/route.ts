import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { exportToExcel } from '@/lib/excel-utils';

// 字段映射
const EXPORT_HEADERS: Record<string, string> = {
  project_name: '项目名称',
  expense_type: '费用类型',
  amount: '金额(元)',
  expense_date: '发生日期',
  handler: '经办人',
  remark: '备注',
};

type ProjectRelation = { name?: string | null } | { name?: string | null }[] | null;

function getRelationName(relation: ProjectRelation | undefined): string {
  const project = Array.isArray(relation) ? relation[0] : relation;
  return project?.name || '未关联项目';
}

// 获取综合费用导出数据
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    const searchParams = request.nextUrl.searchParams;
    
    // 获取查询参数
    const projectId = searchParams.get('projectId');
    const expenseType = searchParams.get('expenseType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 构建查询
    let query = client
      .from('comprehensive_expenses')
      .select(`
        id,
        expense_type,
        amount,
        expense_date,
        handler,
        remark,
        project_id,
        projects(name)
      `)
      .order('expense_date', { ascending: false });

    // 应用筛选条件
    if (projectId && projectId !== 'all') {
      const pid = Number(projectId);
      if (!Number.isInteger(pid)) {
        return NextResponse.json({ error: '项目参数不正确' }, { status: 400 });
      }
      if (accessibleProjects !== null && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ error: '无权导出此项目' }, { status: 403 });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }
    if (expenseType && expenseType !== 'all') {
      query = query.eq('expense_type', expenseType);
    }
    if (startDate) {
      query = query.gte('expense_date', startDate);
    }
    if (endDate) {
      query = query.lte('expense_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询综合费用失败: ${error.message}`);
    }

    // 格式化导出数据
    const exportData = (data || []).map((item: {
      projects?: ProjectRelation;
      expense_type?: string | null;
      amount?: string | number | null;
      expense_date?: string | null;
      handler?: string | null;
      remark?: string | null;
    }) => ({
      project_name: getRelationName(item.projects),
      expense_type: item.expense_type,
      amount: parseFloat(String(item.amount ?? '0')).toFixed(2),
      expense_date: item.expense_date,
      handler: item.handler || '',
      remark: item.remark || '',
    }));

    const buffer = exportToExcel(exportData, EXPORT_HEADERS, '综合费用');
    
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('综合费用.xlsx')}`,
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
