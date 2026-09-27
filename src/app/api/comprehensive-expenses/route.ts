import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { invalidateAggregationCache } from '@/lib/data-aggregation';
import { isReviewedStatus, REVIEW_STATUS } from '@/lib/business-logic';
import {
  assertProjectAccess,
  badProjectIdResponse,
  emptyProjectScopeResponse,
  getProjectAccessScope,
  parseOptionalProjectId,
} from '@/lib/api-project-scope';

// 费用类型
const EXPENSE_TYPES = ['招待费', '差旅费', '房租水电', '现金帮工', '办公用品', '其他杂费'];

// 获取综合费用列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    
    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getProjectAccessScope(client, auth.user);
    
    // 获取查询参数
    const projectId = searchParams.get('projectId');
    const requestedProjectId = parseOptionalProjectId(projectId);
    if (Number.isNaN(requestedProjectId)) return badProjectIdResponse();
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
    if (requestedProjectId) {
      if (accessibleProjects && !accessibleProjects.includes(requestedProjectId)) {
        return NextResponse.json({ expenses: [], pagination: { page, pageSize, total: 0, totalPages: 0 }, stats: { totalCount: 0, totalAmount: 0, typeStats: {}, projectStats: {} } });
      }
      query = query.eq('project_id', requestedProjectId);
    } else if (accessibleProjects !== null) {
      if (accessibleProjects.length === 0) {
        return emptyProjectScopeResponse({ expenses: [], pagination: { page, pageSize, total: 0, totalPages: 0 }, stats: { totalCount: 0, totalAmount: 0, typeStats: {}, projectStats: {} } });
      }
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
      .select('id, expense_type, amount, project_id, expense_date, status');

    if (requestedProjectId) {
      statsQuery = statsQuery.eq('project_id', requestedProjectId);
    } else if (accessibleProjects !== null) {
      statsQuery = statsQuery.in('project_id', accessibleProjects);
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
    const reviewedExpenses = (allExpenses || []).filter((e: any) => isReviewedStatus(e.status));
    const expenses = (data || []).map((e: any) => ({
      ...e,
      status: e.status || REVIEW_STATUS.DRAFT,
    }));

    // 计算统计数据
    const totalCount = reviewedExpenses.length;
    const totalAmount = reviewedExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    // 按类型统计
    const typeStats: Record<string, number> = {};
    EXPENSE_TYPES.forEach(type => {
      typeStats[type] = 0;
    });
    reviewedExpenses.forEach(e => {
      if (typeStats[e.expense_type] !== undefined) {
        typeStats[e.expense_type] += parseFloat(e.amount) || 0;
      }
    });

    // 按项目统计
    const projectStats: Record<number, { name: string; amount: number; count: number }> = {};
    reviewedExpenses.forEach(e => {
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
      expenses,
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

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
    const normalizedProjectId = project_id ? Number(project_id) : null;
    if (normalizedProjectId && !Number.isInteger(normalizedProjectId)) {
      return badProjectIdResponse();
    }
    if (normalizedProjectId) {
      const access = await assertProjectAccess(client, auth.user, normalizedProjectId);
      if (!access.ok) return access.response;
    } else if (!auth.user.is_super_admin) {
      return NextResponse.json({ error: '请选择有权限的项目' }, { status: 400 });
    }

    const { data: expData, error: expError } = await insertWithSequenceFix(
      'comprehensive_expenses',
      {
        project_id: normalizedProjectId,
        expense_type,
        amount: parseFloat(amount),
        expense_date,
        handler: handler || null,
        remark: remark || null,
        attachments: attachments || null,
        created_by: created_by || auth.user.name || auth.user.username || 'admin',
        status: REVIEW_STATUS.DRAFT,
      },
      client
    );
    if (expError) throw expError;

    // 写入后失效聚合缓存
    invalidateAggregationCache();

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
