import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { logSecurityEvent } from '@/lib/security-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { parseNumeric, validateClientPayment } from '@/lib/business-logic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);

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

    const total = data?.reduce((sum, record) => {
      return sum + parseNumeric(record.payment_amount);
    }, 0) || 0;

    const totalPaid = data?.filter(r => r.status === 'completed').reduce((sum, record) => {
      return sum + parseNumeric(record.payment_amount);
    }, 0) || 0;

    const totalPending = data?.filter(r => r.status === 'pending').reduce((sum, record) => {
      return sum + parseNumeric(record.payment_amount);
    }, 0) || 0;

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

    const monthMap = new Map<string, number>();
    data?.forEach(record => {
      if (record.payment_date) {
        const month = record.payment_date.substring(0, 7);
        const current = monthMap.get(month) || 0;
        monthMap.set(month, current + parseNumeric(record.payment_amount));
      }
    });

    const trendData = Array.from(monthMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

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
      trendData,
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { project_id, amount, payment_date, payment_method, status, remark } = body;

    if (!project_id || amount == null || !payment_date) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const projectId = parseInt(project_id);
    const paymentAmount = Number(amount);

    if ((status || 'completed') === 'completed') {
      const validation = await validateClientPayment({
        project_id: projectId,
        payment_amount: paymentAmount,
      });
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message }, { status: 400 });
      }
    }

    const { data, error } = await insertWithSequenceFix('client_payments', {
      project_id: projectId,
      payment_amount: paymentAmount,
      payment_date,
      payment_method: payment_method || 'bank_transfer',
      status: status || 'completed',
      remark,
    }, client);

    const paymentData = Array.isArray(data) ? data[0] : data;

    if (error) {
      throw new Error(`创建付款记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'client_payment',
      resourceId: paymentData?.id,
      details: { project_id: projectId, amount: paymentAmount, payment_date, payment_method },
      request,
    });

    await logSecurityEvent({
      event_type: 'client_payment_create',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { project_id: projectId, payment_amount: paymentAmount, payment_date, payment_method },
    });

    await pushBusinessNotification({
      type: 'new_client_payment',
      title: '新增甲方回款',
      content: `新增甲方回款记录，金额 ¥${paymentAmount.toLocaleString()}，回款日期 ${payment_date}，方式 ${payment_method || '-'}`,
      severity: 'info',
      projectId,
      relatedId: paymentData?.id,
      relatedType: 'client_payment',
      metadata: { project_id: projectId, amount: paymentAmount, payment_date, payment_method },
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, amount, payment_date, payment_method, status, remark } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const paymentId = parseInt(id);

    const { data: currentPayment, error: currentError } = await client
      .from('client_payments')
      .select('id, project_id, payment_amount, status')
      .eq('id', paymentId)
      .single();

    if (currentError || !currentPayment) {
      return NextResponse.json({ error: '付款记录不存在' }, { status: 404 });
    }

    const nextAmount = amount !== undefined ? Number(amount) : parseNumeric(currentPayment.payment_amount);
    const nextStatus = status || currentPayment.status || 'completed';

    if (nextStatus === 'completed') {
      const validation = await validateClientPayment({
        project_id: Number(currentPayment.project_id),
        payment_amount: nextAmount,
        exclude_payment_id: paymentId,
      });
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message }, { status: 400 });
      }
    }

    const updateData: any = {
      payment_amount: nextAmount,
      payment_date,
      payment_method: payment_method || 'bank_transfer',
      status: nextStatus,
      remark,
    };

    const { data, error } = await client
      .from('client_payments')
      .update(updateData)
      .eq('id', paymentId)
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

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
