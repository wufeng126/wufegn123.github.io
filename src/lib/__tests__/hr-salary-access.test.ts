import { describe, expect, it } from 'vitest';
import {
  checkApiWritePermission,
  hasCompatiblePermission,
  hasRoutePermission,
} from '@/lib/route-permissions';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getWorkerProjectRelations } from '@/lib/worker-project-access';

type QueryResult = {
  data: unknown;
  error?: { code?: string; message?: string } | null;
};

function makeQuery(result: QueryResult) {
  const query: any = {};
  query.select = () => query;
  query.eq = () => query;
  query.in = () => query;
  query.single = () => Promise.resolve(result);
  query.maybeSingle = () => Promise.resolve(result);
  query.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return query;
}

function makeProjectAccessClient(options: {
  managedProjects?: unknown;
  roleRows?: Array<{ project_id?: unknown }>;
  roleError?: { code?: string; message?: string } | null;
}) {
  return {
    from(table: string) {
      if (table === 'users') {
        return makeQuery({
          data: { managed_projects: options.managedProjects },
          error: null,
        });
      }
      if (table === 'user_project_roles') {
        return makeQuery({
          data: options.roleRows || [],
          error: options.roleError || null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeWorkerAccessClient(options: {
  workers: Array<{ id?: unknown; project_id?: unknown }>;
  assignments?: Array<{ worker_id?: unknown; project_id?: unknown }>;
  assignmentError?: { code?: string; message?: string } | null;
}) {
  return {
    from(table: string) {
      if (table === 'workers') {
        return makeQuery({ data: options.workers, error: null });
      }
      if (table === 'worker_assignments') {
        return makeQuery({
          data: options.assignments || [],
          error: options.assignmentError || null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function canWrite(pathname: string, method: string, permissions: string[]) {
  return checkApiWritePermission(pathname, method, permissions, false);
}

describe('人力与工资接口角色级权限回归', () => {
  it('超级管理员可继续访问全部人力与工资写接口', () => {
    const writeCases = [
      ['/api/workers', 'POST'],
      ['/api/workers/1', 'PUT'],
      ['/api/workers/batch', 'POST'],
      ['/api/worker-salaries', 'POST'],
      ['/api/worker-salaries/1', 'DELETE'],
      ['/api/worker-salaries/batch', 'POST'],
      ['/api/living-allowances', 'POST'],
      ['/api/living-allowances/1', 'DELETE'],
      ['/api/worker-payments', 'POST'],
      ['/api/worker-payments/batch-delete', 'DELETE'],
    ] as const;

    for (const [pathname, method] of writeCases) {
      expect(checkApiWritePermission(pathname, method, [], true)).toBe(true);
    }
  });

  it('花名册的编辑、导入权限相互隔离', () => {
    expect(canWrite('/api/workers', 'POST', ['workers:edit'])).toBe(true);
    expect(canWrite('/api/workers/1', 'DELETE', ['workers:edit'])).toBe(true);
    expect(canWrite('/api/workers/batch', 'POST', ['workers:import'])).toBe(true);
    expect(canWrite('/api/workers/check-duplicates', 'POST', ['workers:import'])).toBe(true);

    expect(canWrite('/api/workers', 'POST', ['workers:view'])).toBe(false);
    expect(canWrite('/api/workers/batch', 'POST', ['workers:edit'])).toBe(false);
    expect(canWrite('/api/workers/1', 'PUT', ['workers:import'])).toBe(false);
  });

  it('月度工资的编辑、导入权限相互隔离', () => {
    expect(canWrite('/api/worker-salaries', 'POST', ['salaries:edit'])).toBe(true);
    expect(canWrite('/api/worker-salaries/1', 'PUT', ['salaries:edit'])).toBe(true);
    expect(canWrite('/api/worker-salaries/batch-update', 'POST', ['salaries:edit'])).toBe(true);
    expect(canWrite('/api/worker-salaries/batch-delete', 'POST', ['salaries:edit'])).toBe(true);
    expect(canWrite('/api/worker-salaries/batch', 'POST', ['salaries:import'])).toBe(true);

    expect(canWrite('/api/worker-salaries', 'POST', ['salaries:view'])).toBe(false);
    expect(canWrite('/api/worker-salaries/batch', 'POST', ['salaries:edit'])).toBe(false);
    expect(canWrite('/api/worker-salaries/1', 'PUT', ['salaries:import'])).toBe(false);
  });

  it('工资发放兼容当前和历史权限编码，并按动作限制拆分权限', () => {
    const broadPermissions = [
      'salaries:pay',
      'salaries:pay_edit',
    ];

    for (const permission of broadPermissions) {
      expect(canWrite('/api/worker-payments', 'POST', [permission])).toBe(true);
      expect(canWrite('/api/worker-payments/1', 'PUT', [permission])).toBe(true);
      expect(canWrite('/api/worker-payments/1', 'DELETE', [permission])).toBe(true);
      expect(canWrite('/api/living-allowances', 'POST', [permission])).toBe(true);
    }

    expect(canWrite('/api/worker-payments', 'POST', ['salaries:pay_create'])).toBe(true);
    expect(canWrite('/api/worker-payments/1', 'DELETE', ['salaries:pay_delete'])).toBe(true);
    expect(canWrite('/api/worker-payments/1', 'PUT', ['salaries:pay_create'])).toBe(false);
    expect(canWrite('/api/worker-payments/1', 'DELETE', ['salaries:pay_create'])).toBe(false);
    expect(canWrite('/api/worker-payments', 'POST', ['salaries:view'])).toBe(false);
    expect(canWrite('/api/living-allowances', 'POST', ['salaries:edit'])).toBe(false);
  });

  it('接口 GET 仍只需要登录层，页面入口单独检查查看权限', () => {
    expect(canWrite('/api/worker-salaries', 'GET', [])).toBe(true);
    expect(canWrite('/api/worker-payments', 'GET', [])).toBe(true);
    expect(canWrite('/api/living-allowances', 'GET', [])).toBe(true);

    expect(hasRoutePermission('/workers/roster', ['workers:view'], false)).toBe(true);
    expect(hasRoutePermission('/workers/salaries', ['salaries:view'], false)).toBe(true);
    expect(hasRoutePermission('/workers/living-allowances', ['salaries:pay'], false)).toBe(true);
    expect(hasRoutePermission('/workers/payments', ['salaries:pay_edit'], false)).toBe(true);
    expect(hasRoutePermission('/workers/payments', ['salaries:pay_create'], false)).toBe(true);
    expect(hasRoutePermission('/workers/query', ['salaries:query'], false)).toBe(true);

    expect(hasRoutePermission('/workers/roster', ['workers:import'], false)).toBe(false);
    expect(hasRoutePermission('/workers/salaries', ['salaries:query'], false)).toBe(false);
    expect(hasRoutePermission('/workers/payments', ['salaries:view'], false)).toBe(false);
    expect(hasRoutePermission('/workers/payments', ['salaries:pay_delete'], false)).toBe(false);
  });

  it('页面和菜单层兼容工资发放历史权限，但不把删除权限当入口权限', () => {
    expect(hasCompatiblePermission('salaries:pay', ['salaries:pay'])).toBe(true);
    expect(hasCompatiblePermission('salaries:pay', ['salaries:pay_edit'])).toBe(true);
    expect(hasCompatiblePermission('salaries:pay', ['salaries:pay_create'])).toBe(true);
    expect(hasCompatiblePermission('salaries:pay', ['salaries:pay_delete'])).toBe(false);
    expect(hasCompatiblePermission('salaries:view', ['salaries:pay_edit'])).toBe(false);
  });
});

describe('人力工资项目范围回归', () => {
  const user = {
    id: 100,
    username: 'finance-user',
    role: 'finance',
    roleId: 40,
    is_super_admin: false,
  };

  it('合并 managed_projects 与 user_project_roles，并自动去重', async () => {
    const client = makeProjectAccessClient({
      managedProjects: '[1, 2, 2]',
      roleRows: [{ project_id: 2 }, { project_id: 3 }, { project_id: '3' }],
    });

    await expect(getAccessibleProjectIds(client, user)).resolves.toEqual([1, 2, 3]);
  });

  it('旧库缺少 user_project_roles 表时仍使用 managed_projects', async () => {
    const client = makeProjectAccessClient({
      managedProjects: [8, 9],
      roleError: {
        code: 'PGRST205',
        message: 'Could not find the table user_project_roles in the schema cache',
      },
    });

    await expect(getAccessibleProjectIds(client, user)).resolves.toEqual([8, 9]);
  });

  it('没有项目授权时返回空范围，不能被当成全项目访问', async () => {
    const client = makeProjectAccessClient({
      managedProjects: [],
      roleRows: [],
    });

    await expect(getAccessibleProjectIds(client, user)).resolves.toEqual([]);
  });

  it('超级管理员返回 null 表示全项目范围', async () => {
    const client = {
      from() {
        throw new Error('super admin should not query project scope');
      },
    };

    await expect(getAccessibleProjectIds(client, {
      ...user,
      is_super_admin: true,
    })).resolves.toBeNull();
  });
});

describe('工人历史项目归属回归', () => {
  it('合并当前归属和调岗记录，重复项目只保留一次', async () => {
    const client = makeWorkerAccessClient({
      workers: [{ id: 7, project_id: 1 }],
      assignments: [
        { worker_id: 7, project_id: 2 },
        { worker_id: 7, project_id: 1 },
        { worker_id: 7, project_id: 2 },
      ],
    });

    const relations = await getWorkerProjectRelations(client as any, [7]);
    expect(Array.from(relations.get(7) || []).sort()).toEqual([1, 2]);
  });

  it('旧库缺少 worker_assignments 表时不阻断当前项目归属判断', async () => {
    const client = makeWorkerAccessClient({
      workers: [{ id: 7, project_id: 4 }],
      assignmentError: {
        code: '42P01',
        message: 'relation worker_assignments does not exist',
      },
    });

    const relations = await getWorkerProjectRelations(client as any, [7]);
    expect(Array.from(relations.get(7) || [])).toEqual([4]);
  });
});
