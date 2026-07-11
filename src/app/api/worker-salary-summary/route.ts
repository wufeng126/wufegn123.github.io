import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const projectId = searchParams.get('project_id');
    const workerId = searchParams.get('worker_id');

    const client = getSupabaseClient();
    
    // 构建基础查询
    let query = client
      .from('worker_salaries')
      .select(`
        id,
        worker_id,
        project_id,
        year_month,
        work_hours,
        hourly_rate,
        contract_work_pay,
        gross_pay,
        income_tax,
        advance_pay,
        labor_insurance,
        net_pay,
        remark,
        workers (id, name),
        projects (id, name)
      `);
    
    // 应用年份筛选
    if (year) {
      query = query.like('year_month', `${year}-%`);
    }
    
    // 应用项目筛选
    if (projectId) {
      query = query.eq('project_id', parseInt(projectId));
    }
    
    // 应用工人筛选
    if (workerId) {
      query = query.eq('worker_id', parseInt(workerId));
    }
    
    const { data: salaries, error } = await query.order('year_month', { ascending: false });
    
    if (error) {
      throw new Error(`查询工资数据失败: ${error.message}`);
    }
    
    // 按工人汇总数据
    const workerSummaryMap = new Map<number, {
      worker_id: number;
      worker_name: string;
      total_gross_pay: number;
      total_net_pay: number;
      total_work_hours: number;
      total_income_tax: number;
      total_advance_pay: number;
      total_labor_insurance: number;
      months: { month: string; gross_pay: number; net_pay: number; project_name: string | null }[];
    }>();
    
    (salaries || []).forEach((salary: any) => {
      const workerId = salary.worker_id;
      const workerName = salary.workers?.name || '未知';
      const projectName = salary.projects?.name || null;
      const grossPay = parseFloat(salary.gross_pay) || 0;
      const netPay = parseFloat(salary.net_pay) || 0;
      const workHours = parseFloat(salary.work_hours) || 0;
      const incomeTax = parseFloat(salary.income_tax) || 0;
      const advancePay = parseFloat(salary.advance_pay) || 0;
      const laborInsurance = parseFloat(salary.labor_insurance) || 0;
      
      if (!workerSummaryMap.has(workerId)) {
        workerSummaryMap.set(workerId, {
          worker_id: workerId,
          worker_name: workerName,
          total_gross_pay: 0,
          total_net_pay: 0,
          total_work_hours: 0,
          total_income_tax: 0,
          total_advance_pay: 0,
          total_labor_insurance: 0,
          months: [],
        });
      }
      
      const summary = workerSummaryMap.get(workerId)!;
      summary.total_gross_pay += grossPay;
      summary.total_net_pay += netPay;
      summary.total_work_hours += workHours;
      summary.total_income_tax += incomeTax;
      summary.total_advance_pay += advancePay;
      summary.total_labor_insurance += laborInsurance;
      summary.months.push({
        month: salary.year_month,
        gross_pay: grossPay,
        net_pay: netPay,
        project_name: projectName,
      });
    });
    
    const summaryData = Array.from(workerSummaryMap.values());
    
    return NextResponse.json({
      summary: summaryData,
      total: summaryData.length,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
