import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { decodeJwt } from 'jose';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { isSuperAdminUser } from '@/lib/route-permissions';
import { logSecurityEvent } from '@/lib/security-log';

// 安全解析 numeric 类型（PostgreSQL numeric 返回对象格式如 { "$numberDecimal": "123.45" } 或 { "0": "...", "1": 1, "2": 1, "3": false, ... }）
function parseNumeric(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  // 处理 { "$numberDecimal": "123.45" } 格式
  if (typeof value === 'object' && '$numberDecimal' in value) {
    return parseFloat(value.$numberDecimal) || 0;
  }
  // 处理 { "0": "-", "1": "2", "2": ".", ... } 格式（Decimal.js 对象的 JSON 序列化）
  if (typeof value === 'object' && !('$numberDecimal' in value)) {
    try {
      const str = String(value);
      // 如果能转成数字
      const num = parseFloat(str);
      if (!isNaN(num)) return num;
      // 尝试提取数字部分
      const match = str.match(/-?\d+\.?\d*/);
      if (match) return parseFloat(match[0]) || 0;
    } catch (e) {}
  }
  return 0;
}

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

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

    // 项目过滤
    if (projectId && projectId !== 'all') {
      const pid = parseInt(projectId);
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ payments: [], total: '0', totalPaid: '0', totalPending: '0', chartData: [], trendData: [] });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询付款记录失败: ${error.message}`);
    }

    // 计算总金额
    const total = data?.reduce((sum, record) => {
      return sum + parseNumeric(record.payment_amount);
    }, 0) || 0;

    // 计算已完成付款金额
    const totalPaid = data?.filter(r => r.status === 'completed').reduce((sum, record) => {
      return sum + parseNumeric(record.payment_amount);
    }, 0) || 0;

    // 计算待确认付款金额
    const totalPending = data?.filter(r => r.status === 'pending').reduce((sum, record) => {
      return sum + parseNumeric(record.payment_amount);
    }, 0) || 0;

    // 按项目统计图表数据
    const projectMap = new Map<string, number>();
    data?.forEach(record => {
      const projectName = (record.projects as any)?.name || '未知项目';
      const current = projectMap.get(projectName) || 0;
      projectMap.set(projectName, current + parseNumeric(record.payment_amount));
    });

    const chartData = Array.from(projectMap.entries()).map(([project, amount]) => ({
      project,
      amount,
    }));

    // 按月份统计趋势数据
    const monthMap = new Map<string, number>();
    data?.forEach(record => {
      if (record.payment_date) {
        const month = record.payment_date.substring(0, 7); // YYYY-MM
        const current = monthMap.get(month) || 0;
        monthMap.set(month, current + parseNumeric(record.payment_amount));
      }
    });

    const trendData = Array.from(monthMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 格式化返回数据
    const payments = data?.map(record => ({
      id: record.id,
      project_id: record.project_id,
      project_name: (record.projects as any)?.name || '未知项目',
      amount: parseNumeric(record.payment_amount),
      payment_amount: parseNumeric(record.payment_amount),
      payment_date: record.payment_date,
      payment_method: record.payment_method || 'bank_transfer',
      status: record.status || 'completed',
      remark: record.remark,
    })) || [];

    return NextResponse.json({ 
      payments,
      total: total.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalPending: totalPending.toFixed(2),
      chartData,
      trendData
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project_id, amount, payment_date, payment_method, status, remark } = body;

    if (!project_id || amount == null || !payment_date) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 超额检查：累计付款不能超过该项目已审核报量金额
    const projectId = parseInt(project_id);
    const paymentAmount = Number(amount);
    
    // 查询该项目已审核报量总额
    const { data: reportData } = await client
      .from('client_reports')
      .select('report_amount, settlement_amount')
      .eq('project_id', projectId)
      .in('status', ['reviewed', 'draft']); // 已审核或草稿报量都计入
    
    const totalReported = reportData?.reduce((sum, r) => {
      return sum + parseNumeric(r.settlement_amount || r.report_amount);
    }, 0) || 0;
    
    // 查询该项目已有付款总额（排除当前待确认的pending记录）
    const { data: existingPayments } = await client
      .from('client_payments')
      .select('payment_amount')
      .eq('project_id', projectId)
      .eq('status', 'completed');
    
    const totalPaid = existingPayments?.reduce((sum, p) => sum + parseNumeric(p.payment_amount), 0) || 0;
    
    if (totalPaid + paymentAmount > totalReported && totalReported > 0) {
      return NextResponse.json({ 
        error: `回款超额：已回款 ¥${totalPaid.toLocaleString()} + 本次 ¥${paymentAmount.toLocaleString()} = ¥${(totalPaid + paymentAmount).toLocaleString()}，超过报量金额 ¥${totalReported.toLocaleString()}` 
      }, { status: 400 });
    }
    
    const { data, error } = await insertWithSequenceFix('client_payments', { 
        project_id: parseInt(project_id),
        payment_amount: amount,
        payment_date,
        payment_method: payment_method || 'bank_transfer',
        status: status || 'completed',
        remark
      }, client);

    const paymentData = Array.isArray(data) ? data[0] : data;

    if (error) {
      throw new Error(`创建付款记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'client_payment',
      resourceId: paymentData?.id,
      details: { project_id, amount, payment_date, payment_method },
      request,
    });

    await logSecurityEvent({
      event_type: 'client_payment_create',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { project_id, payment_amount: amount, payment_date, payment_method },
    });

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_client_payment',
      title: '新增甲方回款',
      content: `新增甲方回款记录，金额: ¥${Number(amount).toLocaleString()}，回款日期: ${payment_date}，方式: ${payment_method || '-'}`,
      severity: 'info',
      projectId: project_id ? parseInt(String(project_id)) : undefined,
      relatedId: paymentData?.id,
      relatedType: 'client_payment',
      metadata: { project_id, amount, payment_date, payment_method },
    });

    return NextResponse.json({ payment: paymentData });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, amount, payment_date, payment_method, status, remark } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: any = {
      payment_amount: amount,
      payment_date,
      payment_method: payment_method || 'bank_transfer',
      status: status || 'completed',
      remark,
    };

    const { data, error } = await client
      .from('client_payments')
      .update(updateData)
      .eq('id', parseInt(id))
      .select();

    if (error) {
      throw new Error(`更新付款记录失败: ${error.message}`);
    }

    return NextResponse.json({ payment: data?.[0] });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from('client_payments')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除付款记录失败: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
