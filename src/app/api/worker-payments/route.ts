import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const workerId = searchParams.get('worker_id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const client = getSupabaseClient();
    
    // 查询工资发放记录
    let query = client
      .from('salary_payments')
      .select(`
        id,
        salary_id,
        worker_id,
        project_id,
        year_month,
        payment_amount,
        payment_date,
        payment_type,
        remark,
        created_at,
        workers (
          name
        ),
        projects (
          name
        )
      `)
      .order('payment_date', { ascending: false });

    if (workerId && workerId !== 'all') {
      query = query.eq('worker_id', parseInt(workerId));
    }

    if (startDate) {
      query = query.gte('payment_date', startDate);
    }

    if (endDate) {
      query = query.lte('payment_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询工资发放记录失败: ${error.message}`);
    }

    // 格式化返回数据
    const payments = data?.map(record => ({
      id: record.id,
      salary_id: record.salary_id,
      worker_id: record.worker_id,
      worker_name: (record.workers as any)?.name || '未知工人',
      project_id: record.project_id,
      project_name: (record.projects as any)?.name || '未知项目',
      year_month: record.year_month,
      payment_date: record.payment_date,
      payment_type: record.payment_type || '甲方代付',
      amount: record.payment_amount,
      payment_method: record.payment_type === '甲方代付' ? '甲方代付' : '银行转账',
      status: 'completed', // 已发放
      remark: record.remark,
      created_at: record.created_at,
    })) || [];

    // 根据 status 过滤（在获取数据后过滤）
    let filteredPayments = payments;
    if (status && status !== 'all') {
      filteredPayments = payments.filter(p => p.status === status);
    }

    return NextResponse.json({ payments: filteredPayments });
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
    const { salary_id, worker_id, project_id, year_month, amount, payment_date, payment_type, remark } = body;

    if (worker_id == null || project_id == null || amount == null || !payment_date) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const insertData: any = {
      worker_id: parseInt(worker_id),
      project_id: parseInt(project_id),
      payment_amount: amount,
      payment_date,
      payment_type: payment_type || '甲方代付',
      remark,
    };

    // 如果有 salary_id 则添加
    if (salary_id) {
      insertData.salary_id = parseInt(salary_id);
    }

    // 如果有 year_month 则添加
    if (year_month) {
      insertData.year_month = year_month;
    }

    const result = await insertWithSequenceFix('salary_payments', insertData, client);

    if (result.error) {
      throw new Error(`创建发放记录失败: ${result.error.message}`);
    }

    const payment = Array.isArray(result.data) ? result.data[0] : result.data;

    await auditLog({
      operationType: 'create',
      resourceType: 'salary_payment',
      resourceId: payment?.id || 0,
      details: { worker_id, project_id, amount, payment_date, payment_type },
      request,
    });

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_worker_payment',
      title: '新增工资发放',
      content: `新增工资发放记录，金额: ¥${Number(amount).toLocaleString()}，发放日期: ${payment_date}`,
      severity: 'info',
      projectId: project_id ? parseInt(String(project_id)) : undefined,
      relatedId: payment?.id,
      relatedType: 'salary_payment',
      metadata: { worker_id, project_id, amount, payment_date, payment_type },
    });

    return NextResponse.json({ payment });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
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

    // 删除前获取关联的 salary_id，用于后续同步状态
    const { data: recordToDelete } = await client
      .from('salary_payments')
      .select('id, salary_id')
      .eq('id', parseInt(id))
      .single();

    const { error } = await client
      .from('salary_payments')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除发放记录失败: ${error.message}`);
    }

    // 同步关联工资记录的发放状态
    if (recordToDelete?.salary_id) {
      const { syncSalaryPaymentStatus } = await import('@/lib/business-logic');
      await syncSalaryPaymentStatus(recordToDelete.salary_id);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'salary_payment',
      resourceId: parseInt(id),
      details: {},
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
