import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getUserDisplayName } from '@/lib/user-display-name';

const supabase = getSupabaseClient();

// GET: list all archives, optionally filtered by project
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    let query = supabase
      .from('monthly_report_archives')
      .select('id, month, project_id, project_name, report_mode, kpi_summary, risk_summary, snapshot_data, created_by_name, created_at')
      .order('month', { ascending: false })
      .order('created_at', { ascending: false });

    if (projectId && projectId !== 'all') {
      const requestedProjectIds = projectId.split(',').map(Number);
      if (requestedProjectIds.length === 0 || requestedProjectIds.some(id => !Number.isInteger(id))) {
        return NextResponse.json({ success: false, error: '请提供有效的项目参数' }, { status: 400 });
      }
      if (accessibleProjectIds !== null) {
        const inaccessibleProjectIds = requestedProjectIds.filter(id => !accessibleProjectIds.includes(id));
        if (inaccessibleProjectIds.length > 0) {
          return NextResponse.json({ success: false, error: '当前账号没有访问指定项目的权限' }, { status: 403 });
        }
      }
      query = query.in('project_id', requestedProjectIds);
    } else if (accessibleProjectIds !== null) {
      if (accessibleProjectIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
      query = query.in('project_id', accessibleProjectIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[archives] query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[archives] GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch archives' }, { status: 500 });
  }
}

// POST: archive current month's report data
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'reports:monthly_export');
    if (!auth.ok) return auth.response;
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);

    const body = await request.json();
    const { month, projectId, projectName, reportMode, snapshotData, kpiSummary, riskSummary } = body;

    if (!month || !snapshotData) {
      return NextResponse.json({ success: false, error: 'month and snapshotData are required' }, { status: 400 });
    }

    const normalizedProjectId = projectId && projectId !== 'all' ? Number(projectId) : null;
    if (projectId && projectId !== 'all' && !Number.isInteger(normalizedProjectId)) {
      return NextResponse.json({ success: false, error: '请提供有效的项目参数' }, { status: 400 });
    }

    if (accessibleProjectIds !== null) {
      if (normalizedProjectId === null || !accessibleProjectIds.includes(normalizedProjectId)) {
        return NextResponse.json({ success: false, error: '当前账号没有访问指定项目的权限' }, { status: 403 });
      }
    }

    const operatorName = getUserDisplayName(auth.user, 'system');

    // Upsert: if archive exists for same month+project+mode, update it
    const { data, error } = await supabase
      .from('monthly_report_archives')
      .upsert({
        month,
        project_id: normalizedProjectId,
        project_name: projectName || '全部项目',
        report_mode: reportMode || 'boss',
        snapshot_data: snapshotData,
        kpi_summary: kpiSummary || null,
        risk_summary: riskSummary || null,
        created_by: auth.user.id,
        created_by_name: operatorName,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'month,project_id,report_mode',
      })
      .select('id, month, created_at')
      .single();

    if (error) {
      console.error('[archives] upsert error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: '月报已存档' });
  } catch (err) {
    console.error('[archives] POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to archive report' }, { status: 500 });
  }
}

// DELETE: remove an archive
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'reports:monthly_export');
    if (!auth.ok) return auth.response;
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const { data: archive, error: fetchError } = await supabase
      .from('monthly_report_archives')
      .select('project_id')
      .eq('id', Number(id))
      .single();

    if (fetchError) {
      console.error('[archives] fetch archive error:', fetchError);
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    if (accessibleProjectIds !== null) {
      const archiveProjectId = Number(archive?.project_id);
      if (!Number.isNaN(archiveProjectId) && !accessibleProjectIds.includes(archiveProjectId)) {
        return NextResponse.json({ success: false, error: '当前账号没有访问指定项目的权限' }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from('monthly_report_archives')
      .delete()
      .eq('id', Number(id));

    if (error) {
      console.error('[archives] delete error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '存档已删除' });
  } catch (err) {
    console.error('[archives] DELETE error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete archive' }, { status: 500 });
  }
}
