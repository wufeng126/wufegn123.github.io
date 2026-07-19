import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { isSuperAdminUser } from '@/lib/route-permissions';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeProjectIds(value: unknown): number[] {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      })()
    : value;

  if (!Array.isArray(parsed)) return [];
  return Array.from(new Set(
    parsed
      .map((projectId) => Number(projectId))
      .filter((projectId) => Number.isInteger(projectId))
  ));
}

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function getProjectAccessProfile(client: ReturnType<typeof getSupabaseClient>, user: CurrentUser) {
  const tokenRoleId = user.role_id ?? (user as { roleId?: number }).roleId;
  let hasGlobalProjectAccess = isSuperAdminUser(user.role, tokenRoleId) || String(user.role) === 'boss';

  const { data: userData } = await client
    .from('users')
    .select('role, managed_projects')
    .eq('id', user.id)
    .single();

  const managedProjectIds = normalizeProjectIds(userData?.managed_projects);
  if (isSuperAdminUser(userData?.role) || userData?.role === 'boss') {
    hasGlobalProjectAccess = true;
  }

  const { data: userRoles } = await client
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id);

  const roleIds = (userRoles || [])
    .map((row: { role_id?: unknown }) => Number(row.role_id))
    .filter((roleId: number) => Number.isInteger(roleId));

  if (roleIds.length > 0) {
    const { data: roleRows } = await client
      .from('roles')
      .select('id, name, code, is_super_admin')
      .in('id', roleIds);

    if ((roleRows || []).some((role: { code?: string | null; name?: string | null; is_super_admin?: boolean | null }) => {
      const name = role.name || '';
      return Boolean(role.is_super_admin)
        || role.code === 'super_admin'
        || role.code === 'boss'
        || name.includes('老板')
        || name.includes('总经理');
    })) {
      hasGlobalProjectAccess = true;
    }
  }

  return { managedProjectIds, hasGlobalProjectAccess };
}

function nullableValue(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // 获取当前用户信息
    const user = await getCurrentUser();
    const scope = request.nextUrl.searchParams.get('scope');
    const assignedOnly = ['assigned', 'managed', 'mine'].includes(scope || '');
    
    // 查询项目数据
    const query = client
      .from('projects')
      .select('id, name, year, status, address, partner, contract_amount, icon, building_area, tax_rate, expected_completion_date, construction_payment_ratio, completion_settlement_payment_ratio, warranty_payment_ratio, warranty_expired_payment_ratio, completion_date, warranty_days, is_archived, archived_at, archived_by, archive_note, created_at')
      .order('year', { ascending: false })
      .order('created_at', { ascending: false });
    
    const { data, error } = await query;

    if (error) {
      throw new Error(`查询项目失败: ${error.message}`);
    }

    // 数据权限过滤：已登录且非超级管理员只能看到自己有权限的项目
    let filteredProjects = data || [];
    
    if (user) {
      // 获取用户信息（包括管理的项目）
      const accessProfile = await getProjectAccessProfile(client, user);
      const shouldFilterByAssignedProjects = assignedOnly || !accessProfile.hasGlobalProjectAccess;

      // 如果有权限控制，过滤项目；没有分配项目时不能回退为全部可见。
      if (shouldFilterByAssignedProjects && accessProfile.managedProjectIds.length > 0) {
        filteredProjects = filteredProjects.filter(p => accessProfile.managedProjectIds.includes(p.id));
      } else if (shouldFilterByAssignedProjects) {
        filteredProjects = [];
      } else {
        filteredProjects = data || [];
      }
    }
    
    // 获取所有项目的工人统计（一次查询优化性能）
    const { data: allWorkers } = await client
      .from('workers')
      .select('project_id, status');

    // 按项目统计在场/退场人数
    const workerStatsByProject: Record<number, { inService: number; left: number }> = {};
    allWorkers?.forEach(worker => {
      if (worker.project_id) {
        if (!workerStatsByProject[worker.project_id]) {
          workerStatsByProject[worker.project_id] = { inService: 0, left: 0 };
        }
        if (worker.status === 'left') {
          workerStatsByProject[worker.project_id].left++;
        } else {
          // 默认在场（in_service 或 null）
          workerStatsByProject[worker.project_id].inService++;
        }
      }
    });

    // 获取每个项目的进度数据
    // 进度 = 月度报量总额 / 预算工程量总金额
    const projectsWithProgress = await Promise.all(
      filteredProjects.map(async (project) => {
        // 1. 获取预算工程量总金额（预算量 * 合同价）
        const { data: subitems } = await client
          .from('work_item_subitems')
          .select('budget_quantity, contract_price, limit_price')
          .eq('project_id', project.id);

        // 预算总金额 = sum(预算量 * 合同价)，如果没合同价则用限价
        const budgetAmount = subitems?.reduce((sum, item) => {
          const quantity = parseFloat(item.budget_quantity || '0');
          const price = parseFloat(item.contract_price || item.limit_price || '0');
          return sum + (quantity * price);
        }, 0) || 0;

        // 2. 获取月度报量总额
        // 先获取该项目的所有 subitem ids
        const { data: projectSubitems } = await client
          .from('work_item_subitems')
          .select('id, contract_price, limit_price')
          .eq('project_id', project.id);

        const subitemIds = projectSubitems?.map(s => s.id) || [];
        const subitemPriceMap: Record<number, number> = {};
        projectSubitems?.forEach(s => {
          subitemPriceMap[s.id] = parseFloat(s.contract_price || s.limit_price || '0');
        });

        // 获取所有月度报量
        let reportAmount = 0;
        if (subitemIds.length > 0) {
          const { data: monthlyReports } = await client
            .from('subitem_monthly_reports')
            .select('subitem_id, report_quantity')
            .in('subitem_id', subitemIds);

          reportAmount = monthlyReports?.reduce((sum, report) => {
            const quantity = parseFloat(report.report_quantity || '0');
            const price = subitemPriceMap[report.subitem_id] || 0;
            return sum + (quantity * price);
          }, 0) || 0;
        }

        // 3. 计算进度
        let progress = 0;
        if (budgetAmount > 0) {
          progress = Math.min(100, Math.round((reportAmount / budgetAmount) * 100));
        } else {
          // 如果没有预算数据，已完成的项目显示100%，其他显示0%
          progress = ['竣工结算', '质保期', '质保期满', '已完成'].includes(project.status) ? 100 : 0;
        }

        // 工人统计
        const workerStats = workerStatsByProject[project.id] || { inService: 0, left: 0 };

        return {
          ...project,
          building_area: project.building_area || null,
          budgetAmount,
          reportAmount,
          progress,
          inServiceCount: workerStats.inService,
          leftCount: workerStats.left,
          totalWorkerCount: workerStats.inService + workerStats.left,
        };
      })
    );

    return NextResponse.json({ projects: projectsWithProgress });
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
    const body = await request.json();
    const {
      name,
      year,
      status,
      address,
      partner,
      contract_amount,
      icon,
      building_area,
      tax_rate,
      expected_completion_date,
      construction_payment_ratio,
      completion_settlement_payment_ratio,
      warranty_payment_ratio,
      warranty_expired_payment_ratio,
      completion_date,
      warranty_days,
    } = body;

    if (!name || !year) {
      return NextResponse.json({ error: '项目名称和年度不能为空' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { data, error } = await insertWithSequenceFix('projects', { 
        name, 
        year, 
        status: status || '在建',
        address: nullableValue(address),
        partner: nullableValue(partner),
        contract_amount: nullableValue(contract_amount),
        icon: icon || 'HardHat',
        building_area: nullableValue(building_area),
        tax_rate: tax_rate || 9,
        expected_completion_date: nullableValue(expected_completion_date),
        construction_payment_ratio: nullableValue(construction_payment_ratio),
        completion_settlement_payment_ratio: nullableValue(completion_settlement_payment_ratio),
        warranty_payment_ratio: nullableValue(warranty_payment_ratio),
        warranty_expired_payment_ratio: nullableValue(warranty_expired_payment_ratio),
        completion_date: nullableValue(completion_date),
        warranty_days: nullableValue(warranty_days),
      }, client);

    // insertWithSequenceFix 返回数组，取第一个
    const projectData = Array.isArray(data) ? data[0] : data;

    if (error) {
      throw new Error(`创建项目失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'create',
      resourceType: 'project',
      resourceId: projectData?.id,
      details: { name: projectData?.name, year: projectData?.year, status: projectData?.status },
      request,
    });

    return NextResponse.json({ project: projectData });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '创建失败') },
      { status: 500 }
    );
  }
}
