import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyApprovalActionToken } from '@/lib/approval-action-token';

/**
 * GET /api/approvals/quick-action?token=...
 * 钉钉卡片「通过 / 驳回」按钮的落地页：
 * 1) 校验签名链接
 * 2) 未登录 → 提示登录后回到本链接
 * 3) 已登录 → 校验身份（老板/超管或该单据指定审批人）→ 调内部接口执行审批
 * 4) 返回一个结果页（移动端友好）
 */

function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>快捷审批</title>
<style>
body{margin:0;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6f8;color:#1f2329}
.card{max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,.06)}
h1{font-size:18px;margin:0 0 12px}
p{font-size:14px;line-height:1.7;color:#4b5563;margin:8px 0}
.ok{color:#07863f}.err{color:#c0392b}
a.btn{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:#1677ff;color:#fff;text-decoration:none;font-size:14px}
small{color:#9aa3af}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';
  const verified = verifyApprovalActionToken(token);
  if (!verified.ok) {
    return html(`<h1 class="err">链接无效</h1><p>${verified.reason || '请回到系统内处理'}</p>`, 400);
  }

  const auth = await requireAuth(request);
  if (!auth.ok) {
    const back = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return html(`<h1>需要先登录</h1><p>钉钉内打开需要登录一次，登录后会自动继续审批。</p>
<a class="btn" href="/login?redirect=${back}">去登录</a>`);
  }

  const { type, id, action } = verified;
  const supabase = getSupabaseClient();
  const user = auth.user;
  const isBossOrSuper = Boolean(user.is_super_admin) || ['super_admin', 'boss'].includes(String(user.role || ''));

  if (type === 'team_settlement') {
    const settlementId = Number(id);
    const { data: settlement } = await supabase
      .from('team_settlements')
      .select('id, settlement_no, status, approver_user_id, project_id, settlement_month')
      .eq('id', settlementId)
      .maybeSingle();
    if (!settlement) return html('<h1 class="err">结算单不存在</h1>', 404);

    const designated = Number((settlement as Record<string, unknown>).approver_user_id) || 0;
    const allowed = isBossOrSuper || (designated > 0 && Number(user.id) === designated);
    if (!allowed) {
      return html(`<h1 class="err">你不是该结算单的审批人</h1><p>当前登录账号：${user.name || user.username || user.id}</p>`, 403);
    }
    if (String(settlement.status) !== 'pending') {
      return html(`<h1>该结算单已处理</h1><p>当前状态：${settlement.status}，无需重复操作。</p>
<a class="btn" href="/team-management/settlements/${settlementId}">查看结算单</a>`);
    }

    const origin = request.nextUrl.origin;
    const res = await fetch(`${origin}/api/team-settlements/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        settlement_id: settlementId,
        action,
        ...(action === 'reject' ? { reason: '钉钉卡片快捷驳回' } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      return html(`<h1 class="err">处理失败</h1><p>${json?.error || '请到系统中重试'}</p>
<a class="btn" href="/team-management/settlements/${settlementId}">打开结算单</a>`);
    }

    const label = action === 'approve' ? '已通过' : '已驳回';
    return html(`<h1 class="ok">审批成功：${label}</h1>
<p>结算单：${settlement.settlement_no || `#${settlementId}`}</p>
<p>操作人：${user.name || user.username || user.id}</p>
<p><small>页面 2 秒后自动打开结算单详情</small></p>
<a class="btn" href="/team-management/settlements/${settlementId}">立即查看</a>
<script>setTimeout(function(){location.href='/team-management/settlements/${settlementId}'},2000)</script>`);
  }

  if (type === 'monthly_report') {
    const month = String(verified.month || '');
    const scope = String(verified.scope || 'all');
    if (!/^\d{4}-\d{2}$/.test(month)) return html('<h1 class="err">链接参数不完整</h1>', 400);

    const { data: workflow } = await supabase
      .from('monthly_report_workflows')
      .select('id, status, content, created_by')
      .eq('year_month', month)
      .eq('project_scope', scope)
      .maybeSingle();
    if (!workflow) return html('<h1 class="err">月报不存在</h1>', 404);

    const content = (workflow.content || {}) as Record<string, unknown>;
    const bossApproverId = Number(content.bossApproverId) || 0;
    const allowed = isBossOrSuper || (bossApproverId > 0 && Number(user.id) === bossApproverId);
    if (!allowed) {
      return html(`<h1 class="err">你不是该月报的审批人</h1><p>当前登录账号：${user.name || user.username || user.id}</p>`, 403);
    }
    if (String(workflow.status) !== 'pending_boss') {
      return html(`<h1>该月报已处理</h1><p>当前状态：${workflow.status}，无需重复操作。</p>
<a class="btn" href="/reports/monthly/fill?month=${month}${scope !== 'all' ? `&projectId=${scope}` : ''}">查看月报</a>`);
    }

    const origin = request.nextUrl.origin;
    const res = await fetch(`${origin}/api/reports/monthly/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        month,
        projectId: scope,
        action,
        ...(action === 'reject' ? { reason: '钉钉卡片快捷驳回' } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    const reportUrl = `/reports/monthly/fill?month=${month}${scope !== 'all' ? `&projectId=${scope}` : ''}`;
    if (!res.ok || json?.success === false) {
      return html(`<h1 class="err">处理失败</h1><p>${json?.error || '请到系统中重试'}</p>
<a class="btn" href="${reportUrl}">打开月报</a>`);
    }

    const label = action === 'approve' ? '已通过' : '已驳回';
    return html(`<h1 class="ok">月报审批成功：${label}</h1>
<p>月份：${month}　范围：${scope === 'all' ? '全公司' : `项目 #${scope}`}</p>
<p>操作人：${user.name || user.username || user.id}</p>
<p><small>页面 2 秒后自动打开月报</small></p>
<a class="btn" href="${reportUrl}">立即查看</a>
<script>setTimeout(function(){location.href='${reportUrl}'},2000)</script>`);
  }

  return html('<h1 class="err">暂不支持的审批类型</h1>', 400);
}
