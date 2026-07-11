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

// 获取近6个月的年月列表
function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// 获取签证列表
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
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');

    // 构建查询
    let query = client
      .from('visas')
      .select('*, projects(name)', { count: 'exact' });

    // 构建统计查询（应用相同筛选条件，但不分页）
    let statsQuery = client
      .from('visas')
      .select('id, status, visa_amount, project_id, occurrence_date, submitted_at');

    // 项目过滤
    if (projectId && projectId !== 'all') {
      const pid = parseInt(projectId);
      if (accessibleProjects && accessibleProjects.length > 0 && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ data: [], total: 0, page, pageSize, stats: { total: 0, pending: 0, totalAmount: 0 }, trend: {} });
      }
      query = query.eq('project_id', pid);
      statsQuery = statsQuery.eq('project_id', pid);
    } else if (accessibleProjects && accessibleProjects.length > 0) {
      query = query.in('project_id', accessibleProjects);
      statsQuery = statsQuery.in('project_id', accessibleProjects);
    }
    
    // 应用筛选条件
    if (status && status !== 'all') {
      query = query.eq('status', status);
      statsQuery = statsQuery.eq('status', status);
    }
    if (keyword) {
      query = query.or(`visa_number.ilike.%${keyword}%,visa_name.ilike.%${keyword}%`);
      statsQuery = statsQuery.or(`visa_number.ilike.%${keyword}%,visa_name.ilike.%${keyword}%`);
    }
    if (startDate) {
      query = query.gte('occurrence_date', startDate);
      statsQuery = statsQuery.gte('occurrence_date', startDate);
    }
    if (endDate) {
      query = query.lte('occurrence_date', endDate);
      statsQuery = statsQuery.lte('occurrence_date', endDate);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('occurrence_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`查询签证失败: ${error.message}`);
    }

    // 获取筛选后的签证用于统计
    const { data: filteredVisas } = await statsQuery;

    // 获取所有签证用于趋势图（应用项目过滤）
    let allVisasQuery = client
      .from('visas')
      .select('id, status, visa_amount, project_id, occurrence_date');
    
    // 应用项目过滤
    if (accessibleProjects && accessibleProjects.length > 0) {
      allVisasQuery = allVisasQuery.in('project_id', accessibleProjects);
    }
    
    const { data: allVisas } = await allVisasQuery;

    // 获取所有进行中的项目（应用项目过滤）
    let activeProjectsQuery = client
      .from('projects')
      .select('id, name, status')
      .eq('status', '进行中');
    
    if (accessibleProjects && accessibleProjects.length > 0) {
      activeProjectsQuery = activeProjectsQuery.in('id', accessibleProjects);
    }
    
    const { data: activeProjects } = await activeProjectsQuery;

    // 计算关联项目数（基于筛选后的数据）
    const projectIds = new Set(filteredVisas?.map(v => v.project_id) || []);
    
    // 基础统计（基于筛选后的数据）
    const totalCount = filteredVisas?.length || 0;
    const completedCount = filteredVisas?.filter(v => v.status === '已结算').length || 0;
    const approvedCount = filteredVisas?.filter(v => v.status === '审核通过').length || 0;
    const pendingCount = filteredVisas?.filter(v => v.status === '草稿').length || 0; // 草稿数量
    const submittedCount = filteredVisas?.filter(v => v.status === '已提交').length || 0; // 待审核数量
    const totalAmount = filteredVisas?.reduce((sum, v) => sum + (parseFloat(v.visa_amount) || 0), 0) || 0;
    const completedRate = totalCount > 0 ? (completedCount / totalCount * 100) : 0;

    // 风险预警统计（基于筛选后的数据，待处理 = 已提交超过3天）
    const today = new Date();
    const overdueCount = filteredVisas?.filter(v => {
      if (v.status !== '已提交') return false;
      if (!v.submitted_at) return false;
      const submitDate = new Date(v.submitted_at);
      const diffDays = Math.floor((today.getTime() - submitDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 7;
    }).length || 0;
    
    const warningCount = filteredVisas?.filter(v => {
      if (v.status !== '已提交') return false;
      if (!v.submitted_at) return false;
      const submitDate = new Date(v.submitted_at);
      const diffDays = Math.floor((today.getTime() - submitDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 3 && diffDays <= 7;
    }).length || 0;

    // 计算每个进行中项目的签证数量
    const projectVisaCounts: Record<number, number> = {};
    allVisas?.forEach(v => {
      if (!projectVisaCounts[v.project_id]) {
        projectVisaCounts[v.project_id] = 0;
      }
      projectVisaCounts[v.project_id]++;
    });

    const activeProjectsWithVisa = activeProjects?.map(p => ({
      id: p.id,
      name: p.name,
      visaCount: projectVisaCounts[p.id] || 0,
    })) || [];

    // 计算近6个月趋势数据
    const last6Months = getLast6Months();
    const currentMonth = last6Months[5]; // 当前月份
    
    const monthlyData = last6Months.map(month => {
      // 该月的签证
      const monthVisas = allVisas?.filter(v => {
        if (!v.occurrence_date) return false;
        const date = new Date(v.occurrence_date);
        const visaMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return visaMonth === month;
      }) || [];

      const newCount = monthVisas.length;
      // 已结算是完成状态
      const completedInMonth = monthVisas.filter(v => v.status === '已结算').length;
      const monthAmount = monthVisas.reduce((sum, v) => sum + (parseFloat(v.visa_amount) || 0), 0);

      return {
        month,
        monthLabel: month.substring(5) + '月',
        newCount,
        completedCount: completedInMonth,
        amount: monthAmount,
      };
    });

    // 本月数据
    const currentMonthData = monthlyData[5];
    const lastMonthData = monthlyData[4];

    const stats = {
      totalCount,
      completedCount,
      confirmedCount: approvedCount, // 兼容旧字段
      approvedCount,
      submittedCount,
      pendingCount,
      totalAmount,
      completedRate,
      relatedProjects: projectIds.size,
      activeProjectsCount: activeProjects?.length || 0,
      currentMonthNew: currentMonthData?.newCount || 0,
      currentMonthCompleted: currentMonthData?.completedCount || 0,
      currentMonthAmount: currentMonthData?.amount || 0,
      // 风险预警
      overdueCount,
      warningCount,
      // 环比增长
      newGrowth: lastMonthData?.newCount > 0 
        ? (((currentMonthData?.newCount || 0) - lastMonthData.newCount) / lastMonthData.newCount * 100).toFixed(1)
        : '0',
      completedGrowth: lastMonthData?.completedCount > 0 
        ? (((currentMonthData?.completedCount || 0) - lastMonthData.completedCount) / lastMonthData.completedCount * 100).toFixed(1)
        : '0',
      amountGrowth: lastMonthData?.amount > 0 
        ? (((currentMonthData?.amount || 0) - lastMonthData.amount) / lastMonthData.amount * 100).toFixed(1)
        : '0',
    };

    return NextResponse.json({
      visas: data,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats,
      monthlyData,
      activeProjectsWithVisa,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

// 创建签证
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      visa_number,
      visa_name,
      project_id,
      occurrence_date,
      visa_quantity,
      visa_unit,
      visa_amount,
      status,
      handler,
      remark,
      attachments,
    } = body;

    // 验证必填字段
    if (!visa_number || !visa_name || !project_id || !occurrence_date || !visa_amount) {
      return NextResponse.json(
        { error: '签证编号、名称、项目、发生日期和金额为必填项' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查签证编号是否重复
    const { data: existingVisa } = await client
      .from('visas')
      .select('id')
      .eq('visa_number', visa_number)
      .single();

    if (existingVisa) {
      return NextResponse.json(
        { error: '签证编号已存在，请使用其他编号' },
        { status: 400 }
      );
    }

    const { data: visaData, error: visaError } = await insertWithSequenceFix('visas', {
        visa_number,
        visa_name,
        project_id,
        occurrence_date,
        visa_quantity: visa_quantity || null,
        visa_unit: visa_unit || null,
        visa_amount,
        status: status || '待办理',
        handler: handler || null,
        remark: remark || null,
        attachments: attachments || null,
      }, client);
    if (visaError) throw visaError;
    const visa = Array.isArray(visaData) ? visaData[0] : visaData;

    await auditLog({
      operationType: 'create',
      resourceType: 'visa',
      resourceId: visa?.id || 0,
      details: { visa_number, visa_name, project_id },
      request,
    });

    return NextResponse.json({ visa });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
