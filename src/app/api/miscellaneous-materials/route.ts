import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { isReviewedStatus, isVoidedStatus, REVIEW_STATUS, validateStatusTransition } from '@/lib/business-logic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const materialName = searchParams.get('materialName');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
    // 先获取总数
    let countQuery = client
      .from('miscellaneous_materials')
      .select('id', { count: 'exact', head: true });

    // 项目过滤
    if (projectId && projectId !== 'all') {
      const pid = parseInt(projectId);
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ data: [], total: 0, page, pageSize });
      }
      countQuery = countQuery.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      countQuery = countQuery.in('project_id', accessibleProjects);
    }
    
    if (materialName) {
      countQuery = countQuery.ilike('material_name', `%${materialName}%`);
    }
    if (startDate) {
      countQuery = countQuery.gte('purchase_date', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('purchase_date', endDate);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new Error(`查询零星材料总数失败: ${countError.message}`);
    }

    // 获取分页数据
    let query = client
      .from('miscellaneous_materials')
      .select(`
        *,
        projects(id, name)
      `)
      .order('purchase_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (projectId && projectId !== 'all') {
      const pid = parseInt(projectId);
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      query = query.in('project_id', accessibleProjects);
    }
    if (materialName) {
      query = query.ilike('material_name', `%${materialName}%`);
    }
    if (startDate) {
      query = query.gte('purchase_date', startDate);
    }
    if (endDate) {
      query = query.lte('purchase_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询零星材料失败: ${error.message}`);
    }

    // 计算汇总统计（基于当前筛选条件）
    const activeData = (data || []).filter((item: any) => !isVoidedStatus(item.status));

    let totalAmount = 0;
    const projectStats: Record<string, number> = {};

    activeData.forEach((item: any) => {
      const amount = parseFloat(item.amount || '0');
      totalAmount += amount;

      const projectName = item.projects?.name || '未知项目';
      if (!projectStats[projectName]) {
        projectStats[projectName] = 0;
      }
      projectStats[projectName] += amount;
    });

    const materials = (data || []).map((item: any) => {
      return {
        id: item.id,
        project_id: item.project_id,
        material_name: item.material_name,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.amount,
        purchase_date: item.purchase_date,
        supplier: item.purchaser,
        remark: item.remark,
        status: item.status || REVIEW_STATUS.DRAFT,
        reviewed_at: item.reviewed_at,
        reviewed_by: item.reviewed_by,
        created_at: item.created_at,
        projects: item.projects,
      };
    });

    const totalPages = Math.ceil((count || 0) / pageSize);

    return NextResponse.json({ 
      materials,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages,
      },
      stats: {
        totalCount: activeData.length,
        totalAmount,
        projectStats,
      }
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
    const records = Array.isArray(body) ? body : [body];
    
    const client = getSupabaseClient();
    
    const projectIds = [...new Set(records.map(r => parseInt(r.project_id)).filter(Boolean))];
    if (projectIds.length === 0) {
      return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    }

    const { data: projectsData, error: projectError } = await client
      .from('projects')
      .select('id, name')
      .in('id', projectIds);

    if (projectError) {
      throw new Error(`查询项目失败: ${projectError.message}`);
    }

    const validProjectIds = new Set(projectsData?.map((p: any) => p.id) || []);
    const invalidProjects = projectIds.filter(id => !validProjectIds.has(id));
    if (invalidProjects.length > 0) {
      return NextResponse.json({ 
        error: `以下项目ID不存在: ${invalidProjects.join(', ')}` 
      }, { status: 400 });
    }

    const insertData = records.map(record => {
      const { 
        project_id, material_name, unit, 
        quantity, unit_price, purchase_date, supplier, remark 
      } = record;

      const qty = parseFloat(quantity) || 0;
      const price = parseFloat(unit_price) || 0;
      const amount = Math.round(qty * price * 100) / 100;

      return {
        project_id: parseInt(project_id),
        material_name: material_name?.trim() || '未命名材料',
        unit: unit?.trim() || null,
        quantity: qty,
        unit_price: price,
        amount,
        purchase_date: purchase_date || new Date().toISOString().split('T')[0],
        purchaser: supplier?.trim() || null,
        remark: remark?.trim() || null,
        status: REVIEW_STATUS.DRAFT,
      };
    }).filter(item => item.project_id && item.material_name);

    if (insertData.length === 0) {
      return NextResponse.json({ error: '没有有效的数据' }, { status: 400 });
    }

    const { data, error } = await insertWithSequenceFix('miscellaneous_materials', insertData, client);

    if (error) {
      throw new Error(`创建零星材料记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'miscellaneous_material',
      details: { count: insertData.length, projectIds },
      request,
    });

    return NextResponse.json({ materials: data, count: data?.length || 0 });
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
    const { id, project_id, material_name, unit, quantity, unit_price, purchase_date, supplier, remark, status } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const materialId = parseInt(id);

    const { data: currentMaterial, error: currentError } = await client
      .from('miscellaneous_materials')
      .select('id, status, quantity, unit_price, amount')
      .eq('id', materialId)
      .single();

    if (currentError || !currentMaterial) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    if (isVoidedStatus(currentMaterial.status)) {
      return NextResponse.json({ error: '已作废记录不可修改' }, { status: 400 });
    }

    if (isReviewedStatus(currentMaterial.status) && (quantity !== undefined || unit_price !== undefined) && status !== REVIEW_STATUS.DRAFT) {
      return NextResponse.json({ error: '已审核记录不可修改金额，请先反审核' }, { status: 400 });
    }

    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unit_price) || 0;
    const amount = Math.round(qty * price * 100) / 100;

    const updateData: Record<string, any> = {
      project_id: parseInt(project_id),
      material_name: material_name?.trim() || '未命名材料',
      unit: unit?.trim() || null,
      quantity: qty,
      unit_price: price,
      amount,
      purchase_date: purchase_date || new Date().toISOString().split('T')[0],
      purchaser: supplier?.trim() || null,
      remark: remark?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      const validation = validateStatusTransition(currentMaterial.status || REVIEW_STATUS.DRAFT, status);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message || '状态流转不合法' }, { status: 400 });
      }
      updateData.status = status;
      if (status === REVIEW_STATUS.REVIEWED) {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = auth.user.username || auth.user.name || 'system';
      } else if (status === REVIEW_STATUS.DRAFT) {
        updateData.reviewed_at = null;
        updateData.reviewed_by = null;
      }
    }

    const { data, error } = await client
      .from('miscellaneous_materials')
      .update(updateData)
      .eq('id', materialId)
      .select();

    if (error) {
      throw new Error(`更新零星材料记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'miscellaneous_material',
      resourceId: materialId,
      details: { material_name, quantity, unit_price, amount },
      request,
    });

    return NextResponse.json({ materials: data });
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
    const materialId = parseInt(id);

    const { data: currentMaterial } = await client
      .from('miscellaneous_materials')
      .select('status')
      .eq('id', materialId)
      .single();

    if (isReviewedStatus(currentMaterial?.status) || isVoidedStatus(currentMaterial?.status)) {
      return NextResponse.json({ error: '已审核或已作废记录不可删除' }, { status: 400 });
    }

    const { error } = await client
      .from('miscellaneous_materials')
      .delete()
      .eq('id', materialId);

    if (error) {
      throw new Error(`删除零星材料记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'miscellaneous_material',
      resourceId: materialId,
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
