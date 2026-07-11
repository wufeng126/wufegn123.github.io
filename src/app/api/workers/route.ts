import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';

// 获取可访问的项目ID列表
async function getAccessibleProjectIds(userId: number, userRole: string) {
  const client = getSupabaseClient();
  
  // 超级管理员可以访问所有项目
  if (userRole === 'super_admin') {
    const { data } = await client.from('projects').select('id');
    return (data || []).map((p: any) => p.id);
  }
  
  // 获取用户直接分配的项目
  const { data: userData } = await client
    .from('users')
    .select('managed_projects')
    .eq('id', userId)
    .single();
  
  const userProjects: number[] = userData?.managed_projects || [];
  
  // 获取用户通过角色分配的项目
  const { data: userRoles } = await client
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId);
  
  const roleProjects: number[] = [];
  if (userRoles && userRoles.length > 0) {
    const roleIds = userRoles.map((ur: any) => ur.role_id);
    const { data: roles } = await client
      .from('roles')
      .select('allowed_projects')
      .in('id', roleIds);
    
    if (roles) {
      for (const role of roles) {
        if (role.allowed_projects && Array.isArray(role.allowed_projects)) {
          roleProjects.push(...role.allowed_projects);
        }
      }
    }
  }
  
  return [...new Set([...userProjects, ...roleProjects])];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name');
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();
    
    // 获取当前用户
    const user = await getCurrentUser();
    
    // 获取可访问的项目ID
    const accessibleProjects = await getAccessibleProjectIds(user?.id || 0, user?.role || 'admin');
    
    let query = client.from('workers').select(`
      id,
      name,
      work_type,
      id_card,
      phone,
      bank_card,
      project_id,
      status,
      left_at,
      created_at,
      entry_date,
      team_name,
      is_blacklist,
      remark,
      projects (
        name
      )
    `);
    
    if (name) {
      query = query.ilike('name', `%${name}%`);
    }
    
    if (projectId) {
      query = query.eq('project_id', parseInt(projectId));
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`查询工人失败: ${error.message}`);
    }

    // 数据权限过滤：project_id为NULL的工人允许所有有权限的用户查看
    let workers = data || [];
    if (accessibleProjects.length > 0) {
      workers = workers.filter((w: any) => w.project_id === null || accessibleProjects.includes(w.project_id));
    }

    // 格式化返回数据
    const formattedWorkers = workers.map(worker => ({
      id: worker.id,
      name: worker.name,
      work_type: worker.work_type,
      id_card: worker.id_card,
      phone: worker.phone,
      bank_card: worker.bank_card,
      project_id: worker.project_id,
      project_name: (worker.projects as any)?.name || null,
      status: worker.status || 'in_service',
      left_at: worker.left_at,
      created_at: worker.created_at,
      entry_date: worker.entry_date,
      team_name: worker.team_name,
      is_blacklist: worker.is_blacklist || false,
      remark: worker.remark,
    }));

    return NextResponse.json({ workers: formattedWorkers });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, work_type, id_card, phone, bank_card, project_id, entry_date, team_name, is_blacklist, remark } = body;

    if (!name) {
      return NextResponse.json({ error: '工人姓名不能为空' }, { status: 400 });
    }

    // 获取当前用户
    const user = await getCurrentUser();
    const client = getSupabaseClient();
    
    // 验证用户是否有权限操作该项目的工人
    if (project_id) {
      const accessibleProjects = await getAccessibleProjectIds(user?.id || 0, user?.role || 'admin');
      if (accessibleProjects.length > 0 && !accessibleProjects.includes(project_id)) {
        return NextResponse.json({ error: '无权在该项目下创建工人' }, { status: 403 });
      }
    }
    
    const { data: workerData, error: workerError } = await insertWithSequenceFix('workers', { 
        name, 
        work_type, 
        id_card, 
        phone, 
        bank_card,
        project_id: project_id || null,
        entry_date: entry_date || null,
        team_name: team_name || null,
        is_blacklist: is_blacklist || false,
        remark: remark || null,
      }, client);
    if (workerError) throw workerError;
    const worker = Array.isArray(workerData) ? workerData[0] : workerData;

    // 创建对应的项目分配记录
    if (project_id && worker?.id) {
      await client.from('worker_assignments').upsert({
        worker_id: worker.id,
        project_id: project_id,
        start_date: entry_date || null,
        status: 'active',
      }, { onConflict: 'worker_id,project_id' });
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'worker',
      resourceId: worker?.id,
      details: { name, work_type, project_id },
      request,
    });

    return NextResponse.json({ worker });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
