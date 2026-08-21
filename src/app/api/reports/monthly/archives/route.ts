import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiBadRequest } from '@/lib/api-utils';
import { isValidReportMonth, parsePositiveIntParam } from '@/lib/monthly-report-route-validation';

const supabase = getSupabaseClient();

// GET: list all archives, optionally filtered by project
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'reports:monthly_view');
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    let query = supabase
      .from('monthly_report_archives')
      .select('id, month, project_id, project_name, report_mode, kpi_summary, risk_summary, snapshot_data, created_by_name, created_at')
      .order('month', { ascending: false })
      .order('created_at', { ascending: false });

    if (projectId && projectId !== 'all') {
      const parsedProjectId = parsePositiveIntParam(projectId);
      if (!parsedProjectId) return apiBadRequest('项目参数格式不正确');
      query = query.eq('project_id', parsedProjectId);
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

    const body = await request.json();
    const { month, projectId, projectName, reportMode, snapshotData, kpiSummary, riskSummary } = body;

    if (!month || !snapshotData) {
      return NextResponse.json({ success: false, error: 'month and snapshotData are required' }, { status: 400 });
    }

    if (!isValidReportMonth(month)) {
      return apiBadRequest('请提供有效的月份参数(YYYY-MM)');
    }

    let parsedProjectId: number | null = null;
    if (projectId && projectId !== 'all') {
      parsedProjectId = parsePositiveIntParam(String(projectId));
      if (!parsedProjectId) return apiBadRequest('项目参数格式不正确');
    }

    // Upsert: if archive exists for same month+project+mode, update it
    const { data, error } = await supabase
      .from('monthly_report_archives')
      .upsert({
        month,
        project_id: parsedProjectId,
        project_name: projectName || '全部项目',
        report_mode: reportMode || 'boss',
        snapshot_data: snapshotData,
        kpi_summary: kpiSummary || null,
        risk_summary: riskSummary || null,
        created_by: auth.user.id,
        created_by_name: auth.user.name || auth.user.username || 'system',
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const parsedId = parsePositiveIntParam(id);
    if (!parsedId) return apiBadRequest('id 参数格式不正确');

    const { error } = await supabase
      .from('monthly_report_archives')
      .delete()
      .eq('id', parsedId);

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
