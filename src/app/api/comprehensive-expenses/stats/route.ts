import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 费用类型
const EXPENSE_TYPES = ['招待费', '差旅费', '房租水电', '现金帮工', '办公用品', '其他杂费'];

// 获取综合费用统计
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    
    // 获取查询参数
    const projectId = searchParams.get('projectId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    // 构建查询
    let query = client
      .from('comprehensive_expenses')
      .select('id, expense_type, amount, project_id, expense_date');

    // 应用筛选条件
    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', parseInt(projectId));
    }
    if (year) {
      query = query.gte('expense_date', `${year}-01-01`).lte('expense_date', `${year}-12-31`);
    }
    if (month) {
      query = query.like('expense_date', `${month}%`);
    }

    const { data: expenses, error } = await query;

    if (error) {
      throw new Error(`查询综合费用失败: ${error.message}`);
    }

    // 计算统计数据
    const totalCount = expenses?.length || 0;
    const totalAmount = expenses?.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
    
    // 按类型统计
    const typeStats: Record<string, { amount: number; count: number; percentage: number }> = {};
    EXPENSE_TYPES.forEach(type => {
      typeStats[type] = { amount: 0, count: 0, percentage: 0 };
    });
    
    expenses?.forEach(e => {
      if (typeStats[e.expense_type]) {
        typeStats[e.expense_type].amount += parseFloat(e.amount) || 0;
        typeStats[e.expense_type].count++;
      }
    });

    // 计算百分比
    Object.keys(typeStats).forEach(type => {
      typeStats[type].percentage = totalAmount > 0 
        ? (typeStats[type].amount / totalAmount) * 100 
        : 0;
    });

    // 按项目统计
    const projectStats: Record<number, { amount: number; count: number }> = {};
    expenses?.forEach(e => {
      if (e.project_id) {
        if (!projectStats[e.project_id]) {
          projectStats[e.project_id] = { amount: 0, count: 0 };
        }
        projectStats[e.project_id].amount += parseFloat(e.amount) || 0;
        projectStats[e.project_id].count++;
      }
    });

    // 获取项目名称
    const projectIds = Object.keys(projectStats).map(Number);
    let projectDetails: Array<{ id: number; name: string; amount: number; count: number; percentage: number }> = [];
    
    if (projectIds.length > 0) {
      const { data: projectsData } = await client
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      
      projectDetails = projectIds.map(pid => ({
        id: pid,
        name: projectsData?.find(p => p.id === pid)?.name || '未知项目',
        amount: projectStats[pid].amount,
        count: projectStats[pid].count,
        percentage: totalAmount > 0 ? (projectStats[pid].amount / totalAmount) * 100 : 0,
      })).sort((a, b) => b.amount - a.amount);
    }

    // 按月份统计（最近12个月）
    const monthlyStats: Array<{ month: string; amount: number; count: number }> = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const monthExpenses = expenses?.filter(e => e.expense_date?.startsWith(monthStr)) || [];
      
      monthlyStats.push({
        month: monthStr,
        amount: monthExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
        count: monthExpenses.length,
      });
    }

    return NextResponse.json({
      summary: {
        totalCount,
        totalAmount,
        avgAmount: totalCount > 0 ? totalAmount / totalCount : 0,
      },
      typeStats,
      projectDetails,
      monthlyStats,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
