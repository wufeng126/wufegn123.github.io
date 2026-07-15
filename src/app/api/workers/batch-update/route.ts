import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { syncWorkerProjectAssignments } from '@/lib/worker-assignment-sync';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, field, value } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要修改的工人ID' }, { status: 400 });
    }

    if (!field) {
      return NextResponse.json({ error: '请提供要修改的字段' }, { status: 400 });
    }

    // 允许批量修改的字段
    const allowedFields = ['work_type', 'project_id', 'status'];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: '不支持批量修改此字段' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: previousWorkers } = field === 'project_id'
      ? await client
        .from('workers')
        .select('id, project_id, entry_date')
        .in('id', ids)
      : { data: [] };
    
    const updateData: Record<string, any> = {};
    updateData[field] = value || null;
    
    const { data, error } = await client
      .from('workers')
      .update(updateData)
      .in('id', ids)
      .select();

    if (error) {
      throw new Error(`批量修改工人失败: ${error.message}`);
    }

    if (field === 'project_id') {
      const previousById = new Map(
        ((previousWorkers || []) as Array<{ id: number; project_id?: number | null; entry_date?: string | null }>)
          .map((worker) => [Number(worker.id), worker]),
      );
      await syncWorkerProjectAssignments(client, ids.map((id) => {
        const previous = previousById.get(Number(id));
        return {
          workerId: Number(id),
          projectId: value || null,
          previousProjectId: previous?.project_id || null,
          startDate: previous?.entry_date || null,
        };
      }));
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '修改失败' },
      { status: 500 }
    );
  }
}
