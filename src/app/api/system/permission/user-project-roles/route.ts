import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  isMissingProjectRolesTable,
  normalizeProjectRoleCodes,
  PROJECT_ROLE_LABELS,
  type ProjectRoleCode,
} from '@/lib/user-project-roles';

type ProjectRoleRow = {
  id?: number;
  user_id: number;
  project_id: number;
  role_code: ProjectRoleCode;
};

type ProjectRolePayload = {
  project_id?: unknown;
  role_codes?: unknown;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeProjectIds(value: unknown): number[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((projectId) => Number(projectId))
      .filter((projectId) => Number.isInteger(projectId));
  } catch {
    return [];
  }
}

function groupRows(rows: ProjectRoleRow[]) {
  const map = new Map<string, { user_id: number; project_id: number; role_codes: ProjectRoleCode[] }>();

  rows.forEach((row) => {
    const key = `${row.user_id}:${row.project_id}`;
    const current = map.get(key) || {
      user_id: Number(row.user_id),
      project_id: Number(row.project_id),
      role_codes: [],
    };

    if (!current.role_codes.includes(row.role_code)) {
      current.role_codes.push(row.role_code);
    }

    map.set(key, current);
  });

  return Array.from(map.values()).map((assignment) => ({
    ...assignment,
    role_labels: assignment.role_codes.map((code) => PROJECT_ROLE_LABELS[code]).filter(Boolean),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const userId = Number(request.nextUrl.searchParams.get('user_id') || 0);
    const client = getSupabaseClient();

    let query = client
      .from('user_project_roles')
      .select('id,user_id,project_id,role_code')
      .order('user_id', { ascending: true })
      .order('project_id', { ascending: true });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingProjectRolesTable(error)) {
        return NextResponse.json({
          success: true,
          setup_required: true,
          rows: [],
          assignments: [],
        });
      }

      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = (data || []) as ProjectRoleRow[];
    return NextResponse.json({
      success: true,
      rows,
      assignments: groupRows(rows),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const userId = Number(body.user_id || 0);
    const assignments = Array.isArray(body.assignments) ? (body.assignments as ProjectRolePayload[]) : [];

    if (!userId) {
      return NextResponse.json({ success: false, error: '用户ID不能为空' }, { status: 400 });
    }

    const rows = assignments.flatMap((assignment) => {
      const projectId = Number(assignment.project_id || 0);
      if (!Number.isInteger(projectId) || projectId <= 0) return [];

      return normalizeProjectRoleCodes(assignment.role_codes).map((roleCode) => ({
        user_id: userId,
        project_id: projectId,
        role_code: roleCode,
      }));
    });

    const client = getSupabaseClient();

    const { data: existingUser, error: userError } = await client
      .from('users')
      .select('id,managed_projects')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      return NextResponse.json({ success: false, error: userError.message }, { status: 500 });
    }

    if (!existingUser) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }

    const { error: deleteError } = await client
      .from('user_project_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      if (isMissingProjectRolesTable(deleteError)) {
        return NextResponse.json(
          { success: false, error: '项目身份配置表不存在，请先执行数据库迁移 create_user_project_roles.sql' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    if (rows.length > 0) {
      const { error: insertError } = await client.from('user_project_roles').insert(rows);
      if (insertError) {
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
      }
    }

    const currentProjectIds = normalizeProjectIds((existingUser as { managed_projects?: unknown }).managed_projects);
    const roleProjectIds = rows.map((row) => row.project_id);
    const mergedProjectIds = Array.from(new Set([...currentProjectIds, ...roleProjectIds]));

    if (mergedProjectIds.length !== currentProjectIds.length) {
      const { error: updateError } = await client
        .from('users')
        .update({ managed_projects: mergedProjectIds })
        .eq('id', userId);

      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, assignments: groupRows(rows) });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
