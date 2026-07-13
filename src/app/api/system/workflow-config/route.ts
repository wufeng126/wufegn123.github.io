import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const DEFAULT_WORKFLOW_CONFIGS = [
  {
    workflow_type: 'monthly_analysis',
    name: '月度分析审批流程',
    steps: [
      { state: 'draft', label: '预算员填报', role: 'admin,super_admin', actor: '预算员' },
      { state: 'manager_review', label: '项目经理补充', role: 'project_manager', actor: '项目经理' },
      { state: 'budget_confirm', label: '预算确认', role: 'admin,super_admin', actor: '预算员' },
      { state: 'boss_review', label: '老板批复', role: 'boss', actor: '老板' },
      { state: 'completed', label: '完成', role: '', actor: '' },
    ],
  },
  {
    workflow_type: 'construction_log_confirm',
    name: '施工日志确认流程',
    steps: [
      { state: 'pending', label: '风险待确认', role: 'project_manager', actor: '项目经理' },
      { state: 'budget_notice', label: '预算员提醒', role: 'admin,super_admin', actor: '预算员' },
      { state: 'completed', label: '完成', role: '', actor: '' },
    ],
  },
  {
    workflow_type: 'visa',
    name: '签证办理审批流程',
    steps: [
      { state: 'draft', label: '现场发起', role: 'project_manager,team_leader', actor: '现场人员' },
      { state: 'budget_review', label: '预算审核', role: 'admin,super_admin', actor: '预算员' },
      { state: 'boss_review', label: '老板审批', role: 'boss', actor: '老板' },
      { state: 'completed', label: '完成', role: '', actor: '' },
    ],
  },
];

const ALLOWED_WORKFLOW_TYPES = DEFAULT_WORKFLOW_CONFIGS.map(config => config.workflow_type);

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('workflow_configs')
      .select('workflow_type');
    if (existingError) throw new Error(existingError.message);

    const existingTypes = new Set((existing || []).map((item: { workflow_type: string }) => item.workflow_type));
    const missingConfigs = DEFAULT_WORKFLOW_CONFIGS.filter(config => !existingTypes.has(config.workflow_type));
    if (missingConfigs.length > 0) {
      const { error: seedError } = await supabase.from('workflow_configs').upsert(missingConfigs);
      if (seedError) throw new Error(seedError.message);
    }

    const { data, error } = await supabase
      .from('workflow_configs')
      .select('*')
      .in('workflow_type', ALLOWED_WORKFLOW_TYPES)
      .order('id');
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflow_type, name, steps } = body;
    if (!workflow_type || !steps) {
      return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    }
    if (!ALLOWED_WORKFLOW_TYPES.includes(workflow_type)) {
      return NextResponse.json({ success: false, error: '当前仅支持月度分析、施工日志确认、签证办理三类流程配置' }, { status: 400 });
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('workflow_configs').upsert({
      workflow_type, name: name || workflow_type, steps,
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });
    const supabase = getSupabaseClient();
    await supabase.from('workflow_configs').delete().eq('id', parseInt(id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
