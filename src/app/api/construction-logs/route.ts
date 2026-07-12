import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    let query = supabase.from('construction_logs').select('*', { count: 'exact' }).order('log_date', { ascending: false }).order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', parseInt(projectId));
    if (userId) query = query.eq('user_id', parseInt(userId));
    if (dateFrom) query = query.gte('log_date', dateFrom);
    if (dateTo) query = query.lte('log_date', dateTo);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    return apiSuccess(data || [], {
      meta: { pagination: { page, pageSize, total: count || 0 } },
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '查询失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const user = auth.user;
    const body = await request.json();
    const { project_id, log_date, location, content, headcount, issues } = body;

    if (!project_id || !log_date || !content) {
      return apiBadRequest('项目、日期和施工内容不能为空');
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('construction_logs').insert({
      project_id: parseInt(project_id),
      user_id: user?.id || 0,
      user_name: user?.name || user?.username || '未知',
      log_date,
      location: location || null,
      content,
      headcount: headcount ? parseInt(headcount) : null,
      issues: issues || null,
    }).select().single();

    if (error) throw new Error(error.message);

    // 智能萃取：检测施工日志中的潜在变更/签证事件
    if (data) {
      const text = `${content || ''} ${issues || ''}`;
      const keywords = ['变更', '签证', '变更通知', '设计变更', '甲方要求', '洽商', '索赔', '图纸变更', '方案调整', '新增工作'];
      const matched = keywords.filter(k => text.includes(k));
      if (matched.length > 0 && project_id) {
        // 获取项目名称
        const { data: proj } = await supabase.from('projects').select('name').eq('id', parseInt(project_id)).single();
        const projName = (proj as any)?.name || `项目${project_id}`;

        // 自动创建知识条目（经验总结分类）
        await supabase.from('ai_knowledge_docs').insert({
          title: `${projName} ${log_date || ''} 施工日志 - 潜在变更`,
          category: '经验总结',
          source_type: 'construction_log',
          source_ref: `cl:${data.id}`,
          tags: ['施工日志', '变更', projName],
          content: `## 潜在变更事件\n\n**项目**：${projName}\n**日期**：${log_date || ''}\n**施工内容**：${content || ''}\n**异常情况**：${issues || ''}\n\n**触发关键词**：${matched.join('、')}\n\n> 由施工日志自动识别，建议预算员跟进确认是否涉及签证/变更。`,
          created_by: '系统（施工日志萃取）',
        });

        // 发送系统通知（同时触发钉钉推送如果已配置）
        const { pushBusinessNotification } = await import('@/lib/business-notification');
        await pushBusinessNotification({
          type: 'construction_log_alert',
          title: `⚠️ ${projName} 施工日志疑似涉及变更`,
          content: `${log_date || ''} ${content ? content.substring(0, 30) : ''}... 含关键词：${matched.join('、')}。请及时确认是否需办理签证。`,
          severity: 'warning',
          relatedId: data.id,
          relatedType: 'construction_log',
        });
      }
    }

    return apiSuccess(data);
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '提交失败'));
  }
}
