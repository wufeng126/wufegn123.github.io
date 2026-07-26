import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { exportToExcel } from '@/lib/excel-utils';

const EXPORT_HEADERS: Record<string, string> = {
  project_name: '项目名称',
  event_date: '事件日期',
  title: '证据标题',
  evidence_type: '证据类型',
  source: '来源',
  importance: '重要程度',
  follow_status: '跟进状态',
  amount_direction: '金额影响',
  estimated_amount: '预估金额',
  summary: '事件摘要',
  attachments: '附件',
  related: '关联业务',
  tags: '标签',
  owner_name: '负责人',
  created_by_name: '录入人',
  created_at: '录入时间',
};

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function joinList(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      if (typeof item === 'object') {
        const attachment = item as Record<string, unknown>;
        return String(attachment.name || attachment.storageKey || attachment.key || '');
      }
      return String(item);
    })
    .map((item) => item.trim())
    .filter(Boolean)
    .join('、');
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const projectId = parseId(request.nextUrl.searchParams.get('projectId'));
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);

    let query = supabase
      .from('settlement_evidence_records')
      .select('*, projects(name)')
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    else if (Array.isArray(accessibleProjectIds)) {
      if (accessibleProjectIds.length === 0) {
        const emptyBuffer = exportToExcel([], EXPORT_HEADERS, '结算证据链');
        return new NextResponse(Buffer.from(emptyBuffer), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('结算证据链台账.xlsx')}`,
          },
        });
      }
      query = query.in('project_id', accessibleProjectIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data || []).map((item: any) => ({
      project_name: item.projects?.name || '',
      event_date: item.event_date || '',
      title: item.title || '',
      evidence_type: item.evidence_type || '',
      source: item.source || '',
      importance: item.importance || '',
      follow_status: item.follow_status || '',
      amount_direction: item.amount_direction || '',
      estimated_amount: item.estimated_amount || '',
      summary: item.summary || '',
      attachments: joinList(item.attachments),
      related: joinList(item.related),
      tags: joinList(item.tags),
      owner_name: item.owner_name || '',
      created_by_name: item.created_by_name || '',
      created_at: item.created_at ? String(item.created_at).slice(0, 19).replace('T', ' ') : '',
    }));

    const buffer = exportToExcel(rows, EXPORT_HEADERS, '结算证据链');
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('结算证据链台账.xlsx')}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '导出失败' },
      { status: 500 }
    );
  }
}
