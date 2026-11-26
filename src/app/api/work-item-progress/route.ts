import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { assertProjectAccess } from '@/lib/api-project-scope';
import { isMaterialWarehouseProjectId } from '@/lib/material-warehouse-project';
import { isPublicLogProjectId } from '@/lib/public-log-project';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { work_item_id, completed_quantity, record_date, remark } = body;

    if (!work_item_id || completed_quantity == null || !record_date) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 项目范围 + 红线校验（防跨项目写入 / 库房与公共项目滥用）
    {
      const { data: workItem } = await client
        .from('work_items')
        .select('project_id')
        .eq('id', parseInt(work_item_id))
        .maybeSingle();
      const projectId = Number((workItem as { project_id?: unknown } | null)?.project_id) || 0;
      if (!projectId) {
        return NextResponse.json({ error: '分项工程不存在或未关联项目' }, { status: 404 });
      }
      const access = await assertProjectAccess(client, auth.user, projectId);
      if (!access.ok) return access.response;
      if (await isMaterialWarehouseProjectId(client, projectId)) {
        return NextResponse.json({ error: '「库房」项目只允许在零星材料模块使用' }, { status: 400 });
      }
      if (await isPublicLogProjectId(client, projectId)) {
        return NextResponse.json({ error: '「公司公共项目/非项目日志」只允许在施工日志使用' }, { status: 400 });
      }
    }

    // 创建进度记录
    const { data, error } = await insertWithSequenceFix('work_item_progress', {
      work_item_id: parseInt(work_item_id),
      completed_quantity,
      record_date,
      remark,
    }, client);

    if (error) {
      throw new Error(`创建进度记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'work_item_progress',
      resourceId: data?.[0]?.id || 0,
      details: { work_item_id, completed_quantity, record_date },
      request,
    });

    return NextResponse.json({ progress: data?.[0] || data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
