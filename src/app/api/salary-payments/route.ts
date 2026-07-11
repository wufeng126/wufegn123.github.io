import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { syncSalaryPaymentStatus } from '@/lib/business-logic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const project_id = searchParams.get('project_id');
    const worker_id = searchParams.get('worker_id');

    const client = getSupabaseClient();
    
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
        workers(name),
        projects(name)
      `)
      .order('created_at', { ascending: false });

    if (month) {
      query = query.eq('year_month', month);
    }
    if (project_id) {
      query = query.eq('project_id', parseInt(project_id));
    }
    if (worker_id) {
      query = query.eq('worker_id', parseInt(worker_id));
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询工资发放记录失败: ${error.message}`);
    }

    // 转换数据格式
    const payments = data?.map(p => ({
      id: p.id,
      salary_id: p.salary_id,
      worker_id: p.worker_id,
      worker_name: (p.workers as any)?.name || '-',
      project_id: p.project_id,
      project_name: (p.projects as any)?.name || '-',
      year_month: p.year_month,
      payment_amount: p.payment_amount,
      payment_date: p.payment_date,
      payment_type: p.payment_type,
      remark: p.remark,
      created_at: p.created_at,
    }));

    return NextResponse.json({ payments });
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
    const { salary_id, worker_id, project_id, year_month, payment_amount, payment_date, payment_type, remark } = body;

    if (!worker_id || !project_id || !year_month || !payment_amount || !payment_date) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 超额检查：发放金额不能超过实发工资
    if (salary_id) {
      const { data: salaryRecord } = await client
        .from('worker_salaries')
        .select('id, net_pay, payment_status')
        .eq('id', parseInt(String(salary_id)))
        .single();

      if (salaryRecord) {
        const netPay = Number(salaryRecord.net_pay || 0);
        
        // 查询已发放金额
        const { data: existingPayments } = await client
          .from('salary_payments')
          .select('payment_amount')
          .eq('salary_id', parseInt(String(salary_id)));
        
        const totalPaid = (existingPayments || []).reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);
        
        if (totalPaid + Number(payment_amount) > netPay) {
          return NextResponse.json({ 
            error: `发放超额：实发工资 ¥${netPay.toLocaleString()}，已发放 ¥${totalPaid.toLocaleString()}，本次 ¥${Number(payment_amount).toLocaleString()} 超出余额` 
          }, { status: 400 });
        }
      }
    }
    
    const { data: salData, error: salError } = await insertWithSequenceFix('salary_payments', {
        salary_id: salary_id || null,
        worker_id: parseInt(worker_id),
        project_id: parseInt(project_id),
        year_month,
        payment_amount: payment_amount.toString(),
        payment_date,
        payment_type: payment_type || '甲方代付',
        remark: remark || null,
      }, client);
    if (salError) throw salError;
    const payment = Array.isArray(salData) ? salData[0] : salData;

    // 同步工资发放状态
    if (salary_id) {
      await syncSalaryPaymentStatus(parseInt(String(salary_id)));
    }

    // 审计日志
    await auditLog({
      operationType: 'salary_pay',
      resourceType: 'salary_payment',
      resourceId: payment?.id,
      details: { salary_id, worker_id, project_id, year_month, payment_amount, payment_date, payment_type },
      request,
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
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: '请提供要删除的记录ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { error } = await client
      .from('salary_payments')
      .delete()
      .in('id', idArray);

    if (error) {
      throw new Error(`删除工资发放记录失败: ${error.message}`);
    }

    // 获取被删除记录关联的 salary_id 以同步状态
    // 由于记录已删除，需要从前端传入或通过其他方式获取
    // 这里遍历删除的 ID 对应的工资记录进行同步
    for (const id of idArray) {
      // salary_payments 已被删除，无法获取 salary_id
      // 改为：重新同步所有工资状态（开销可控，因为不会频繁删除）
    }
    // 批量同步所有工资发放状态
    const { syncAllSalaryPaymentStatus } = await import('@/lib/business-logic');
    await syncAllSalaryPaymentStatus();

    // 审计日志
    await auditLog({
      operationType: 'delete',
      resourceType: 'salary_payment',
      details: { deletedIds: idArray, count: idArray.length },
      request,
    });

    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
