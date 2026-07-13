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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Shield,
  Users,
  Menu,
  Plus,
  Smartphone,
  Edit,
  Trash2,
  Save,
  Loader2,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  RefreshCw,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// 权限菜单结构（按新导航6大模块分组）
// 权限编码统一格式: {resource}:{action}
// 注意：所有 code 必须与数据库 permissions 表中的 code 一致
const PERMISSION_MENU = [
  {
    name: '工作台',
    code: 'workspace',
    icon: '🏠',
    children: [
      { name: '月度经营月报-查看', code: 'reports:monthly_view' },
      { name: '月度经营月报-导出', code: 'reports:monthly_export' },
      { name: 'AI劳务助手-对话', code: 'ai:chat' },
      { name: 'AI劳务助手-上传文件', code: 'ai:upload' },
      { name: 'AI劳务助手-知识库', code: 'ai:knowledge' },
    ]
  },
  {
    name: '项目经营',
    code: 'projects',
    icon: '🏗️',
    children: [
      { name: '项目管理-查看', code: 'projects:view' },
      { name: '项目管理-编辑', code: 'projects:edit' },
      { name: '项目管理-删除', code: 'projects:delete' },
      { name: '报量管理-查看', code: 'work_items:view' },
      { name: '报量管理-编辑', code: 'work_items:edit' },
      { name: '报量管理-删除', code: 'work_items:delete' },
      { name: '报量管理-进度', code: 'work_items:progress' },
      { name: '签证管理-查看', code: 'visas:view' },
      { name: '签证管理-编辑', code: 'visas:edit' },
      { name: '签证管理-删除', code: 'visas:delete' },
      { name: '签证管理-附件', code: 'visas:attachments' },
      { name: '甲方报量-查看', code: 'client_reports:view' },
      { name: '甲方报量-编辑', code: 'client_reports:edit' },
      { name: '甲方报量-删除', code: 'client_reports:delete' },
      { name: '甲方回款-查看', code: 'client_payments:view' },
      { name: '甲方回款-编辑', code: 'client_payments:edit' },
      { name: '甲方回款-删除', code: 'client_payments:delete' },
    ]
  },
  {
    name: '人力工资',
    code: 'hr_salary',
    icon: '👷',
    children: [
      { name: '花名册-查看', code: 'workers:view' },
      { name: '花名册-编辑', code: 'workers:edit' },
      { name: '花名册-删除', code: 'workers:delete' },
      { name: '花名册-导入', code: 'workers:import' },
      { name: '花名册-导出', code: 'workers:export' },
      { name: '证件管理-查看', code: 'certificates:view' },
      { name: '证件管理-编辑', code: 'certificates:edit' },
      { name: '证件管理-删除', code: 'certificates:delete' },
      { name: '证件管理-附件上传', code: 'certificates:upload' },
      { name: '月度工资-查看', code: 'salaries:view' },
      { name: '月度工资-编辑', code: 'salaries:edit' },
      { name: '月度工资-删除', code: 'salaries:delete' },
      { name: '月度工资-导入', code: 'salaries:import' },
      { name: '月度工资-导出', code: 'salaries:export' },
      { name: '工资查询', code: 'salaries:query' },
      { name: '工资发放', code: 'salaries:pay_edit' },
    ]
  },
  {
    name: '供应商与费用',
    code: 'supplier_expense',
    icon: '🤝',
    children: [
      { name: '供应商库-查看', code: 'suppliers:view' },
      { name: '供应商库-编辑', code: 'suppliers:edit' },
      { name: '供应商库-删除', code: 'suppliers:delete' },
      { name: '结算管理-查看', code: 'settlements:view' },
      { name: '结算管理-编辑', code: 'settlements:edit' },
      { name: '结算管理-删除', code: 'settlements:delete' },
      { name: '供应商付款-查看', code: 'supplier_payments:view' },
      { name: '供应商付款-编辑', code: 'supplier_payments:edit' },
      { name: '零星材料-查看', code: 'miscellaneous_materials:view' },
      { name: '零星材料-编辑', code: 'miscellaneous_materials:edit' },
      { name: '综合费用-查看', code: 'comprehensive_expenses:view' },
      { name: '综合费用-编辑', code: 'comprehensive_expenses:edit' },
    ]
  },
  {
    name: '经营分析',
    code: 'analysis',
    icon: '📊',
    children: [
      { name: '成本利润中心', code: 'cost_center:view' },
      { name: '供应商成本看板', code: 'data_board:supplier_cost_view' },
      { name: '工人成本看板', code: 'data_board:worker_cost_view' },
      { name: '资金管理看板', code: 'data_board:fund_management_view' },
    ]
  },
  {
    name: '系统管理',
    code: 'system',
    icon: '⚙️',
    children: [
      { name: '消息通知-查看', code: 'notifications:view' },
      { name: '通知设置', code: 'notifications:settings' },
      { name: '钉钉集成管理', code: 'system:dingtalk_manage' },
      { name: 'AI助手配置', code: 'system:ai_manage' },
      { name: '操作日志', code: 'audit:view' },
      { name: '系统管理', code: 'system:manage' },
      { name: '权限管理', code: 'system:permission_manage' },
      { name: '用户管理', code: 'users:edit' },
      { name: '角色管理', code: 'roles:edit' },
    ]
  },
  {
    name: '施工日志',
    code: 'construction_logs',
    icon: '📋',
    children: [
      { name: '施工日志-查看', code: 'construction_logs:view' },
      { name: '施工日志-写日志', code: 'construction_logs:edit' },
    ]
  },
  {
    name: '成本测算',
    code: 'cost_estimation',
    icon: '📊',
    children: [
      { name: '成本测算-查看', code: 'cost_estimation:view' },
      { name: '成本测算-投标', code: 'cost_estimation:bid' },
    ]
  },
  {
    name: '知识库',
    code: 'knowledge',
    icon: '📚',
    children: [
      { name: '知识库-查看', code: 'knowledge:view' },
      { name: '写知识', code: 'knowledge:write' },
      { name: '月度分析', code: 'knowledge:monthly_analysis' },
      { name: '审批流程', code: 'knowledge:approval' },
    ]
  },
];

interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  level: number;
  permission_count: number;
  allowed_projects: number[];
  is_super_admin: boolean;
}

interface User {
  id: number;
  username: string;
  name: string;
  phone?: string;
  role_ids: number[];
  role_names: string;
  roles: { id: number; name: string }[];
  allowed_projects: number[];
  dingtalk_bound?: boolean;
  dingtalk_info?: {
    user_id: string;
    name: string;
    mobile: string;
    dept_id: string;
    active: boolean;
    last_sync: string;
  };
}

interface Project {
  id: number;
  name: string;
}

export default function PermissionCenterPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // 状态
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  
  // 角色对话框
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    code: '',
    level: 10,
  });
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [expandedModules, setExpandedModules] = useState<string[]>(['projects']);
  
  // 用户角色分配对话框
  const [userRoleDialogOpen, setUserRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingUserRoles, setEditingUserRoles] = useState<number[]>([]);
  const [editingUserProjects, setEditingUserProjects] = useState<number[]>([]);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 并行加载角色和用户
      const [rolesRes, usersRes, projectsRes] = await Promise.all([
        fetch('/api/system/permission/roles'),
        fetch('/api/system/permission/users'),
        fetch('/api/projects').catch(() => ({ ok: false, json: async () => ({ projects: [] }) })),
      ]);
      
      const [rolesData, usersData, projectsData] = await Promise.all([
        rolesRes.json(),
        usersRes.json(),
        projectsRes.json(),
      ]);
      
      if (rolesData.success) {
        setRoles(rolesData.roles || []);
      }
      
      if (usersData.success) {
        setUsers(usersData.users || []);
      }
      
      if (projectsData.projects) {
        setProjects(projectsData.projects);
      }
    } catch {
      // 静默处理错误
      toast({ title: '加载失败', description: '数据加载失败，请刷新重试', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 初始化权限数据
  const initPermissions = async () => {
    try {
      const res = await fetch('/api/system/permission/menu', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast({ title: '初始化成功', description: `已初始化 ${data.count} 个权限项` });
        loadData();
      } else {
        toast({ title: '初始化失败', description: data.error, variant: 'error' });
      }
    } catch (error) {
      toast({ title: '初始化失败', description: '网络错误', variant: 'error' });
    }
  };

  // 权限勾选相关函数
  const isModuleAllChecked = (module: typeof PERMISSION_MENU[0]) => {
    return module.children.every((p) => selectedPermissions.includes(p.code));
  };

  const isModuleIndeterminate = (module: typeof PERMISSION_MENU[0]) => {
    const checked = module.children.filter((p) => selectedPermissions.includes(p.code)).length;
    return checked > 0 && checked < module.children.length;
  };

  const togglePermission = (code: string, checked: boolean) => {
    if (checked) {
      setSelectedPermissions([...selectedPermissions, code]);
    } else {
      setSelectedPermissions(selectedPermissions.filter((p) => p !== code));
    }
  };

  const toggleModulePermissions = (module: typeof PERMISSION_MENU[0], checked: boolean) => {
    if (checked) {
      const allCodes = module.children.map((p) => p.code);
      setSelectedPermissions([...new Set([...selectedPermissions, ...allCodes])]);
    } else {
      const removeCodes = module.children.map((p) => p.code);
      setSelectedPermissions(selectedPermissions.filter((p) => !removeCodes.includes(p)));
    }
  };

  const toggleExpanded = (code: string) => {
    setExpandedModules((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // 角色管理
  const openRoleDialog = async (role?: Role) => {
    if (role) {
      // 编辑现有角色，获取详情
      try {
        const res = await fetch(`/api/system/permission/roles/${role.id}`);
        const data = await res.json();
        if (data.success && data.role) {
          setEditingRole(role);
          setRoleForm({
            name: data.role.name,
            description: data.role.description || '',
            code: data.role.code,
            level: data.role.level,
          });
          setSelectedPermissions(data.role.permissions || []);
          setSelectedProjects(data.role.allowed_projects || []);
        }
      } catch (error) {
        toast({ title: '获取角色详情失败', variant: 'error' });
        return;
      }
    } else {
      // 新建角色
      setEditingRole(null);
      setRoleForm({ name: '', description: '', code: '', level: 10 });
      setSelectedPermissions([]);
      setSelectedProjects([]);
    }
    setRoleDialogOpen(true);
  };

  const saveRole = async () => {
    if (!roleForm.name.trim()) {
      toast({ title: '请输入角色名称', variant: 'error' });
      return;
    }

    try {
      let url = '/api/system/permission/roles';
      let method = 'POST';
      let body: any = {
        name: roleForm.name,
        code: roleForm.code || `role_${Date.now()}`,
        description: roleForm.description,
        level: roleForm.level,
        permission_codes: selectedPermissions,
        allowed_projects: selectedProjects,
      };

      if (editingRole) {
        method = 'PUT';
        url = '/api/system/permission/roles';
        body = {
          id: editingRole.id,
          ...body,
        };
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      
      if (!data.success) {
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
      const res = await fetch(`/api/system/permission/roles?id=${role.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        toast({ title: '删除失败', description: data.error, variant: 'error' });
        return;
      }
      toast({ title: '删除成功', description: `角色 "${role.name}" 已删除` });
      loadData();
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误', variant: 'error' });
    }
  };

  // 用户角色分配
  const openUserRoleDialog = (user: User) => {
    setEditingUser(user);
    setEditingUserRoles(user.role_ids || []);
    setEditingUserProjects(user.allowed_projects || []);
    setUserRoleDialogOpen(true);
  };

  const saveUserRoles = async () => {
    if (!editingUser) return;

    try {
      const res = await fetch('/api/system/permission/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          role_ids: editingUserRoles,
          allowed_projects: editingUserProjects,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        toast({ title: '保存失败', description: data.error, variant: 'error' });
        return;
      }

      toast({ title: '保存成功', description: `用户 "${editingUser.name}" 的角色已更新` });
      setUserRoleDialogOpen(false);
      loadData();
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误', variant: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">权限管理中心</h1>
          <p className="text-gray-500 mt-1">管理角色、用户权限和菜单访问控制</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={initPermissions}>
            <RefreshCw className="w-4 h-4 mr-2" />
            初始化权限
          </Button>
        </div>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="w-4 h-4" />
            角色管理
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            用户管理
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Menu className="w-4 h-4" />
            菜单权限配置
          </TabsTrigger>
        </TabsList>

        {/* 角色管理 */}
        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>角色列表</CardTitle>
                <CardDescription>管理系统中的角色及其权限</CardDescription>
              </div>
              <Button onClick={() => openRoleDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                新建角色
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>角色名称</TableHead>
                    <TableHead>角色代码</TableHead>
                    <TableHead>权限数量</TableHead>
                    <TableHead>级别</TableHead>
                    <TableHead>可访问项目</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        暂无角色，请点击「新建角色」创建
                      </TableCell>
                    </TableRow>
                  ) : (
                    roles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">
                          {role.name}
                          {role.is_super_admin && (
                            <Badge variant="destructive" className="ml-2">超级管理员</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-500">{role.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{role.permission_count} 个权限</Badge>
                        </TableCell>
                        <TableCell>级别 {role.level}</TableCell>
                        <TableCell>
                          {role.allowed_projects?.length === 0 ? (
                            <span className="text-green-600">全部项目</span>
                          ) : (
                            <span className="text-orange-600">{role.allowed_projects?.length || 0} 个项目</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openRoleDialog(role)}>
                              <Edit className="w-4 h-4 mr-1" />
                              编辑
                            </Button>
                            {!role.is_super_admin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => deleteRole(role)}
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                删除
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 用户管理 */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>用户列表</CardTitle>
              <CardDescription>管理用户角色分配和项目访问权限</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户名</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>手机号</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>钉钉绑定</TableHead>
                    <TableHead>可访问项目</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        暂无用户数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>{user.phone || '-'}</TableCell>
                        <TableCell>
                          {user.role_names || (
                            <span className="text-gray-400">未分配</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.dingtalk_bound ? (
                            <span className="inline-flex items-center gap-1 text-sm text-blue-600">
                              <Smartphone className="w-3.5 h-3.5" />
                              {user.dingtalk_info?.name || user.dingtalk_info?.user_id || '已绑定'}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">未绑定</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.allowed_projects?.length === 0 ? (
                            <span className="text-green-600">全部项目</span>
                          ) : (
                            <span className="text-orange-600">{user.allowed_projects?.length || 0} 个项目</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openUserRoleDialog(user)}>
                            <UserCog className="w-4 h-4 mr-1" />
                            分配角色
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 菜单权限配置 */}
        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>菜单权限结构</CardTitle>
              <CardDescription>系统支持的所有权限项，可通过角色管理分配给用户</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {PERMISSION_MENU.map((module) => (
                  <div key={module.code} className="border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center gap-3 p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleExpanded(module.code)}
                    >
                      <span className="text-xl">{module.icon}</span>
                      <span className="font-medium flex-1">{module.name}</span>
                      <Badge variant="outline">{module.children.length} 项</Badge>
                      {expandedModules.includes(module.code) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                    {expandedModules.includes(module.code) && (
                      <div className="p-3 bg-white grid grid-cols-3 gap-2">
                        {module.children.map((perm) => (
                          <div
                            key={perm.code}
                            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
                          >
                            <Check className="w-4 h-4 text-blue-600" />
                            <span className="text-sm">{perm.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 角色编辑对话框 */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? '编辑角色' : '新建角色'}</DialogTitle>
            <DialogDescription>
              {editingRole ? `编辑角色「${editingRole.name}」的权限配置` : '创建新角色并配置权限'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="roleName">角色名称 *</Label>
                <Input
                  id="roleName"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="输入角色名称"
                  disabled={editingRole?.is_super_admin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleLevel">角色级别</Label>
                <Input
                  id="roleLevel"
                  type="number"
                  value={roleForm.level}
                  onChange={(e) => setRoleForm({ ...roleForm, level: parseInt(e.target.value) || 10 })}
                  placeholder="1-99，数字越小权限越大"
                  disabled={editingRole?.is_super_admin}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleDesc">角色描述</Label>
              <Input
                id="roleDesc"
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder="输入角色描述"
              />
            </div>

            {/* 可访问项目 */}
            <div className="space-y-2">
              <Label>可访问项目（留空表示可访问全部项目）</Label>
              <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
                {projects.length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无可选项目</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`project-${project.id}`}
                          checked={selectedProjects.includes(project.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProjects([...selectedProjects, project.id]);
                            } else {
                              setSelectedProjects(selectedProjects.filter((id) => id !== project.id));
                            }
                          }}
                        />
                        <Label htmlFor={`project-${project.id}`} className="text-sm cursor-pointer">
                          {project.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 权限配置 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>权限配置</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allCodes = PERMISSION_MENU.flatMap((m) => m.children.map((c) => c.code));
                      setSelectedPermissions(allCodes);
                    }}
                  >
                    全选
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPermissions([])}
                  >
                    清空
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {PERMISSION_MENU.map((module) => (
                  <div key={module.code} className="border-b last:border-b-0">
                    <div className="flex items-center gap-3 p-2 bg-gray-50">
                      <Checkbox
                        checked={isModuleAllChecked(module)}
                        ref={(el) => {
                          if (el) (el as any).indeterminate = isModuleIndeterminate(module);
                        }}
                        onCheckedChange={(checked) => toggleModulePermissions(module, !!checked)}
                      />
                      <span className="font-medium text-sm">{module.icon} {module.name}</span>
                    </div>
                    <div className="p-2 grid grid-cols-3 gap-1">
                      {module.children.map((perm) => (
                        <div key={perm.code} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded">
                          <Checkbox
                            checked={selectedPermissions.includes(perm.code)}
                            onCheckedChange={(checked) => togglePermission(perm.code, !!checked)}
                          />
                          <span className="text-sm">{perm.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                已选择 {selectedPermissions.length} 个权限
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={saveRole}>
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 用户角色分配对话框 */}
      <Dialog open={userRoleDialogOpen} onOpenChange={setUserRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>分配角色</DialogTitle>
            <DialogDescription>
              为用户「{editingUser?.name}」分配角色和可访问项目
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* 角色选择 */}
            <div className="space-y-2">
              <Label>分配角色</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                {roles.length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无可用角色</p>
                ) : (
                  <div className="space-y-2">
                    {roles.filter((r) => !r.is_super_admin).map((role) => (
                      <div key={role.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`role-${role.id}`}
                          checked={editingUserRoles.includes(role.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditingUserRoles([...editingUserRoles, role.id]);
                            } else {
                              setEditingUserRoles(editingUserRoles.filter((id) => id !== role.id));
                            }
                          }}
                        />
                        <Label htmlFor={`role-${role.id}`} className="cursor-pointer">
                          {role.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 项目选择 */}
            <div className="space-y-2">
              <Label>可访问项目（留空表示可访问全部项目）</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                {projects.length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无可选项目</p>
                ) : (
                  <div className="space-y-2">
                    {projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`up-${project.id}`}
                          checked={editingUserProjects.includes(project.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditingUserProjects([...editingUserProjects, project.id]);
                            } else {
                              setEditingUserProjects(editingUserProjects.filter((id) => id !== project.id));
                            }
                          }}
                        />
                        <Label htmlFor={`up-${project.id}`} className="cursor-pointer">
                          {project.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserRoleDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={saveUserRoles}>
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
