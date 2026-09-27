import { NextResponse } from 'next/server';
import type { RequestAuthUser } from '@/lib/auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

export type ProjectAccessScope = number[] | null;

export function emptyProjectScopeResponse<T extends Record<string, unknown>>(body: T) {
  return NextResponse.json(body);
}

export function forbiddenProjectResponse(message = '当前账号无权访问该项目') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badProjectIdResponse(message = '项目参数无效') {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function parseOptionalProjectId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '' || value === 'all') return null;
  const projectId = Number(value);
  return Number.isInteger(projectId) && projectId > 0 ? projectId : NaN;
}

export function isValidProjectId(projectId: number | null): projectId is number {
  return projectId !== null && Number.isInteger(projectId) && projectId > 0;
}

export async function getProjectAccessScope(
  client: unknown,
  user: RequestAuthUser
): Promise<ProjectAccessScope> {
  return getAccessibleProjectIds(client, user);
}

export function canAccessProject(scope: ProjectAccessScope, projectId?: number | string | null) {
  if (scope === null) return true;
  const normalizedProjectId = Number(projectId);
  if (!Number.isInteger(normalizedProjectId) || normalizedProjectId <= 0) return false;
  return scope.includes(normalizedProjectId);
}

export async function assertProjectAccess(
  client: unknown,
  user: RequestAuthUser,
  projectId?: number | string | null
) {
  const scope = await getProjectAccessScope(client, user);
  if (!canAccessProject(scope, projectId)) {
    return { ok: false as const, response: forbiddenProjectResponse(), scope };
  }
  return { ok: true as const, scope };
}

export function applyProjectScopeToQuery<TQuery>(
  query: TQuery,
  scope: ProjectAccessScope,
  column = 'project_id'
): TQuery | null {
  if (scope === null) return query;
  if (scope.length === 0) return null;
  return (query as any).in(column, scope) as TQuery;
}
