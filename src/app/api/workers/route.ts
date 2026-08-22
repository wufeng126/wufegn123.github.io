import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser, type RequestAuthUser } from '@/lib/auth';
import { requireApiWritePermission } from '@/lib/api-auth';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { syncWorkerProjectAssignment } from '@/lib/worker-assignment-sync';
import { getAccessibleProjectIds as getUnifiedAccessibleProjectIds } from '@/lib/api-project-access';
import { canAccessSensitiveData } from '@/lib/ai-service';

type WorkerProjectEntity = {
  name?: string | null;
};

type WorkerProject = WorkerProjectEntity | WorkerProjectEntity[] | null;

type WorkerRow = {
  id: number;
  name: string;
  work_type?: string | null;
  id_card?: string | null;
  phone?: string | null;
  bank_card?: string | null;
  project_id?: number | null;
  status?: string | null;
  left_at?: string | null;
  created_at?: string | null;
  entry_date?: string | null;
  team_name?: string | null;
  is_blacklist?: boolean | null;
  remark?: string | null;
  projects?: WorkerProject;
};

function normalizeProjectIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((projectId) => Number(projectId))
      .filter((projectId) => Number.isInteger(projectId))
  ));
}

function getProjectName(projects?: WorkerProject) {
  if (Array.isArray(projects)) return projects[0]?.name || null;
  return projects?.name || null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// 获取可访问的项目ID列表（A4 修复：统一走 api-project-access，
// 合并 users.managed_projects 与 user_project_roles 项目角色授权）
async function getAccessibleProjectIds(userId: number, userRole: string) {
  const client = getSupabaseClient();

  const user = {
    id: userId,
    username: '',
    role: userRole,
    roleId: 0,
    is_super_admin: userRole === 'super_admin',
  } as RequestAuthUser;

  const ids = await getUnifiedAccessibleProjectIds(client, user);

  // 超级管理员（返回 null 表示全部）：与旧行为一致，返回全部项目ID列表
  if (ids === null) {
    const { data } = await client.from('projects').select('id');
    return normalizeProjectIds((data || []).map((project) => project.id));
  }

  return ids;
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
    const isSuperAdmin = user?.role === 'super_admin';
    
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
    let workers = ((data || []) as WorkerRow[]);
    if (!isSuperAdmin && accessibleProjects.length === 0) {
      workers = [];
    } else if (accessibleProjects.length > 0) {
      workers = workers.filter((w) => w.project_id === null || accessibleProjects.includes(Number(w.project_id)));
    }

    // 敏感字段脱敏：身份证号、银行卡号仅对 super_admin/管理员/财务/预算商务/老板 角色可见完整值，
    // 其他角色（项目经理、班组长、现场人员等）返回脱敏值，防止越权批量拉取工人 PII。
    const canViewSensitive = canAccessSensitiveData(user?.role || '');
    const maskIdCard = (v?: string | null): string => {
      if (!v) return '';
      const s = String(v);
      if (s.length < 8) return s;
      return `${s.slice(0, 3)}***********${s.slice(-4)}`;
    };
    const maskBankCard = (v?: string | null): string => {
      if (!v) return '';
      const s = String(v).replace(/\s+/g, '');
      if (s.length < 8) return s;
      return `${s.slice(0, 4)} **** **** ${s.slice(-4)}`;
    };

    // 格式化返回数据
    const formattedWorkers = workers.map(worker => ({
      id: worker.id,
      name: worker.name,
      work_type: worker.work_type,
      id_card: canViewSensitive ? (worker.id_card || '') : maskIdCard(worker.id_card),
      phone: worker.phone,
      bank_card: canViewSensitive ? (worker.bank_card || '') : maskBankCard(worker.bank_card),
      project_id: worker.project_id,
      project_name: getProjectName(worker.projects),
      status: worker.status || 'in_service',
      left_at: worker.left_at,
      created_at: worker.created_at,
      entry_date: worker.entry_date,
      team_name: worker.team_name,
      is_blacklist: worker.is_blacklist || false,
      remark: worker.remark,
    }));

    return NextResponse.json({ workers: formattedWorkers });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '查询失败') },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

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
      const isSuperAdmin = user?.role === 'super_admin';
      if (!isSuperAdmin && (accessibleProjects.length === 0 || !accessibleProjects.includes(project_id))) {
        return NextResponse.json({ error: '无权在该项目下创建工人' }, { status: 403 });
      }
    }

    // 去重校验：同一项目内不允许存在"姓名相同"或"身份证号相同"的人员
    if (name && project_id) {
      const { data: sameName } = await client
        .from('workers')
        .select('id, name, id_card')
        .eq('project_id', project_id)
        .eq('name', name.trim())
        .maybeSingle();
      if (sameName) {
        const sameIdCard = id_card && sameName.id_card && String(sameName.id_card).toUpperCase() === String(id_card).trim().toUpperCase();
        if (!sameIdCard) {
          // 身份证脱敏显示（前3后4），避免泄露完整证件号
          const maskIdCard = (v: string) => (v && v.length >= 8 ? `${v.slice(0, 3)}********${v.slice(-4)}` : v || '未填');
          return NextResponse.json({
            error: `该项目下已存在同名工人「${sameName.name}」（身份证 ${maskIdCard(sameName.id_card)}），不允许重复添加同名人员。如为同一人请先修正信息，否则请更换姓名`,
          }, { status: 400 });
        }
        // 同名且同身份证 → 直接提示已存在
        return NextResponse.json({ error: '该项目下已存在该身份证号的工人，无需重复添加' }, { status: 400 });
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
    if (workerError) {
      // 唯一索引冲突（同项目同身份证）→ 友好提示，不返回 500
      const msg = String(workerError.message || '');
      if (msg.includes('duplicate key') || msg.includes('unique constraint') || (workerError as { code?: string }).code === '23505') {
        return NextResponse.json({ error: '该项目下已存在该身份证号的工人，无需重复添加（如需修改信息请用批量导入的覆盖更新）' }, { status: 400 });
      }
      throw workerError;
    }
    const worker = Array.isArray(workerData) ? workerData[0] : workerData;

    // 创建对应的项目分配记录
    if (project_id && worker?.id) {
      await syncWorkerProjectAssignment(client, {
        workerId: worker.id,
        projectId: project_id,
        startDate: entry_date || null,
      });
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'worker',
      resourceId: worker?.id,
      details: { name, work_type, project_id },
      request,
    });

    return NextResponse.json({ worker });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '创建失败') },
      { status: 500 }
    );
  }
}
