import { getNotificationRouteRule } from '@/lib/notification-routing';

export type NotificationLinkSource = {
  type?: string | null;
  project_id?: number | string | null;
  projectId?: number | string | null;
  related_id?: number | string | null;
  relatedId?: number | string | null;
  related_type?: string | null;
  relatedType?: string | null;
  metadata?: Record<string, unknown> | null;
};

function toCleanText(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function pickText(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!metadata) return '';
  for (const key of keys) {
    const value = toCleanText(metadata[key]);
    if (value) return value;
  }
  return '';
}

function toId(value: unknown) {
  const text = toCleanText(value);
  if (!text) return '';
  const numberValue = Number(text);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return '';
  return String(Math.trunc(numberValue));
}

function pickId(source: NotificationLinkSource, keys: string[]) {
  const metadata = source.metadata;
  for (const value of [source.related_id, source.relatedId]) {
    const id = toId(value);
    if (id) return id;
  }
  if (!metadata) return '';
  for (const key of keys) {
    const id = toId(metadata[key]);
    if (id) return id;
  }
  return '';
}

function pickProjectId(source: NotificationLinkSource) {
  for (const value of [source.project_id, source.projectId, source.metadata?.project_id, source.metadata?.projectId]) {
    const id = toId(value);
    if (id) return id;
  }
  return '';
}

function appendQuery(path: string, params: Record<string, string | number | null | undefined>) {
  const [base, query = ''] = path.split('?');
  const searchParams = new URLSearchParams(query);

  Object.entries(params).forEach(([key, value]) => {
    const text = toCleanText(value);
    if (text) searchParams.set(key, text);
  });

  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

function getExplicitHref(source: NotificationLinkSource) {
  const href = pickText(source.metadata, ['actionHref', 'action_href', 'href', 'url']);
  if (!href) return '';
  if (href.startsWith('/') || href.startsWith('http://') || href.startsWith('https://')) return href;
  return '';
}

export function getNotificationPublicBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
}

export function toAbsoluteNotificationHref(href: string | null | undefined, baseUrl = getNotificationPublicBaseUrl()) {
  const cleanHref = toCleanText(href);
  if (!cleanHref) return '';
  if (/^https?:\/\//i.test(cleanHref)) return cleanHref;
  if (!cleanHref.startsWith('/')) return cleanHref;

  const cleanBaseUrl = toCleanText(baseUrl).replace(/\/+$/, '');
  if (!cleanBaseUrl) return cleanHref;

  try {
    return new URL(cleanHref, cleanBaseUrl).toString();
  } catch {
    return `${cleanBaseUrl}${cleanHref}`;
  }
}

export function buildNotificationActionHref(source: NotificationLinkSource) {
  const explicitHref = getExplicitHref(source);
  if (explicitHref) return explicitHref;

  const type = source.type || '';
  const relatedType = source.related_type || source.relatedType || '';
  const projectId = pickProjectId(source);
  const metadata = source.metadata;
  const routeRule = getNotificationRouteRule(type);

  const constructionLogId = pickId(source, ['logId', 'log_id', 'constructionLogId', 'construction_log_id']);
  if (
    constructionLogId &&
    (type === 'construction_log_comment' || type === 'construction_log_alert' || relatedType === 'construction_log')
  ) {
    const commentId = metadata ? toId(metadata.commentId || metadata.comment_id) : '';
    const section = type === 'construction_log_comment'
      ? 'comments'
      : type === 'construction_log_alert'
        ? 'risk'
        : pickText(metadata, ['section']);
    return appendQuery(`/construction-logs/${constructionLogId}`, {
      section,
      comment_id: commentId,
    });
  }

  if (type === 'construction_daily_report') {
    return appendQuery(routeRule?.href || '/construction-logs', {
      tab: 'daily-reports',
      date: pickText(metadata, ['reportDate', 'report_date', 'logDate', 'log_date']),
    });
  }

  const visaId = pickId(source, ['visaId', 'visa_id']);
  if (visaId && (type === 'visa_workflow' || type === 'visa_workflow_overdue' || relatedType === 'visa')) {
    return appendQuery('/visas', { todo: 'mine', visa_id: visaId });
  }

  const knowledgeId = pickId(source, ['knowledgeId', 'knowledge_id', 'docId', 'doc_id']);
  if (knowledgeId && (type === 'monthly_analysis_workflow' || relatedType === 'ai_knowledge_docs')) {
    return `/knowledge/${knowledgeId}`;
  }

  const settlementId = pickId(source, ['settlementId', 'settlement_id']);
  if (settlementId && (type === 'new_settlement' || relatedType === 'settlement' || relatedType === 'supplier_settlement')) {
    return appendQuery('/supplier-contracts/settlement', { settlement_id: settlementId });
  }

  if (type === 'new_supplier_payment' || relatedType === 'supplier_payment') {
    const contractId = pickText(metadata, ['contractId', 'contract_id']);
    const settlementIdFromMeta = pickText(metadata, ['settlementId', 'settlement_id']);
    return appendQuery('/payments', {
      project_id: projectId,
      contract_id: contractId,
      settlement_id: settlementIdFromMeta,
      payment_id: pickId(source, ['paymentId', 'payment_id']),
    });
  }

  if (type === 'new_client_payment' || type === 'new_payment' || relatedType === 'client_payment') {
    return appendQuery('/client-payments', {
      project_id: projectId,
      payment_id: pickId(source, ['paymentId', 'payment_id']),
    });
  }

  if (type === 'new_report' || relatedType === 'client_report') {
    return appendQuery('/client-reports', {
      project_id: projectId,
      report_id: pickId(source, ['reportId', 'report_id']),
    });
  }

  if (type === 'new_worker_salary' || type === 'new_salary' || relatedType === 'worker_salary') {
    return appendQuery('/workers/salaries', {
      project_id: projectId,
      month: pickText(metadata, ['yearMonth', 'year_month', 'salaryMonth', 'salary_month']),
      salary_id: pickId(source, ['salaryId', 'salary_id']),
    });
  }

  if (type === 'new_worker_payment' || relatedType === 'salary_payment' || relatedType === 'worker_payment') {
    return appendQuery('/workers/payments', {
      project_id: projectId,
      month: pickText(metadata, ['yearMonth', 'year_month', 'salaryMonth', 'salary_month']),
      payment_id: pickId(source, ['paymentId', 'payment_id']),
    });
  }

  if (type.includes('certificate') || relatedType === 'certificate') return '/certificates';
  if (type === 'new_worker' || relatedType === 'worker') return '/workers/roster';
  if (type === 'cost_warning') return appendQuery('/cost-center', { project_id: projectId });

  return routeRule?.href || '/notifications';
}
