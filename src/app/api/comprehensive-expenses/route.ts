import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { decodeJwt } from 'jose';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { isSuperAdminUser } from '@/lib/route-permissions';

// 获取用户可访问的项目列表
async function getUserAccessibleProjects(client: any, tokenPayload: any): Promise<number[] | null> {
  if (!tokenPayload || isSuperAdminUser(tokenPayload.role, tokenPayload.role_id)) {
    return null;
  }
  
  const userId = tokenPayload.id;
  if (!userId) return [];
  
  const { data: user } = await client
    .from('users')
    .select('managed_projects')
    .eq('id', userId)
    .single();
  
  if (!user) return [];
  
  let accessibleProjects: number[] = [];
  
  if (user.managed_projects) {
    try {
      const parsed = typeof user.managed_projects === 'string' 
        ? JSON.parse(user.managed_projects) 
        : user.managed_projects;
      if (Array.isArray(parsed)) {
        accessibleProjects = parsed.filter((p: any) => typeof p === 'number');
      }
    } catch (e) {
      accessibleProjects = [];
    }
  }
  
  return accessibleProjects.length > 0 ? accessibleProjects : [];
}

// 费用类型
const EXPENSE_TYPES = ['招待费', '差旅费', '房租水电', '现金帮工', '办公用品', '其他杂费'];

// 获取综合费用列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // 获取 token
    const token = request.cookies.get('auth_token')?.value;
    
    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取 token payload
    let tokenPayload: any = null;
    if (token) {
      try {
        tokenPayload = decodeJwt(token);
      } catch (e) {}
    }
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getUserAccessibleProjects(client, tokenPayload);
    
    // 获取查询参数
    const projectId = searchParams.get('projectId');
    const expenseType = searchParams.get('expenseType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const keyword = searchParams.get('keyword');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // 构建查询
    let query = client
      .from('comprehensive_expenses')
      .select('*, projects(name)', { count: 'exact' });

    // 项目过滤
    if (projectId && projectId !== 'all') {
      const pid = parseInt(projectId);
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ data: [], total: 0, page: 1, pageSize, stats: { total: '0', byType: {} } });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }
    
    // 应用筛选条件
    if (expenseType && expenseType !== 'all') {
      query = query.eq('expense_type', expenseType);
    }
    if (startDate) {
      query = query.gte('expense_date', startDate);
    }
    if (endDate) {
      query = query.lte('expense_date', endDate);
    }
    if (keyword) {
      query = query.or(`handler.ilike.%${keyword}%,remark.ilike.%${keyword}%`);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`查询综合费用失败: ${error.message}`);
    }

    // 获取所有费用用于统计
    let statsQuery = client
      .from('comprehensive_expenses')
      .select('id, expense_type, amount, project_id, expense_date');

    if (projectId && projectId !== 'all') {
      statsQuery = statsQuery.eq('project_id', parseInt(projectId));
    }
    if (expenseType && expenseType !== 'all') {
      statsQuery = statsQuery.eq('expense_type', expenseType);
    }
    if (startDate) {
      statsQuery = statsQuery.gte('expense_date', startDate);
    }
    if (endDate) {
      statsQuery = statsQuery.lte('expense_date', endDate);
    }

    const { data: allExpenses } = await statsQuery;

    // 计算统计数据
    const totalCount = allExpenses?.length || 0;
    const totalAmount = allExpenses?.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
    
    // 按类型统计
    const typeStats: Record<string, number> = {};
    EXPENSE_TYPES.forEach(type => {
      typeStats[type] = 0;
    });
    allExpenses?.forEach(e => {
      if (typeStats[e.expense_type] !== undefined) {
        typeStats[e.expense_type] += parseFloat(e.amount) || 0;
      }
    });

    // 按项目统计
    const projectStats: Record<number, { name: string; amount: number; count: number }> = {};
    allExpenses?.forEach(e => {
      if (e.project_id) {
        if (!projectStats[e.project_id]) {
          projectStats[e.project_id] = { name: '', amount: 0, count: 0 };
        }
        projectStats[e.project_id].amount += parseFloat(e.amount) || 0;
        projectStats[e.project_id].count++;
      }
    });

    // 获取项目名称
    const projectIds = Object.keys(projectStats).map(Number);
    if (projectIds.length > 0) {
      const { data: projectsData } = await client
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      
      projectsData?.forEach(p => {
        if (projectStats[p.id]) {
          projectStats[p.id].name = p.name;
        }
      });
    }

    return NextResponse.json({
      expenses: data,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats: {
        totalCount,
        totalAmount,
        typeStats,
        projectStats,
      },
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

// 创建综合费用
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      project_id,
      expense_type,
      amount,
      expense_date,
      handler,
      remark,
      attachments,
      created_by,
    } = body;

    // 验证必填字段
    if (!expense_type || !amount || !expense_date) {
      return NextResponse.json(
        { error: '费用类型、金额和发生日期为必填项' },
        { status: 400 }
      );
    }

    // 验证费用类型
    if (!EXPENSE_TYPES.includes(expense_type)) {
      return NextResponse.json(
        { error: '无效的费用类型' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    const { data: expData, error: expError } = await insertWithSequenceFix(
      'comprehensive_expenses',
      {
        project_id: project_id || null,
        expense_type,
        amount: parseFloat(amount),
        expense_date,
        handler: handler || null,
        remark: remark || null,
        attachments: attachments || null,
        created_by: created_by || 'admin',
      },
      client
    );
    if (expError) throw expError;

    const expense = Array.isArray(expData) ? expData[0] : expData;

    await auditLog({
      operationType: 'create',
      resourceType: 'comprehensive_expense',
      resourceId: expense?.id || 0,
      details: { expense_type, amount, expense_date, project_id },
      request,
    });

    return NextResponse.json({ expense });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
