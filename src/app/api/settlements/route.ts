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
    const month = searchParams.get('month');
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    
    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
    if (id) {
      // 获取单个结算记录
      const { data, error } = await client
        .from('settlements')
        .select(`
          *,
          supplier:suppliers(id, name, type),
          project:projects(id, name)
        `)
        .eq('id', parseInt(id))
        .single();

      if (error) {
        throw new Error(`查询结算记录失败: ${error.message}`);
      }
      
      // 检查权限
      if (accessibleProjects && !accessibleProjects.includes(data.project_id)) {
        return NextResponse.json({ error: '无权访问该记录' }, { status: 403 });
      }

      const settlement = {
        ...data,
        supplier_name: data.supplier?.name || '',
        supplier_type: data.supplier?.type || '',
        project_name: data.project?.name || '',
      };

      return NextResponse.json({ settlement });
    }

    // 查询列表
    let query = client
      .from('settlements')
      .select(`
        *,
        supplier:suppliers(id, name, type),
        project:projects(id, name)
      `)
      .order('settlement_date', { ascending: false });

    if (supplierId) {
      query = query.eq('supplier_id', parseInt(supplierId));
    }
    
    // 项目过滤
    if (projectId) {
      const pid = parseInt(projectId);
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ settlements: [] });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }
    
    if (month) {
      query = query.eq('settlement_month', month);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询结算记录失败: ${error.message}`);
    }

    // 格式化返回数据
    const settlements = (data || []).map((item: any) => ({
      ...item,
      supplier_name: item.supplier?.name || '',
      supplier_type: item.supplier?.type || '',
      project_name: item.project?.name || '',
    }));

    return NextResponse.json({ settlements });
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
    console.log('[settlements POST] Request body:', JSON.stringify(body, null, 2));
    
    const { 
      supplier_id, 
      project_id,
      settlement_type, 
      settlement_content, 
      settlement_quantity,
      settlement_unit,
      settlement_amount, 
      settlement_month,
      settlement_date,
      remark,
      id // 排除前端可能传递的 id
    } = body;
    
    // 确保不使用前端传递的 id
    if (id) {
      console.warn('[settlements POST] Warning: id field was passed in request body, ignoring it');
    }

    if (!supplier_id || !settlement_amount || !settlement_month) {
      return NextResponse.json({ error: '请填写供应商、结算金额和结算月份' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { data: setData, error: setError } = await insertWithSequenceFix('settlements', {
        supplier_id: parseInt(supplier_id),
        project_id: project_id ? parseInt(project_id) : null,
        settlement_type: settlement_type || null,
        settlement_content: settlement_content || null,
        settlement_quantity: settlement_quantity ? parseFloat(settlement_quantity) : null,
        settlement_unit: settlement_unit || null,
        settlement_amount: parseFloat(settlement_amount),
        settlement_month,
        settlement_date: settlement_date || null,
        remark: remark || null,
      }, client);
    if (setError) throw setError;
    const settlement = Array.isArray(setData) ? setData[0] : setData;
    return NextResponse.json({ settlement });
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
      settlement_type, 
      settlement_content, 
      settlement_quantity,
      settlement_unit,
      settlement_amount, 
      settlement_month,
      settlement_date,
      remark 
    } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少结算记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const updateData: any = {};
    if (supplier_id !== undefined) updateData.supplier_id = parseInt(supplier_id);
    if (project_id !== undefined) updateData.project_id = project_id ? parseInt(project_id) : null;
    if (settlement_type !== undefined) updateData.settlement_type = settlement_type || null;
    if (settlement_content !== undefined) updateData.settlement_content = settlement_content || null;
    if (settlement_quantity !== undefined) updateData.settlement_quantity = settlement_quantity ? parseFloat(settlement_quantity) : null;
    if (settlement_unit !== undefined) updateData.settlement_unit = settlement_unit || null;
    if (settlement_amount !== undefined) updateData.settlement_amount = parseFloat(settlement_amount);
    if (settlement_month !== undefined) updateData.settlement_month = settlement_month;
    if (settlement_date !== undefined) updateData.settlement_date = settlement_date || null;
    if (remark !== undefined) updateData.remark = remark || null;

    const { data, error } = await client
      .from('settlements')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`更新结算记录失败: ${error.message}`);
    }

    return NextResponse.json({ settlement: data });
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
      return NextResponse.json({ error: '请提供要删除的结算记录ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的结算记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { error } = await client
      .from('settlements')
      .delete()
      .in('id', idArray);

    if (error) {
      throw new Error(`删除结算记录失败: ${error.message}`);
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
