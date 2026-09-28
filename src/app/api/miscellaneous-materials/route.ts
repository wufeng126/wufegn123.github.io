import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { invalidateAggregationCache } from '@/lib/data-aggregation';
import { isReviewedStatus, isVoidedStatus, REVIEW_STATUS, validateStatusTransition } from '@/lib/business-logic';
import {
  calculateMiscellaneousMaterialAmount,
  parsePositiveMiscellaneousMaterialNumber,
} from '@/lib/miscellaneous-materials';

interface MiscMaterialStatsRow {
  quantity: string | number | null;
  unit_price: string | number | null;
  amount?: string | number | null;
  status: string | null;
  projects?: { name?: string | null } | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const materialName = searchParams.get('materialName');
    const specification = searchParams.get('specification');
    const purchaser = searchParams.get('purchaser');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    const emptyPayload = {
      materials: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      stats: {
        totalCount: 0,
        totalAmount: 0,
        reviewedCount: 0,
        reviewedAmount: 0,
        reviewedAvgUnitPrice: 0,
        draftCount: 0,
        draftAmount: 0,
        voidedCount: 0,
        voidedAmount: 0,
        projectStats: {},
      },
    };
    if (accessibleProjects !== null && accessibleProjects.length === 0) {
      return NextResponse.json(emptyPayload);
    }
    
    // 先获取总数
    let countQuery = client
      .from('miscellaneous_materials')
      .select('id', { count: 'exact', head: true });

    // 项目过滤
    if (projectId && projectId !== 'all') {
      const pid = parseInt(projectId);
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json(emptyPayload);
      }
      countQuery = countQuery.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      countQuery = countQuery.in('project_id', accessibleProjects);
    }
    
    if (materialName) {
      countQuery = countQuery.ilike('material_name', `%${materialName}%`);
    }
    if (specification) {
      countQuery = countQuery.ilike('specification', `%${specification}%`);
    }
    if (purchaser) {
      countQuery = countQuery.ilike('purchaser', `%${purchaser}%`);
    }
    if (startDate) {
      countQuery = countQuery.gte('purchase_date', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('purchase_date', endDate);
    }
    if (status && status !== 'all') {
      countQuery = status === REVIEW_STATUS.DRAFT
        ? countQuery.or('status.eq.draft,status.is.null')
        : countQuery.eq('status', status);
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
    if (specification) {
      query = query.ilike('specification', `%${specification}%`);
    }
    if (purchaser) {
      query = query.ilike('purchaser', `%${purchaser}%`);
    }
    if (startDate) {
      query = query.gte('purchase_date', startDate);
    }
    if (endDate) {
      query = query.lte('purchase_date', endDate);
    }
    if (status && status !== 'all') {
      query = status === REVIEW_STATUS.DRAFT
        ? query.or('status.eq.draft,status.is.null')
        : query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询零星材料失败: ${error.message}`);
    }

    // 统计基于全部筛选结果，不能只按当前分页计算。
    let statsQuery = client
      .from('miscellaneous_materials')
      .select(`
        id,
        project_id,
        quantity,
        unit_price,
        amount,
        status,
        projects(id, name)
      `);

    if (projectId && projectId !== 'all') {
      statsQuery = statsQuery.eq('project_id', parseInt(projectId));
    } else if (accessibleProjects !== null) {
      statsQuery = statsQuery.in('project_id', accessibleProjects);
    }
    if (materialName) {
      statsQuery = statsQuery.ilike('material_name', `%${materialName}%`);
    }
    if (specification) {
      statsQuery = statsQuery.ilike('specification', `%${specification}%`);
    }
    if (purchaser) {
      statsQuery = statsQuery.ilike('purchaser', `%${purchaser}%`);
    }
    if (startDate) {
      statsQuery = statsQuery.gte('purchase_date', startDate);
    }
    if (endDate) {
      statsQuery = statsQuery.lte('purchase_date', endDate);
    }
    if (status && status !== 'all') {
      statsQuery = status === REVIEW_STATUS.DRAFT
        ? statsQuery.or('status.eq.draft,status.is.null')
        : statsQuery.eq('status', status);
    }

    const { data: statsData, error: statsError } = await statsQuery;
    if (statsError) {
      throw new Error(`查询零星材料统计失败: ${statsError.message}`);
    }

    const allStatsData = (statsData || []) as MiscMaterialStatsRow[];
    const reviewedData = allStatsData.filter(item => isReviewedStatus(item.status || undefined));
    const draftData = allStatsData.filter(item => !isReviewedStatus(item.status || undefined) && !isVoidedStatus(item.status || undefined));
    const voidedData = allStatsData.filter(item => isVoidedStatus(item.status || undefined));

    const sumAmount = (rows: MiscMaterialStatsRow[]) => rows.reduce((sum, item) => {
      return sum + calculateMiscellaneousMaterialAmount(item.quantity, item.unit_price);
    }, 0);

    const reviewedAmount = sumAmount(reviewedData);
    const reviewedAvgUnitPrice = reviewedData.length > 0
      ? reviewedData.reduce((sum, item) => sum + Number(item.unit_price || 0), 0) / reviewedData.length
      : 0;
    const draftAmount = sumAmount(draftData);
    const voidedAmount = sumAmount(voidedData);
    const projectStats: Record<string, number> = {};

    reviewedData.forEach(item => {
      const amount = calculateMiscellaneousMaterialAmount(item.quantity, item.unit_price);
      const projectName = item.projects?.name || '未知项目';
      if (!projectStats[projectName]) {
        projectStats[projectName] = 0;
      }
      projectStats[projectName] += amount;
    });

    const materials = (data || []).map((item: any) => {
      const amount = calculateMiscellaneousMaterialAmount(item.quantity, item.unit_price);
      return {
        id: item.id,
        project_id: item.project_id,
        material_name: item.material_name,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: amount,
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
        totalCount: count || 0,
        totalAmount: reviewedAmount,
        reviewedCount: reviewedData.length,
        reviewedAmount,
        reviewedAvgUnitPrice,
        draftCount: draftData.length,
        draftAmount,
        voidedCount: voidedData.length,
        voidedAmount,
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
    
    const invalidProjectRow = records.findIndex((record) => {
      const projectId = Number(record.project_id);
      return !Number.isInteger(projectId) || projectId <= 0;
    });
    if (invalidProjectRow >= 0) {
      return NextResponse.json(
        { error: `第${invalidProjectRow + 1}条：请选择有效项目` },
        { status: 400 },
      );
    }

    const projectIds = [...new Set(records.map(r => Number(r.project_id)).filter(Boolean))];
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

    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    const unauthorizedProjects = accessibleProjects === null ? [] : projectIds.filter(id => !accessibleProjects.includes(id));
    if (unauthorizedProjects.length > 0) {
      return NextResponse.json({
        error: `当前账号无权写入以下项目: ${unauthorizedProjects.join(', ')}`,
      }, { status: 403 });
    }

    const validationErrors: string[] = [];
    const insertData = records.flatMap((record, index) => {
      const {
        project_id, material_name, specification, unit,
        quantity, unit_price, purchase_date, supplier, remark
      } = record;

      const qty = parsePositiveMiscellaneousMaterialNumber(quantity);
      const price = parsePositiveMiscellaneousMaterialNumber(unit_price);
      if (qty === null) {
        validationErrors.push(`第${index + 1}条：数量必须是大于0的数字`);
        return [];
      }
      if (price === null) {
        validationErrors.push(`第${index + 1}条：单价必须是大于0的数字`);
        return [];
      }
      const amount = calculateMiscellaneousMaterialAmount(qty, price);

      return [{
        project_id: parseInt(project_id),
        material_name: material_name?.trim() || '未命名材料',
        specification: specification?.trim() || null,
        unit: unit?.trim() || null,
        quantity: qty,
        unit_price: price,
        amount,
        purchase_date: purchase_date || new Date().toISOString().split('T')[0],
        purchaser: supplier?.trim() || null,
        remark: remark?.trim() || null,
        status: REVIEW_STATUS.DRAFT,
      }];
    }).filter(item => item.project_id && item.material_name);

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: validationErrors[0], details: validationErrors },
        { status: 400 },
      );
    }

    if (insertData.length === 0) {
      return NextResponse.json({ error: '没有有效的数据' }, { status: 400 });
    }

    const { data, error } = await insertWithSequenceFix('miscellaneous_materials', insertData, client);

    if (error) {
      throw new Error(`创建零星材料记录失败: ${error.message}`);
    }

    // 写入后失效聚合缓存
    invalidateAggregationCache();

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
    const { id, project_id, material_name, specification, unit, quantity, unit_price, purchase_date, supplier, remark, status } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const materialId = parseInt(id);

    const { data: currentMaterial, error: currentError } = await client
      .from('miscellaneous_materials')
      .select('id, project_id, status, material_name, specification, unit, quantity, unit_price, amount, purchase_date, purchaser, remark')
      .eq('id', materialId)
      .single();

    if (currentError || !currentMaterial) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    if (isVoidedStatus(currentMaterial.status)) {
      return NextResponse.json({ error: '已作废记录不可修改' }, { status: 400 });
    }

    const contentFields = [
      'project_id',
      'material_name',
      'specification',
      'unit',
      'quantity',
      'unit_price',
      'purchase_date',
      'supplier',
      'remark',
    ] as const;
    const contentFieldsProvided = contentFields.filter((field) => body[field] !== undefined);
    const isStatusChange = status !== undefined;

    if (isStatusChange && contentFieldsProvided.length > 0) {
      return NextResponse.json(
        { error: '状态变更必须单独提交，不能同时修改材料内容' },
        { status: 400 },
      );
    }

    if (!isStatusChange && contentFieldsProvided.length === 0) {
      return NextResponse.json({ error: '请提交要修改的材料内容' }, { status: 400 });
    }

    if (!isStatusChange && isReviewedStatus(currentMaterial.status)) {
      return NextResponse.json({ error: '已审核记录不可直接编辑，请先单独反审核' }, { status: 400 });
    }

    const targetProjectId = project_id === undefined
      ? Number(currentMaterial.project_id)
      : parseInt(project_id);
    if (!Number.isInteger(targetProjectId)) {
      return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    }

    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (
      accessibleProjects !== null &&
      (!accessibleProjects.includes(Number(currentMaterial.project_id)) || !accessibleProjects.includes(targetProjectId))
    ) {
      return NextResponse.json({ error: '当前账号无权修改该项目材料记录' }, { status: 403 });
    }

    if (isStatusChange) {
      const validation = validateStatusTransition(currentMaterial.status || REVIEW_STATUS.DRAFT, status);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message || '状态流转不合法' }, { status: 400 });
      }

      const statusUpdate: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === REVIEW_STATUS.REVIEWED) {
        statusUpdate.reviewed_at = new Date().toISOString();
        statusUpdate.reviewed_by = auth.user.name || auth.user.username || 'system';
      } else if (status === REVIEW_STATUS.DRAFT) {
        statusUpdate.reviewed_at = null;
        statusUpdate.reviewed_by = null;
      }

      const { data, error } = await client
        .from('miscellaneous_materials')
        .update(statusUpdate)
        .eq('id', materialId)
        .select();

      if (error) {
        throw new Error(`更新零星材料状态失败: ${error.message}`);
      }

      invalidateAggregationCache();
      await auditLog({
        operationType: 'update',
        resourceType: 'miscellaneous_material',
        resourceId: materialId,
        details: { status },
        request,
      });

      return NextResponse.json({ materials: data });
    }

    const qty = quantity === undefined
      ? parsePositiveMiscellaneousMaterialNumber(currentMaterial.quantity)
      : parsePositiveMiscellaneousMaterialNumber(quantity);
    const price = unit_price === undefined
      ? parsePositiveMiscellaneousMaterialNumber(currentMaterial.unit_price)
      : parsePositiveMiscellaneousMaterialNumber(unit_price);
    if (qty === null) {
      return NextResponse.json({ error: '数量必须是大于0的数字' }, { status: 400 });
    }
    if (price === null) {
      return NextResponse.json({ error: '单价必须是大于0的数字' }, { status: 400 });
    }
    const amount = calculateMiscellaneousMaterialAmount(qty, price);

    const updateData: Record<string, unknown> = {
      project_id: targetProjectId,
      material_name: material_name === undefined
        ? currentMaterial.material_name
        : material_name?.trim() || '未命名材料',
      specification: specification === undefined
        ? currentMaterial.specification || null
        : specification?.trim() || null,
      unit: unit === undefined ? currentMaterial.unit || null : unit?.trim() || null,
      quantity: qty,
      unit_price: price,
      amount,
      purchase_date: purchase_date === undefined
        ? currentMaterial.purchase_date
        : purchase_date || new Date().toISOString().split('T')[0],
      purchaser: supplier === undefined ? currentMaterial.purchaser || null : supplier?.trim() || null,
      remark: remark === undefined ? currentMaterial.remark || null : remark?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('miscellaneous_materials')
      .update(updateData)
      .eq('id', materialId)
      .select();

    if (error) {
      throw new Error(`更新零星材料记录失败: ${error.message}`);
    }

    invalidateAggregationCache();

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
      .select('status, project_id')
      .eq('id', materialId)
      .single();

    if (!currentMaterial) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects !== null && !accessibleProjects.includes(Number(currentMaterial?.project_id))) {
      return NextResponse.json({ error: '当前账号无权删除该项目材料记录' }, { status: 403 });
    }

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

    invalidateAggregationCache();

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
