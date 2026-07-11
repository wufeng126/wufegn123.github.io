import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

// GET: list all archives, optionally filtered by project
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    let query = supabase
      .from('monthly_report_archives')
      .select('id, month, project_id, project_name, report_mode, kpi_summary, risk_summary, snapshot_data, created_by_name, created_at')
      .order('month', { ascending: false })
      .order('created_at', { ascending: false });

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', Number(projectId));
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
    const body = await request.json();
    const { month, projectId, projectName, reportMode, snapshotData, kpiSummary, riskSummary, createdBy, createdByName } = body;

    if (!month || !snapshotData) {
      return NextResponse.json({ success: false, error: 'month and snapshotData are required' }, { status: 400 });
    }

    // Upsert: if archive exists for same month+project+mode, update it
    const { data, error } = await supabase
      .from('monthly_report_archives')
      .upsert({
        month,
        project_id: projectId || null,
        project_name: projectName || '全部项目',
        report_mode: reportMode || 'boss',
        snapshot_data: snapshotData,
        kpi_summary: kpiSummary || null,
        risk_summary: riskSummary || null,
        created_by: createdBy || null,
        created_by_name: createdByName || 'system',
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
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
