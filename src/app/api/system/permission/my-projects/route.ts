import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminUser } from '@/lib/route-permissions';

type ProjectOption = {
  id: number;
  name?: string | null;
};

function normalizeProjectIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((projectId) => Number(projectId))
      .filter((projectId) => Number.isInteger(projectId))
  ));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// 获取当前用户可访问的项目ID列表
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('[User Projects API] Fetching accessible projects for user:', user.username);
    
    const supabase = getSupabaseClient();
    
    // 获取用户信息（使用正确的字段名 managed_projects）
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('managed_projects')
      .eq('id', user.id)
      .single();
    
    if (userError) {
      console.error('[User Projects API] User query error:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
    
    const assignedProjectIds = normalizeProjectIds(userData?.managed_projects);

    // 如果是超级管理员，业务访问范围为全部项目；负责项目仍保留单独勾选范围，用于待办/提醒。
    if (isSuperAdminUser(user.role)) {
      const { data: allProjects } = await supabase
        .from('projects')
        .select('id,name')
        .order('created_at', { ascending: false });
      
      const projectRows = (allProjects || []) as ProjectOption[];
      const allProjectIds = projectRows.map((p) => Number(p.id)).filter((id) => Number.isInteger(id));
      
      console.log('[User Projects API] Super admin, all projects:', allProjectIds.length);
      
      return NextResponse.json({
        success: true,
        project_ids: allProjectIds,
        accessible_project_ids: allProjectIds,
        assigned_project_ids: assignedProjectIds,
        projects: projectRows,
        all_projects: true,
      });
    }
    
    let projects: ProjectOption[] = [];
    if (assignedProjectIds.length > 0) {
      const { data: projectRows, error: projectError } = await supabase
        .from('projects')
        .select('id,name')
        .in('id', assignedProjectIds)
        .order('created_at', { ascending: false });

      if (projectError) {
        console.error('[User Projects API] Project query error:', projectError);
        return NextResponse.json({ error: projectError.message }, { status: 500 });
      }

      projects = (projectRows || []) as ProjectOption[];
    }
    
    console.log('[User Projects API] Accessible projects:', assignedProjectIds.length);
    
    return NextResponse.json({
      success: true,
      project_ids: assignedProjectIds,
      accessible_project_ids: assignedProjectIds,
      assigned_project_ids: assignedProjectIds,
      projects,
      all_projects: false,
    });
  } catch (error: unknown) {
    console.error('[User Projects API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '获取项目权限失败') }, { status: 500 });
  }
}
