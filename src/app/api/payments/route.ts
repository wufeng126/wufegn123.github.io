import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const supplierId = searchParams.get('supplier_id');
    const projectId = searchParams.get('project_id');
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    
    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
    if (id) {
      // 获取单个付款记录
      const { data, error } = await client
        .from('payments')
        .select(`
          *,
          supplier:suppliers(id, name, type),
          project:projects(id, name)
        `)
        .eq('id', parseInt(id))
        .single();

      if (error) {
        throw new Error(`查询付款记录失败: ${error.message}`);
      }
      
      // 检查权限
      if (accessibleProjects && !accessibleProjects.includes(data.project_id)) {
        return NextResponse.json({ error: '无权访问该记录' }, { status: 403 });
      }

      const payment = {
        ...data,
        supplier_name: data.supplier?.name || '',
        supplier_type: data.supplier?.type || '',
        project_name: data.project?.name || '',
      };

      return NextResponse.json({ payment });
    }

    // 查询列表
    let query = client
      .from('payments')
      .select(`
        *,
        supplier:suppliers(id, name, type),
        project:projects(id, name)
      `)
      .order('payment_date', { ascending: false });

    if (supplierId) {
      query = query.eq('supplier_id', parseInt(supplierId));
    }
    
    // 项目过滤
    if (projectId) {
      const pid = parseInt(projectId);
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ payments: [] });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询付款记录失败: ${error.message}`);
    }

    // 格式化返回数据
    const payments = (data || []).map((item: any) => ({
      ...item,
      supplier_name: item.supplier?.name || '',
      supplier_type: item.supplier?.type || '',
      project_name: item.project?.name || '',
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { 
      supplier_id, 
      project_id,
      payment_amount, 
      payment_date,
      payment_method,
      voucher_number,
      remark 
    } = body;

    if (!supplier_id || !payment_amount || !payment_date) {
      return NextResponse.json({ error: '请填写供应商、付款金额和付款日期' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { data: payData, error: payError } = await insertWithSequenceFix('payments', {
        supplier_id: parseInt(supplier_id),
        project_id: project_id ? parseInt(project_id) : null,
        payment_amount: parseFloat(payment_amount),
        payment_date,
        payment_method: payment_method || null,
        voucher_number: voucher_number || null,
        remark: remark || null,
      }, client);
    if (payError) throw payError;
    const payment = Array.isArray(payData) ? payData[0] : payData;
    return NextResponse.json({ payment });
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
    const { 
      id,
      supplier_id, 
      project_id,
      payment_amount, 
      payment_date,
      payment_method,
      voucher_number,
      remark 
    } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少付款记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const updateData: any = {};
    if (supplier_id !== undefined) updateData.supplier_id = parseInt(supplier_id);
    if (project_id !== undefined) updateData.project_id = project_id ? parseInt(project_id) : null;
    if (payment_amount !== undefined) updateData.payment_amount = parseFloat(payment_amount);
    if (payment_date !== undefined) updateData.payment_date = payment_date;
    if (payment_method !== undefined) updateData.payment_method = payment_method || null;
    if (voucher_number !== undefined) updateData.voucher_number = voucher_number || null;
    if (remark !== undefined) updateData.remark = remark || null;

    const { data, error } = await client
      .from('payments')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`更新付款记录失败: ${error.message}`);
    }

    return NextResponse.json({ payment: data });
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
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: '请提供要删除的付款记录ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的付款记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { error } = await client
      .from('payments')
      .delete()
      .in('id', idArray);

    if (error) {
      throw new Error(`删除付款记录失败: ${error.message}`);
    }

    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
