import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getUserById, getUserDisplayName } from '@/lib/visa-workflow';
import { isVisaDoneStatus, parseNumeric } from '@/lib/business-logic';

// 获取单个签证详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('visas')
      .select('*, projects(name)')
      .eq('id', parseInt(id))
      .single();

    if (error) {
      throw new Error(`查询签证失败: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json({ error: '签证不存在' }, { status: 404 });
    }

    // 项目级数据权限：仅可读取自己可访问项目的签证
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects && data.project_id && !accessibleProjects.includes(Number(data.project_id))) {
      return NextResponse.json({ error: '无权访问该项目签证' }, { status: 403 });
    }

    return NextResponse.json({ visa: data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}

// 更新签证
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const {
      visa_number,
      visa_name,
      project_id,
      occurrence_date,
      visa_quantity,
      visa_unit,
      visa_amount,
      handler,
      remark,
      attachments,
      project_manager_user_id,
    } = body;

    // 检查签证编号是否重复（排除自身）
    const visaId = parseInt(id);

    const { data: currentVisa, error: currentVisaError } = await client
      .from('visas')
      .select('id, status, project_id, visa_quantity, visa_unit, visa_amount')
      .eq('id', visaId)
      .single();

    if (currentVisaError || !currentVisa) {
      return NextResponse.json({ error: 'Visa not found' }, { status: 404 });
    }

    // 项目级数据权限：原签证必须属于可访问项目；改挂目标项目也必须可访问（防止跨项目搬运）
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects && currentVisa.project_id && !accessibleProjects.includes(Number(currentVisa.project_id))) {
      return NextResponse.json({ error: '无权操作该项目签证' }, { status: 403 });
    }
    if (project_id !== undefined && accessibleProjects && !accessibleProjects.includes(Number(project_id))) {
      return NextResponse.json({ error: '无权将签证挂到目标项目' }, { status: 403 });
    }

    const lockedFieldChanged =
      (project_id !== undefined && Number(project_id) !== Number(currentVisa.project_id)) ||
      (visa_quantity !== undefined && parseNumeric(visa_quantity) !== parseNumeric(currentVisa.visa_quantity)) ||
      (visa_unit !== undefined && String(visa_unit || '') !== String(currentVisa.visa_unit || '')) ||
      (visa_amount !== undefined && parseNumeric(visa_amount) !== parseNumeric(currentVisa.visa_amount));

    if (isVisaDoneStatus(currentVisa.status) && lockedFieldChanged) {
      return NextResponse.json(
        { error: 'Completed visa amount and quantity fields cannot be changed directly.' },
        { status: 400 }
      );
    }

    if (visa_number) {
      const { data: existingVisa } = await client
        .from('visas')
        .select('id')
        .eq('visa_number', visa_number)
        .neq('id', visaId)
        .single();

      if (existingVisa) {
        return NextResponse.json(
          { error: '签证编号已存在，请使用其他编号' },
          { status: 400 }
        );
      }
    }

    const managerUserId = Number(project_manager_user_id || 0);
    const manager = managerUserId ? await getUserById(client, managerUserId) : null;
    const managerName = getUserDisplayName(manager);
    const currentResponsibleUpdate = managerUserId
      ? {
          project_manager_user_id: managerUserId,
          project_manager_name: managerName || null,
        }
      : {};

    const { data, error } = await client
      .from('visas')
      .update({
        visa_number,
        visa_name,
        project_id,
        occurrence_date,
        visa_quantity: visa_quantity || null,
        visa_unit: visa_unit || null,
        visa_amount,
        handler: handler || null,
        remark: remark || null,
        attachments: attachments || null,
        ...currentResponsibleUpdate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visaId)
      .select()
      .single();

    if (error) {
      throw new Error(`更新签证失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'visa',
      resourceId: visaId,
      details: { visa_number, visa_name },
      request,
    });

    return NextResponse.json({ visa: data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '更新失败' },
      { status: 500 }
    );
  }
}

// 删除签证
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const client = getSupabaseClient();

    // 先获取签证信息用于审计日志与项目权限校验
    const { data: visaData } = await client
      .from('visas')
      .select('visa_number, visa_name, project_id')
      .eq('id', parseInt(id))
      .single();

    // 项目级数据权限：仅可删除自己可访问项目的签证
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects && visaData?.project_id && !accessibleProjects.includes(Number(visaData.project_id))) {
      return NextResponse.json({ error: '无权删除该项目签证' }, { status: 403 });
    }

    const { error } = await client
      .from('visas')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除签证失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'visa',
      resourceId: parseInt(id),
      details: { visa_number: visaData?.visa_number, visa_name: visaData?.visa_name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
