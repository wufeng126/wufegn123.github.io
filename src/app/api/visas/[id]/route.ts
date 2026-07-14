import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getUserById, getUserDisplayName } from '@/lib/visa-workflow';

// 获取单个签证详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      status,
      handler,
      remark,
      attachments,
      project_manager_user_id,
    } = body;

    // 检查签证编号是否重复（排除自身）
    if (visa_number) {
      const { data: existingVisa } = await client
        .from('visas')
        .select('id')
        .eq('visa_number', visa_number)
        .neq('id', parseInt(id))
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
    const currentResponsibleUpdate = managerUserId && status === '已提交'
      ? {
          current_responsible_user_id: managerUserId,
          current_responsible_name: managerName || null,
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
        status,
        handler: handler || null,
        remark: remark || null,
        attachments: attachments || null,
        ...currentResponsibleUpdate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`更新签证失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'visa',
      resourceId: parseInt(id),
      details: { visa_number, visa_name, status },
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

    // 先获取签证信息用于审计日志
    const { data: visaData } = await client
      .from('visas')
      .select('visa_number, visa_name')
      .eq('id', parseInt(id))
      .single();

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
