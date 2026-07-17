import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getUserById, getUserDisplayName, isVisaActive, isVisaDone, notifyVisaWorkflow } from '@/lib/visa-workflow';

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

function emptyVisaResponse(page: number, pageSize: number) {
  const monthlyData = getLast6Months().map((month) => ({
    month,
    monthLabel: month.substring(5) + '月',
    newCount: 0,
    completedCount: 0,
    amount: 0,
  }));

  return NextResponse.json({
    visas: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
    stats: {
      totalCount: 0,
      completedCount: 0,
      confirmedCount: 0,
      approvedCount: 0,
      submittedCount: 0,
      pendingCount: 0,
      totalAmount: 0,
      completedRate: 0,
      relatedProjects: 0,
      activeProjectsCount: 0,
      currentMonthNew: 0,
      currentMonthCompleted: 0,
      currentMonthAmount: 0,
      overdueCount: 0,
      warningCount: 0,
      newGrowth: '0',
      completedGrowth: '0',
      amountGrowth: '0',
    },
    monthlyData,
    activeProjectsWithVisa: [],
  });
}

function parseVisaAmount(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  const normalized = String(value).replace(/[,\s¥￥]/g, '');
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function getVisaStepDate(visa: {
  workflow_step_updated_at?: string | null;
  submitted_at?: string | null;
  occurrence_date?: string | null;
  created_at?: string | null;
}) {
  return visa.workflow_step_updated_at || visa.submitted_at || visa.occurrence_date || visa.created_at || null;
}

// 获取签证列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    
    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
    // 获取查询参数
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const todo = searchParams.get('todo');
    const keyword = searchParams.get('keyword');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');

    if (Array.isArray(accessibleProjects) && accessibleProjects.length === 0) {
      return emptyVisaResponse(page, pageSize);
    }

    // 构建查询
    let query = client
      .from('visas')
      .select('*, projects(name)', { count: 'exact' });

    // 构建统计查询（应用相同筛选条件，但不分页）
    let statsQuery = client
      .from('visas')
      .select('id, status, visa_amount, project_id, occurrence_date, created_at');

    // 项目过滤
    if (projectId && projectId !== 'all') {
      const pid = parseInt(projectId);
      if (Array.isArray(accessibleProjects) && !accessibleProjects.includes(pid)) {
        return emptyVisaResponse(page, pageSize);
      }
      query = query.eq('project_id', pid);
      statsQuery = statsQuery.eq('project_id', pid);
    } else if (Array.isArray(accessibleProjects)) {
      query = query.in('project_id', accessibleProjects);
      statsQuery = statsQuery.in('project_id', accessibleProjects);
    }
    
    // 应用筛选条件
    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['已提交', '已签字', '待预算员确认', '待办理']);
        statsQuery = statsQuery.in('status', ['已提交', '已签字', '待预算员确认', '待办理']);
      } else if (status === 'done') {
        query = query.in('status', ['已完成', '已结算', '已完结']);
        statsQuery = statsQuery.in('status', ['已完成', '已结算', '已完结']);
      } else {
        query = query.eq('status', status);
        statsQuery = statsQuery.eq('status', status);
      }
    }
    if (keyword) {
      query = query.or(`visa_number.ilike.%${keyword}%,visa_name.ilike.%${keyword}%`);
      statsQuery = statsQuery.or(`visa_number.ilike.%${keyword}%,visa_name.ilike.%${keyword}%`);
    }
    if (todo === 'mine') {
      query = query.eq('current_responsible_user_id', auth.user.id);
      statsQuery = statsQuery.eq('current_responsible_user_id', auth.user.id);
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
    const { data: filteredVisas, error: statsError } = await statsQuery;
    if (statsError) {
      throw new Error(`统计签证失败: ${statsError.message}`);
    }

    // 获取所有签证用于趋势图（应用项目过滤）
    let allVisasQuery = client
      .from('visas')
      .select('id, status, visa_amount, project_id, occurrence_date');
    
    // 应用项目过滤
    if (Array.isArray(accessibleProjects)) {
      allVisasQuery = allVisasQuery.in('project_id', accessibleProjects);
    }
    
    const { data: allVisas, error: allVisasError } = await allVisasQuery;
    if (allVisasError) {
      throw new Error(`统计签证趋势失败: ${allVisasError.message}`);
    }

    // 获取所有进行中的项目（应用项目过滤）
    let activeProjectsQuery = client
      .from('projects')
      .select('id, name, status')
      .in('status', ['进行中', '在建']);
    
    if (Array.isArray(accessibleProjects)) {
      activeProjectsQuery = activeProjectsQuery.in('id', accessibleProjects);
    }
    
    const { data: activeProjects, error: activeProjectsError } = await activeProjectsQuery;
    if (activeProjectsError) {
      throw new Error(`统计签证项目失败: ${activeProjectsError.message}`);
    }

    // 计算关联项目数（基于筛选后的数据）
    const projectIds = new Set(filteredVisas?.map(v => v.project_id) || []);
    
    // 基础统计（基于筛选后的数据）
    const totalCount = filteredVisas?.length || 0;
    const completedCount = filteredVisas?.filter(v => isVisaDone(v.status)).length || 0;
    const approvedCount = filteredVisas?.filter(v => v.status === '待预算员确认').length || 0;
    const pendingCount = filteredVisas?.filter(v => isVisaActive(v.status) || v.status === '草稿').length || 0;
    const submittedCount = filteredVisas?.filter(v => v.status === '已提交').length || 0; // 待审核数量
    const totalAmount = filteredVisas?.reduce((sum, v) => sum + parseVisaAmount(v.visa_amount), 0) || 0;
    const completedRate = totalCount > 0 ? (completedCount / totalCount * 100) : 0;

    // 风险预警统计（基于筛选后的数据，待处理 = 已提交超过3天）
    const today = new Date();
    const overdueCount = filteredVisas?.filter(v => {
      if (!['已提交', '已签字', '待办理'].includes(v.status)) return false;
      const stepDateValue = getVisaStepDate(v);
      if (!stepDateValue) return false;
      const submitDate = new Date(stepDateValue);
      const diffDays = Math.floor((today.getTime() - submitDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 7;
    }).length || 0;
    
    const warningCount = filteredVisas?.filter(v => {
      if (!['已提交', '已签字', '待办理'].includes(v.status)) return false;
      const stepDateValue = getVisaStepDate(v);
      if (!stepDateValue) return false;
      const submitDate = new Date(stepDateValue);
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
      const completedInMonth = monthVisas.filter(v => isVisaDone(v.status)).length;
      const monthAmount = monthVisas.reduce((sum, v) => sum + parseVisaAmount(v.visa_amount), 0);

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
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}

// 创建签证
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

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
      project_manager_user_id,
    } = body;

    // 验证必填字段
    if (!visa_number || !visa_name || !project_id || !occurrence_date || !visa_amount) {
      return NextResponse.json(
        { error: '签证编号、名称、项目、发生日期和金额为必填项' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (Array.isArray(accessibleProjects) && !accessibleProjects.includes(Number(project_id))) {
      return NextResponse.json({ error: '无权在该项目下创建签证' }, { status: 403 });
    }

    const finalStatus = status === '草稿' ? '草稿' : '已提交';
    const projectManagerUserId = Number(project_manager_user_id || 0);

    if (finalStatus === '已提交' && !projectManagerUserId) {
      return NextResponse.json(
        { error: '提交签证时必须选择项目经理负责人' },
        { status: 400 }
      );
    }

    const manager = projectManagerUserId ? await getUserById(client, projectManagerUserId) : null;
    if (projectManagerUserId && !manager) {
      return NextResponse.json({ error: '选择的项目经理不存在' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const managerName = getUserDisplayName(manager);
    const budgetName = getUserDisplayName(auth.user);

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
        status: finalStatus,
        handler: handler || null,
        remark: remark || null,
        attachments: attachments || null,
        budget_user_id: auth.user.id,
        budget_user_name: budgetName || null,
        project_manager_user_id: projectManagerUserId || null,
        project_manager_name: managerName || null,
        current_responsible_user_id: finalStatus === '已提交' ? projectManagerUserId : null,
        current_responsible_name: finalStatus === '已提交' ? managerName : null,
        submitted_at: finalStatus === '已提交' ? now : null,
        workflow_step_updated_at: finalStatus === '已提交' ? now : null,
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

    if (finalStatus === '已提交' && projectManagerUserId) {
      await notifyVisaWorkflow({
        type: 'visa_workflow',
        title: '签证待办理',
        content: `${budgetName || '预算员'}提交了签证 ${visa_number}，请推进甲方工程部签字。`,
        projectId: Number(project_id),
        visaId: visa?.id,
        recipientUserId: projectManagerUserId,
        metadata: {
          visaNumber: visa_number,
          visaName: visa_name,
          visaAmount: visa_amount,
          status: finalStatus,
          targetNames: [managerName],
          businessSummary: `签证 ${visa_number}${visa_name ? `（${visa_name}）` : ''}已提交给${managerName || '项目经理'}办理甲方工程部签字${visa_amount ? `，金额 ¥${Number(visa_amount).toLocaleString()}` : ''}`,
        },
      });
    }

    return NextResponse.json({ visa });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '创建失败' },
      { status: 500 }
    );
  }
}
