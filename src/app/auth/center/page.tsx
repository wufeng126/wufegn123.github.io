'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Shield,
  Users,
  Key,
  Plus,
  Edit,
  Trash2,
  UserCog,
  Save,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// 默认权限模块配置 - 与系统侧边栏菜单同步
const DEFAULT_PERMISSION_MODULES = [
  {
    key: 'projects',
    name: '项目中心',
    permissions: [
      { code: 'projects:view', name: '查看项目' },
      { code: 'projects:create', name: '创建项目' },
      { code: 'projects:edit', name: '编辑项目' },
      { code: 'projects:delete', name: '删除项目' },
      { code: 'work_items:view', name: '查看工程量' },
      { code: 'work_items:create', name: '创建工程量' },
      { code: 'work_items:edit', name: '编辑工程量' },
      { code: 'work_items:delete', name: '删除工程量' },
      { code: 'visas:view', name: '查看签证' },
      { code: 'visas:create', name: '创建签证' },
      { code: 'visas:edit', name: '编辑签证' },
      { code: 'visas:delete', name: '删除签证' },
    ],
  },
  {
    key: 'workers',
    name: '人力与证件',
    permissions: [
      { code: 'workers:view', name: '查看工人' },
      { code: 'workers:create', name: '创建工人' },
      { code: 'workers:edit', name: '编辑工人' },
      { code: 'workers:delete', name: '删除工人' },
      { code: 'salaries:view', name: '查看工资' },
      { code: 'salaries:create', name: '创建工资' },
      { code: 'salaries:edit', name: '编辑工资' },
      { code: 'salaries:delete', name: '删除工资' },
      { code: 'certificates:view', name: '查看证件' },
      { code: 'certificates:create', name: '创建证件' },
      { code: 'certificates:edit', name: '编辑证件' },
      { code: 'certificates:delete', name: '删除证件' },
    ],
  },
  {
    key: 'supplies',
    name: '供应与成本管理',
    permissions: [
      { code: 'suppliers:view', name: '查看供应商' },
      { code: 'suppliers:create', name: '创建供应商' },
      { code: 'suppliers:edit', name: '编辑供应商' },
      { code: 'suppliers:delete', name: '删除供应商' },
      { code: 'settlements:view', name: '查看结算' },
      { code: 'settlements:create', name: '创建结算' },
      { code: 'settlements:edit', name: '编辑结算' },
      { code: 'settlements:delete', name: '删除结算' },
      { code: 'payments:view', name: '查看付款' },
      { code: 'payments:create', name: '创建付款' },
      { code: 'payments:edit', name: '编辑付款' },
      { code: 'payments:delete', name: '删除付款' },
      { code: 'expenses:view', name: '查看费用' },
      { code: 'expenses:create', name: '创建费用' },
      { code: 'expenses:edit', name: '编辑费用' },
      { code: 'expenses:delete', name: '删除费用' },
    ],
  },
  {
    key: 'funds',
    name: '资金管理',
    permissions: [
      { code: 'client_reports:view', name: '查看报量' },
      { code: 'client_reports:create', name: '创建报量' },
      { code: 'client_reports:edit', name: '编辑报量' },
      { code: 'client_reports:delete', name: '删除报量' },
      { code: 'client_payments:view', name: '查看回款' },
      { code: 'client_payments:create', name: '创建回款' },
      { code: 'client_payments:edit', name: '编辑回款' },
      { code: 'client_payments:delete', name: '删除回款' },
    ],
  },
  {
    key: 'data',
    name: '数据与决策',
    permissions: [
      { code: 'business_overview:view', name: '查看经营总览' },
      { code: 'cost_center:view', name: '查看成本中心' },
      { code: 'cost_center:export', name: '导出成本数据' },
      { code: 'reports:view', name: '查看报表' },
    ],
  },
  {
    key: 'construction',
    name: '施工管理',
    permissions: [
      { code: 'construction_attendance:view', name: '查看人员出勤' },
    ],
  },
  {
    key: 'system',
    name: '系统配置',
    permissions: [
      { code: 'notifications:view', name: '查看通知' },
      { code: 'notifications:manage', name: '管理通知' },
      { code: 'auth_center:view', name: '查看权限中心' },
      { code: 'auth_center:manage', name: '管理权限' },
      { code: 'admin:view', name: '查看后台' },
      { code: 'admin:manage', name: '管理后台' },
    ],
  },
];

interface Permission {
  code: string;
  name: string;
}

interface GroupedPermission {
  key: string;
  name: string;
  permissions: Permission[];
}

interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  level: number;
  is_super_admin: boolean;
  permission_count: number;
}

interface User {
  id: number;
  username: string;
  name: string;
  phone: string;
  role: string;
  role_ids?: number[];
  created_at: string;
}

export default function AuthCenterPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // 状态
  const [activeTab, setActiveTab] = useState('roles');
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<GroupedPermission[]>(DEFAULT_PERMISSION_MODULES);
  
  // 角色表单
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    code: '',
    level: 1,
    is_super_admin: false,
  });
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  
  // 用户角色分配
  const [userRoleDialogOpen, setUserRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  
  // 用户表单
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    name: '',
    phone: '',
    password: '',
  });

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      console.log('[PermissionCenter] Loading data...');
      
      // 并行加载角色和权限数据
      const [rolesRes, usersRes, permsRes] = await Promise.all([
        fetch('/api/auth/center/roles'),
        fetch('/api/auth/center/users'),
        fetch('/api/auth/center/permissions'),
      ]);
      
      const [rolesData, usersData, permsData] = await Promise.all([
        rolesRes.json(),
        usersRes.json(),
        permsRes.json(),
      ]);
      
      console.log('[PermissionCenter] Data loaded:', {
        rolesCount: rolesData.roles?.length || 0,
        usersCount: usersData.users?.length || 0,
        permsCount: permsData.permissions?.length || 0,
        groupedCount: permsData.groupedPermissions?.length || 0,
      });
      
      if (rolesData.roles) {
        setRoles(rolesData.roles);
      }
      
      if (usersData.users) {
        setUsers(usersData.users);
      }
      
      // 如果API返回了权限数据，使用API数据；否则使用默认数据
      if (permsData.groupedPermissions && permsData.groupedPermissions.length > 0) {
        setGroupedPermissions(permsData.groupedPermissions);
      } else {
        // 使用默认权限模块
        console.log('[PermissionCenter] Using default permission modules');
        setGroupedPermissions(DEFAULT_PERMISSION_MODULES);
      }
      
    } catch (error) {
      console.error('[PermissionCenter] Load error:', error);
      // 即使出错，也使用默认权限模块
      setGroupedPermissions(DEFAULT_PERMISSION_MODULES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 权限勾选相关函数
  const isModuleAllChecked = (module: GroupedPermission) => {
    return module.permissions.every((p) => selectedPermissions.includes(p.code));
  };

  const isModuleIndeterminate = (module: GroupedPermission) => {
    const checked = module.permissions.filter((p) => selectedPermissions.includes(p.code)).length;
    return checked > 0 && checked < module.permissions.length;
  };

  const togglePermission = (code: string, checked: boolean) => {
    if (checked) {
      setSelectedPermissions([...selectedPermissions, code]);
    } else {
      setSelectedPermissions(selectedPermissions.filter((p) => p !== code));
    }
  };

  const toggleModulePermissions = (module: GroupedPermission, checked: boolean) => {
    if (checked) {
      const allCodes = module.permissions.map((p) => p.code);
      const newPerms = [...new Set([...selectedPermissions, ...allCodes])];
      setSelectedPermissions(newPerms);
    } else {
      const removeCodes = module.permissions.map((p) => p.code);
      setSelectedPermissions(selectedPermissions.filter((p) => !removeCodes.includes(p)));
    }
  };

  // 角色管理
  const openRoleDialog = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      setRoleForm({
        name: role.name,
        description: role.description || '',
        code: role.code,
        level: role.level,
        is_super_admin: role.is_super_admin,
      });
      // 获取角色的权限
      fetch(`/api/auth/center/roles?id=${role.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.role?.permissions) {
            setSelectedPermissions(data.role.permissions);
          }
        });
    } else {
      setEditingRole(null);
      setRoleForm({
        name: '',
        description: '',
        code: '',
        level: 1,
        is_super_admin: false,
      });
      setSelectedPermissions([]);
    }
    setRoleDialogOpen(true);
  };

  const saveRole = async () => {
    if (!roleForm.name) {
      toast({ title: '请输入角色名称', variant: 'error' });
      return;
    }

    try {
      let url = '/api/auth/center/roles';
      let method = 'POST';
      let body: Record<string, unknown> = {};

      if (editingRole) {
        method = 'PUT';
        url += `?id=${editingRole.id}`;
        body = {
          name: roleForm.name,
          description: roleForm.description,
          level: roleForm.level,
          permission_codes: selectedPermissions,
        };
      } else {
        body = {
          action: 'create',
          name: roleForm.name,
          code: roleForm.code || roleForm.name.toLowerCase().replace(/\s+/g, '_'),
          description: roleForm.description,
          level: roleForm.level,
          permission_codes: selectedPermissions,
        };
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.error) {
        toast({ title: '保存失败', description: data.error, variant: 'error' });
        return;
      }

      toast({ title: '保存成功', description: `角色 "${roleForm.name}" 已保存` });
      setRoleDialogOpen(false);
      loadData();
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const deleteRole = async (role: Role) => {
    if (role.is_super_admin) {
      toast({ title: '无法删除', description: '超级管理员角色不能删除', variant: 'error' });
      return;
    }
    if (!confirm(`确定要删除角色 "${role.name}" 吗？`)) return;

    try {
      const res = await fetch(`/api/auth/center/roles?id=${role.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.error) {
        toast({ title: '删除失败', description: data.error, variant: 'error' });
        return;
      }
      toast({ title: '删除成功', description: `角色 "${role.name}" 已删除` });
      loadData();
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 用户管理
  const openUserRoleDialog = (user: User) => {
    setEditingUser(user);
    setSelectedRoleIds(user.role_ids || []);
    setUserRoleDialogOpen(true);
  };

  const saveUserRole = async () => {
    if (!editingUser) return;

    try {
      const res = await fetch('/api/auth/center/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          role_ids: selectedRoleIds,
        }),
      });

      const data = await res.json();
      if (data.error) {
        toast({ title: '保存失败', description: data.error, variant: 'error' });
        return;
      }

      toast({ title: '保存成功', description: `用户 "${editingUser.name}" 角色已更新` });
      setUserRoleDialogOpen(false);
      loadData();
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const openUserDialog = () => {
    setUserForm({ username: '', name: '', phone: '', password: '' });
    setUserDialogOpen(true);
  };

  const saveUser = async () => {
    if (!userForm.username || !userForm.name || !userForm.password) {
      toast({ title: '请填写完整信息', variant: 'error' });
      return;
    }

    try {
      const res = await fetch('/api/auth/center/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm),
      });

      const data = await res.json();
      if (data.error) {
        toast({ title: '保存失败', description: data.error, variant: 'error' });
        return;
      }

      toast({ title: '保存成功', description: `用户 "${userForm.name}" 已创建` });
      setUserDialogOpen(false);
      loadData();
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`确定要删除用户 "${user.name}" 吗？`)) return;

    try {
      const res = await fetch(`/api/auth/center/users?id=${user.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.error) {
        toast({ title: '删除失败', description: data.error, variant: 'error' });
        return;
      }
      toast({ title: '删除成功', description: `用户 "${user.name}" 已删除` });
      loadData();
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">权限中心</h1>
          <p className="text-gray-500 mt-1">管理系统角色、用户权限和访问控制</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">角色数量</CardTitle>
              <Shield className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{roles.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">用户数量</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">权限项目</CardTitle>
              <Key className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{groupedPermissions.reduce((sum, m) => sum + m.permissions.length, 0)}</div>
            </CardContent>
          </Card>
        </div>

        {/* 主卡片 */}
        <Card>
          <CardContent className="p-0">
            {/* Tabs */}
            <div className="border-b">
              <div className="flex gap-1 overflow-x-auto p-2">
                <button
                  onClick={() => setActiveTab('roles')}
                  className={cn(
                    'shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    activeTab === 'roles'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  角色管理
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={cn(
                    'shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    activeTab === 'users'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  用户管理
                </button>
                <button
                  onClick={() => setActiveTab('permissions')}
                  className={cn(
                    'shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    activeTab === 'permissions'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  权限配置
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-4 sm:p-6">
              {/* 角色管理 Tab */}
              {activeTab === 'roles' && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                    <h2 className="text-lg font-medium">角色列表</h2>
                    <Button onClick={() => openRoleDialog()} className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto">
                      <Plus className="h-4 w-4 mr-2" />
                      新增角色
                    </Button>
                  </div>
                  <div className="hidden overflow-x-auto rounded-lg border md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>角色名称</TableHead>
                          <TableHead>角色代码</TableHead>
                          <TableHead>描述</TableHead>
                          <TableHead>权限数量</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roles.map((role) => (
                          <TableRow key={role.id}>
                            <TableCell className="font-medium">{role.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{role.code}</Badge>
                            </TableCell>
                            <TableCell className="text-gray-500">{role.description || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{role.permission_count}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openRoleDialog(role)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {!role.is_super_admin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteRole(role)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {roles.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                              暂无角色数据
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="space-y-3 md:hidden">
                    {roles.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                        暂无角色数据
                      </div>
                    ) : roles.map((role) => (
                      <div key={role.id} className="rounded-lg border bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">{role.name}</div>
                            <div className="mt-1">
                              <Badge variant="outline">{role.code}</Badge>
                            </div>
                          </div>
                          <Badge variant="secondary" className="shrink-0">{role.permission_count}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-gray-500">{role.description || '-'}</div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRoleDialog(role)}
                            className="text-blue-600"
                          >
                            <Edit className="mr-1 h-4 w-4" />
                            编辑
                          </Button>
                          {!role.is_super_admin ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteRole(role)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              删除
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              超级管理员
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 用户管理 Tab */}
              {activeTab === 'users' && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                    <h2 className="text-lg font-medium">用户列表</h2>
                    <Button onClick={openUserDialog} className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto">
                      <Plus className="h-4 w-4 mr-2" />
                      新增用户
                    </Button>
                  </div>
                  <div className="hidden overflow-x-auto rounded-lg border md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>用户名</TableHead>
                          <TableHead>姓名</TableHead>
                          <TableHead>手机号</TableHead>
                          <TableHead>角色</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.username}</TableCell>
                            <TableCell>{user.name}</TableCell>
                            <TableCell className="text-gray-500">{user.phone || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{user.role || '-'}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openUserRoleDialog(user)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <UserCog className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteUser(user)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                              暂无用户数据
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="space-y-3 md:hidden">
                    {users.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                        暂无用户数据
                      </div>
                    ) : users.map((user) => (
                      <div key={user.id} className="rounded-lg border bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">{user.name}</div>
                            <div className="mt-1 truncate text-xs text-gray-500">{user.username}</div>
                          </div>
                          <Badge variant="outline" className="shrink-0">{user.role || '-'}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-gray-500">{user.phone || '-'}</div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openUserRoleDialog(user)}
                            className="text-blue-600"
                          >
                            <UserCog className="mr-1 h-4 w-4" />
                            角色
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteUser(user)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 权限配置 Tab */}
              {activeTab === 'permissions' && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h2 className="text-lg font-medium">权限配置指南</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      在「角色管理」中编辑角色时，可以勾选该角色拥有的权限
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedPermissions.map((module) => (
                      <Card key={module.key}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{module.name}</CardTitle>
                          <CardDescription>
                            {module.permissions.length} 个权限项
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-1">
                            {module.permissions.map((perm) => (
                              <div 
                                key={perm.code} 
                                className="text-sm text-gray-600 py-1 border-b border-gray-100 last:border-0"
                              >
                                {perm.name}
                                <span className="text-gray-400 text-xs ml-2">
                                  {perm.code}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 角色编辑对话框 */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? '编辑角色' : '新增角色'}</DialogTitle>
            <DialogDescription>
              {editingRole ? '修改角色信息和权限配置' : '创建新角色并配置权限'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* 角色基本信息 */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">基本信息</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">角色名称 *</Label>
                  <Input
                    id="name"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="请输入角色名称"
                    disabled={roleForm.is_super_admin}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">角色描述</Label>
                  <Input
                    id="description"
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    placeholder="请输入角色描述"
                    disabled={roleForm.is_super_admin}
                  />
                </div>
              </div>
              
              {editingRole && editingRole.is_super_admin && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  超级管理员角色拥有全部权限，无法修改
                </div>
              )}
            </div>

            {/* 权限配置 - 确保始终渲染，即使权限为空 */}
            {!roleForm.is_super_admin && (
              <div className="space-y-4">
                <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
                  <h3 className="text-sm font-medium text-gray-700">权限配置</h3>
                  <span className="text-sm text-gray-500">
                    已选择 {selectedPermissions.length} 项权限
                  </span>
                </div>
                
                <div className="max-h-[400px] space-y-6 overflow-y-auto rounded-lg border p-3 sm:p-4">
                  {groupedPermissions.map((module) => (
                    <div key={module.key} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-0 bg-white pb-2">
                        <Checkbox
                          id={`module-${module.key}`}
                          checked={isModuleAllChecked(module)}
                          indeterminate={isModuleIndeterminate(module)}
                          onCheckedChange={(checked) => toggleModulePermissions(module, !!checked)}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <Label 
                          htmlFor={`module-${module.key}`}
                          className="font-medium text-gray-900 cursor-pointer"
                        >
                          {module.name}
                        </Label>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {module.permissions.filter((p) => selectedPermissions.includes(p.code)).length}/{module.permissions.length}
                        </Badge>
                      </div>
                      
                      <div className="grid gap-2 pl-0 sm:grid-cols-2 sm:pl-8">
                        {module.permissions.map((perm) => (
                          <div 
                            key={perm.code} 
                            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
                          >
                            <Checkbox
                              id={perm.code}
                              checked={selectedPermissions.includes(perm.code)}
                              onCheckedChange={(checked) => togglePermission(perm.code, !!checked)}
                              className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                            <Label 
                              htmlFor={perm.code}
                              className="text-sm cursor-pointer flex-1"
                            >
                              {perm.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {groupedPermissions.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      暂无可配置的权限项
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={saveRole} 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={roleForm.is_super_admin}
            >
              <Save className="h-4 w-4 mr-2" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 用户角色分配对话框 */}
      <Dialog open={userRoleDialogOpen} onOpenChange={setUserRoleDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>分配角色</DialogTitle>
            <DialogDescription>
              为用户「{editingUser?.name}」分配角色
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>选择角色</Label>
              <div className="space-y-2 border rounded-lg p-3 max-h-[300px] overflow-y-auto">
                {roles.map((role) => (
                  <div 
                    key={role.id} 
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
                  >
                    <Checkbox
                      id={`user-role-${role.id}`}
                      checked={selectedRoleIds.includes(role.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedRoleIds([...selectedRoleIds, role.id]);
                        } else {
                          setSelectedRoleIds(selectedRoleIds.filter((id) => id !== role.id));
                        }
                      }}
                      className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <Label 
                      htmlFor={`user-role-${role.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {role.name}
                    </Label>
                  </div>
                ))}
                {roles.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    暂无可用角色
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserRoleDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={saveUserRole} 
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增用户对话框 */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>新增用户</DialogTitle>
            <DialogDescription>创建一个新的系统用户</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名 *</Label>
              <Input
                id="username"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">姓名 *</Label>
              <Input
                id="name"
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                placeholder="请输入姓名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                placeholder="请输入手机号"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码 *</Label>
              <Input
                id="password"
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="请输入密码"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={saveUser} 
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
