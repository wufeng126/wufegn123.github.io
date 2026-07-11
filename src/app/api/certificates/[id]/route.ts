import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';

// 获取单个证件详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;
    
    const { data, error } = await client
      .from('certificates')
      .select('*')
      .eq('id', parseInt(id))
      .single();
    
    if (error) {
      throw new Error(`查询证件失败: ${error.message}`);
    }
    
    return NextResponse.json({ certificate: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

// 更新证件
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();
    
    const { name, certificateNumber, ownerType, ownerName, issueDate, expiryDate, remark, attachments } = body;
    
    // 验证必填字段
    if (!name || !certificateNumber || !ownerType || !ownerName || !issueDate || !expiryDate) {
      return NextResponse.json(
        { error: '请填写所有必填项' },
        { status: 400 }
      );
    }
    
    // 验证日期
    if (new Date(expiryDate) <= new Date(issueDate)) {
      return NextResponse.json(
        { error: '到期日期必须晚于发证日期' },
        { status: 400 }
      );
    }
    
    const updateData: Record<string, unknown> = {
      name,
      certificate_number: certificateNumber,
      owner_type: ownerType,
      owner_name: ownerName,
      issue_date: issueDate,
      expiry_date: expiryDate,
      remark,
    };

    // 只有明确传递了 attachments 字段时才更新
    if (attachments !== undefined) {
      updateData.attachments = attachments;
    }

    const { data, error } = await client
      .from('certificates')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();
    
    if (error) {
      throw new Error(`更新证件失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'certificate',
      resourceId: parseInt(id),
      details: { name, certificateNumber, ownerName },
      request,
    });
    
    return NextResponse.json({
      success: true,
      certificate: data,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

// 删除证件
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;

    // 获取记录用于审计日志
    const { data: existingData } = await client
      .from('certificates')
      .select('id, name, owner_name')
      .eq('id', parseInt(id))
      .single();
    
    const { error } = await client
      .from('certificates')
      .delete()
      .eq('id', parseInt(id));
    
    if (error) {
      throw new Error(`删除证件失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'certificate',
      resourceId: parseInt(id),
      details: existingData || { id: parseInt(id) },
      request,
    });
    
    return NextResponse.json({
      success: true,
      message: '证件已删除',
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
