import { pushBusinessNotification } from '@/lib/business-notification';

export const VISA_WORKFLOW_STATUSES = ['已提交', '已签字', '待预算员确认', '已完成'] as const;
export const VISA_DONE_STATUSES = ['已完成', '已结算', '已完结'] as const;
export const VISA_ACTIVE_STATUSES = ['已提交', '已签字', '待预算员确认'] as const;

type SupabaseSelectResult = {
  data: unknown;
  error: { message: string } | null;
};

type SupabaseLike = {
  from: (table: string) => unknown;
};

type SupabaseUserQuery = {
  select: (columns: string) => {
    eq: (column: string, value: unknown) => {
      maybeSingle: () => PromiseLike<SupabaseSelectResult>;
    };
  };
};

export type UserLike = {
  id: number;
  username?: string | null;
  name?: string | null;
  role?: string | null;
  managed_projects?: unknown;
  is_disabled?: boolean | null;
};

export function getUserDisplayName(user?: { id?: number | null; name?: string | null; username?: string | null } | null) {
  return user?.name || user?.username || (user?.id ? `用户${user.id}` : '');
}

export function parseProjectIds(value: unknown): number[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((projectId) => Number(projectId)).filter((projectId) => Number.isInteger(projectId));
  } catch {
    return [];
  }
}

export function isVisaDone(status?: string | null) {
  return VISA_DONE_STATUSES.includes(status as (typeof VISA_DONE_STATUSES)[number]);
}

export function isVisaActive(status?: string | null) {
  return VISA_ACTIVE_STATUSES.includes(status as (typeof VISA_ACTIVE_STATUSES)[number]);
}

export async function getUserById(client: SupabaseLike, userId: number) {
  const usersQuery = client.from('users') as SupabaseUserQuery;
  const { data, error } = await usersQuery
    .select('id,username,name,role,managed_projects,is_disabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as UserLike | null;
}

export async function notifyVisaWorkflow(params: {
  type: 'visa_workflow' | 'visa_workflow_overdue';
  title: string;
  content: string;
  projectId?: number | null;
  visaId?: number | null;
  recipientUserId?: number | null;
  severity?: 'info' | 'warning' | 'danger';
  metadata?: Record<string, unknown>;
}) {
  await pushBusinessNotification({
    type: params.type,
    title: params.title,
    content: params.content,
    severity: params.severity || 'info',
    projectId: params.projectId || undefined,
    relatedId: params.visaId || undefined,
    relatedType: 'visa',
    recipientUserIds: params.recipientUserId ? [params.recipientUserId] : undefined,
    metadata: params.metadata,
  });
}
