'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useCallback } from 'react';
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
  RefreshCw,
  UserCog,
} from 'lucide-react';
import {
  PROJECT_ROLE_OPTIONS,
  type ProjectRoleCode,
} from '@/lib/user-project-roles';

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
    name: '班组结算',
    code: 'team_settlement',
    icon: '📄',
    children: [
      { name: '班组档案-查看', code: 'team_groups:view' },
      { name: '班组档案-新增', code: 'team_groups:create' },
      { name: '班组档案-编辑', code: 'team_groups:edit' },
      { name: '班组档案-删除', code: 'team_groups:delete' },
      { name: '班组结算-查看', code: 'team_settlements:view' },
      { name: '班组结算-新增', code: 'team_settlements:create' },
      { name: '班组结算-编辑', code: 'team_settlements:edit' },
      { name: '班组结算-删除', code: 'team_settlements:delete' },
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
    name: '施工管理',
    code: 'construction_logs',
    icon: '📋',
    children: [
      { name: '施工日志-查看', code: 'construction_logs:view' },
      { name: '施工日志-写日志', code: 'construction_logs:edit' },
      { name: '人员考勤-查看', code: 'construction_attendance:view' },
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
  role?: string;
  is_disabled?: boolean;
  role_ids: number[];
  role_names: string;
  roles: { id: number; name: string; code?: string | null }[];
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

type ProjectRoleMap = Record<number, Record<number, ProjectRoleCode[]>>;

interface ProjectRoleAssignment {
  user_id: number;
  project_id: number;
  role_codes: ProjectRoleCode[];
}

function buildProjectRoleMap(assignments: ProjectRoleAssignment[]): ProjectRoleMap {
  return assignments.reduce<ProjectRoleMap>((acc, assignment) => {
    const userId = Number(assignment.user_id);
    const projectId = Number(assignment.project_id);
    if (!Number.isInteger(userId) || !Number.isInteger(projectId)) return acc;

    acc[userId] = acc[userId] || {};
    acc[userId][projectId] = assignment.role_codes || [];
    return acc;
  }, {});
}

const MENU_PERMISSION_CODE_SET = new Set(PERMISSION_MENU.flatMap((module) => module.children.map((item) => item.code)));

function pickPermissionCodes(codes: string[]) {
  return Array.from(new Set(codes)).filter((code) => MENU_PERMISSION_CODE_SET.has(code));
}

type RoleTemplate = {
  key: string;
  name: string;
  code: string;
  level: number;
  description: string;
  scope: string;
  todoRule: string;
  permissions: string[];
  special?: boolean;
};

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'budget',
    name: '预算员',
    code: 'budget',
    level: 20,
    description: '负责项目数据录入、报量、签证、月度分析、收付款查看和经营分析。',
    scope: '只能查看被分配项目；可在项目内勾选预算员身份接收提醒。',
    todoRule: '只接收自己负责项目、自己发起流程或被指定处理的待办。',
    permissions: pickPermissionCodes([
      'reports:monthly_view',
      'reports:monthly_export',
      'projects:view',
      'projects:edit',
      'work_items:view',
      'work_items:edit',
      'work_items:progress',
      'visas:view',
      'visas:edit',
      'visas:attachments',
      'client_reports:view',
      'client_reports:edit',
      'client_payments:view',
      'suppliers:view',
      'settlements:view',
      'supplier_payments:view',
      'miscellaneous_materials:view',
      'miscellaneous_materials:edit',
      'comprehensive_expenses:view',
      'team_groups:view',
      'team_groups:create',
      'team_groups:edit',
      'team_settlements:view',
      'team_settlements:create',
      'team_settlements:edit',
      'cost_center:view',
      'data_board:supplier_cost_view',
      'data_board:worker_cost_view',
      'data_board:fund_management_view',
      'construction_logs:view',
      'construction_attendance:view',
      'knowledge:view',
      'knowledge:write',
      'knowledge:monthly_analysis',
    ]),
  },
  {
    key: 'project_manager',
    name: '项目经理',
    code: 'project_manager',
    level: 30,
    description: '负责项目现场推进、签证线下办理、施工日志查看和月度分析补充确认。',
    scope: '只能查看被分配项目；在项目内勾选项目经理身份。',
    todoRule: '接收签证推进、月度分析补充、风险提醒等项目内待办。',
    permissions: pickPermissionCodes([
      'projects:view',
      'work_items:view',
      'visas:view',
      'visas:edit',
      'visas:attachments',
      'client_reports:view',
      'team_groups:view',
      'team_settlements:view',
      'construction_logs:view',
      'construction_logs:edit',
      'construction_attendance:view',
      'knowledge:view',
      'knowledge:write',
      'knowledge:monthly_analysis',
    ]),
  },
  {
    key: 'finance',
    name: '财务',
    code: 'finance',
    level: 40,
    description: '负责收付款、工资发放、供应商付款和资金经营数据查看。',
    scope: '按项目列表控制可查看项目，避免非负责项目数据外溢。',
    todoRule: '只接收被指定的付款、工资、财务确认类待办。',
    permissions: pickPermissionCodes([
      'projects:view',
      'client_payments:view',
      'client_payments:edit',
      'supplier_payments:view',
      'supplier_payments:edit',
      'salaries:view',
      'salaries:query',
      'salaries:pay_edit',
      'settlements:view',
      'comprehensive_expenses:view',
      'cost_center:view',
      'data_board:fund_management_view',
    ]),
  },
  {
    key: 'boss',
    name: '老板',
    code: 'boss',
    level: 5,
    description: '查看所有业务明细和经营分析，只处理需要老板批复的流程。',
    scope: '默认具备全局业务查看能力，不需要逐个项目授权。',
    todoRule: '待办只显示提交给老板本人处理的事项，不按全部项目泛推。',
    permissions: pickPermissionCodes([
      'reports:monthly_view',
      'reports:monthly_export',
      'projects:view',
      'work_items:view',
      'visas:view',
      'client_reports:view',
      'client_payments:view',
      'workers:view',
      'salaries:view',
      'salaries:query',
      'suppliers:view',
      'settlements:view',
      'supplier_payments:view',
      'miscellaneous_materials:view',
      'comprehensive_expenses:view',
      'team_groups:view',
      'team_settlements:view',
      'cost_center:view',
      'data_board:supplier_cost_view',
      'data_board:worker_cost_view',
      'data_board:fund_management_view',
      'construction_logs:view',
      'construction_attendance:view',
      'cost_estimation:view',
      'knowledge:view',
      'knowledge:monthly_analysis',
      'knowledge:approval',
    ]),
  },
  {
    key: 'site_staff',
    name: '现场人员',
    code: 'site_staff',
    level: 60,
    description: '负责施工日志填写、现场基础资料查看和必要的签证信息提交。',
    scope: '只能查看被分配项目；建议只勾选实际所在项目。',
    todoRule: '只接收施工日志、现场补充资料等本人相关提醒。',
    permissions: pickPermissionCodes([
      'projects:view',
      'visas:view',
      'construction_logs:view',
      'construction_logs:edit',
      'knowledge:view',
    ]),
  },
  {
    key: 'super_admin',
    name: '超级管理员',
    code: 'super_admin',
    level: 1,
    description: '系统维护角色，可管理全部项目和系统配置。',
    scope: '具备全系统管理能力，但负责项目/待办提醒必须单独勾选。',
    todoRule: '不因为超级管理员身份默认接收全部项目待办。',
    permissions: [],
    special: true,
  },
];

export default function PermissionCenterPage() {
  const { toast } = useToast();
  
  // 状态
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [userProjectRoles, setUserProjectRoles] = useState<ProjectRoleMap>({});
  
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
  const [editingProjectRoles, setEditingProjectRoles] = useState<Record<number, ProjectRoleCode[]>>({});

  const isPendingUser = (user: User) =>
    user.role === 'pending' || user.is_disabled || (user.role_ids || []).length === 0;

  const isBossRole = (role: { code?: string | null; name: string }) =>
    role.code === 'boss' || role.name.includes('老板') || role.name.includes('总经理');

  const editingUserCanUseGlobalProjectScope = () => {
    if (editingUser?.role === 'super_admin') return true;
    return roles.some((role) => editingUserRoles.includes(role.id) && isBossRole(role));
  };

  const permissionCenterStats = {
    totalUsers: users.length,
    pendingUsers: users.filter(isPendingUser).length,
    dingtalkBoundUsers: users.filter((user) => user.dingtalk_bound).length,
    projectIdentityUsers: users.filter((user) => Object.keys(userProjectRoles[user.id] || {}).length > 0).length,
  };

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 并行加载角色和用户
      const [rolesRes, usersRes, projectsRes, projectRolesRes] = await Promise.all([
        fetch('/api/system/permission/roles'),
        fetch('/api/system/permission/users'),
        fetch('/api/projects').catch(() => ({ ok: false, json: async () => ({ projects: [] }) })),
        fetch('/api/system/permission/user-project-roles').catch(() => ({ ok: false, json: async () => ({ assignments: [] }) })),
      ]);
      
      const [rolesData, usersData, projectsData, projectRolesData] = await Promise.all([
        rolesRes.json(),
        usersRes.json(),
        projectsRes.json(),
        projectRolesRes.json(),
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

      if (projectRolesData.success || projectRolesData.assignments) {
        setUserProjectRoles(buildProjectRoleMap(projectRolesData.assignments || []));
      }
    } catch {
      // 静默处理错误
      toast({ title: '加载失败', description: '数据加载失败，请刷新重试', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
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
    } catch {
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
      setSelectedPermissions((prev) => Array.from(new Set([...prev, code])));
    } else {
      setSelectedPermissions((prev) => prev.filter((p) => p !== code));
    }
  };

  const toggleModulePermissions = (module: typeof PERMISSION_MENU[0], checked: boolean) => {
    if (checked) {
      const allCodes = module.children.map((p) => p.code);
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...allCodes])));
    } else {
      const removeCodes = module.children.map((p) => p.code);
      setSelectedPermissions((prev) => prev.filter((p) => !removeCodes.includes(p)));
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
      } catch {
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

  const openRoleTemplate = (template: RoleTemplate) => {
    if (template.special) return;

    const existingRole = roles.find((role) => role.code === template.code || role.name === template.name);
    if (existingRole) {
      void openRoleDialog(existingRole);
      return;
    }

    setEditingRole(null);
    setRoleForm({
      name: template.name,
      description: template.description,
      code: template.code,
      level: template.level,
    });
    setSelectedPermissions(template.permissions);
    setSelectedProjects([]);
    setExpandedModules(
      PERMISSION_MENU.filter((module) =>
        module.children.some((permission) => template.permissions.includes(permission.code))
      ).map((module) => module.code)
    );
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
      let body: {
        id?: number;
        name: string;
        code: string;
        description: string;
        level: number;
        permission_codes: string[];
        allowed_projects: number[];
      } = {
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
    } catch {
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
    } catch {
      toast({ title: '删除失败', description: '网络错误', variant: 'error' });
    }
  };

  // 用户角色分配
  const getUserProjectRoleSummary = (userId: number) => {
    const rolesByProject = userProjectRoles[userId] || {};
    const counts = PROJECT_ROLE_OPTIONS.reduce((acc, option) => {
      acc[option.code] = 0;
      return acc;
    }, {} as Record<ProjectRoleCode, number>);

    Object.values(rolesByProject).forEach((roleCodes) => {
      roleCodes.forEach((roleCode) => {
        counts[roleCode] += 1;
      });
    });

    const summary = PROJECT_ROLE_OPTIONS
      .map((option) => (counts[option.code] > 0 ? `${option.label}${counts[option.code]}` : ''))
      .filter(Boolean)
      .join('、');

    return summary || '未配置';
  };

  const setEditingUserProjectChecked = (projectId: number, checked: boolean) => {
    if (checked) {
      setEditingUserProjects((prev) => Array.from(new Set([...prev, projectId])));
      return;
    }

    setEditingUserProjects((prev) => prev.filter((id) => id !== projectId));
    setEditingProjectRoles((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  };

  const toggleEditingProjectRole = (projectId: number, roleCode: ProjectRoleCode, checked: boolean) => {
    setEditingProjectRoles((prev) => {
      const current = prev[projectId] || [];
      const nextCodes = checked
        ? Array.from(new Set([...current, roleCode]))
        : current.filter((code) => code !== roleCode);

      return {
        ...prev,
        [projectId]: nextCodes,
      };
    });
  };

  const openUserRoleDialog = (user: User) => {
    setEditingUser(user);
    setEditingUserRoles(user.role_ids || []);
    setEditingUserProjects(user.allowed_projects || []);
    setEditingProjectRoles(
      Object.fromEntries(
        Object.entries(userProjectRoles[user.id] || {}).map(([projectId, roleCodes]) => [
          Number(projectId),
          [...roleCodes],
        ])
      )
    );
    setUserRoleDialogOpen(true);
  };

  const saveUserRoles = async () => {
    if (!editingUser) return;

    if (projects.length > 0 && editingUserProjects.length === 0 && !editingUserCanUseGlobalProjectScope()) {
      toast({
        title: '请选择可访问项目',
        description: '普通员工只能查看被分配项目；只有老板或超级管理员可留空表示全局查看。',
        variant: 'error',
      });
      return;
    }

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

      const projectRoleAssignments = editingUserProjects.map((projectId) => ({
        project_id: projectId,
        role_codes: editingProjectRoles[projectId] || [],
      }));

      const projectRolesRes = await fetch('/api/system/permission/user-project-roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingUser.id,
          assignments: projectRoleAssignments,
        }),
      });

      const projectRolesData = await projectRolesRes.json();
      if (!projectRolesData.success) {
        toast({ title: '项目身份保存失败', description: projectRolesData.error, variant: 'error' });
        return;
      }

      toast({ title: '保存成功', description: `用户 "${editingUser.name}" 的角色和项目身份已更新` });
      setUserRoleDialogOpen(false);
      loadData();
    } catch {
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
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">用户与权限</h1>
          <p className="text-gray-500 mt-1">按岗位模板分配系统权限，按项目列表控制可见范围，按项目身份承接待办提醒</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          <Button variant="outline" onClick={initPermissions} className="w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-2" />
            初始化权限
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">系统用户</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{permissionCenterStats.totalUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">待分配账号</p>
            <p className="mt-2 text-2xl font-semibold text-orange-600">{permissionCenterStats.pendingUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">钉钉已绑定</p>
            <p className="mt-2 text-2xl font-semibold text-blue-600">{permissionCenterStats.dingtalkBoundUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">已配置项目身份</p>
            <p className="mt-2 text-2xl font-semibold text-green-600">{permissionCenterStats.projectIdentityUsers}</p>
          </CardContent>
        </Card>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="roles" className="shrink-0 gap-2">
            <Shield className="w-4 h-4" />
            岗位模板
          </TabsTrigger>
          <TabsTrigger value="users" className="shrink-0 gap-2">
            <Users className="w-4 h-4" />
            用户分配
          </TabsTrigger>
          <TabsTrigger value="config" className="shrink-0 gap-2">
            <Menu className="w-4 h-4" />
            菜单权限配置
          </TabsTrigger>
        </TabsList>

        {/* 角色管理 */}
        <TabsContent value="roles" className="mt-4">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>岗位模板</CardTitle>
              <CardDescription>
                先按岗位建立权限模板，再在用户分配中勾选具体项目。超级管理员是系统维护身份，不作为普通业务岗位使用。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 lg:grid-cols-3">
                {ROLE_TEMPLATES.map((template) => (
                  <div key={template.key} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{template.name}</h3>
                          {template.special ? (
                            <Badge variant="destructive">特殊角色</Badge>
                          ) : (
                            <Badge variant="outline">{template.permissions.length} 项权限</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-gray-600">{template.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-gray-500">
                      <p><span className="font-medium text-gray-700">项目范围：</span>{template.scope}</p>
                      <p><span className="font-medium text-gray-700">待办规则：</span>{template.todoRule}</p>
                    </div>
                    <div className="mt-4">
                      {template.special ? (
                        <Button variant="outline" size="sm" disabled>
                          系统内置
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => openRoleTemplate(template)}>
                          {roles.some((role) => role.code === template.code || role.name === template.name) ? '编辑模板' : '按模板新建'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>角色列表</CardTitle>
                <CardDescription>模板保存后会出现在这里；如需微调某一岗位，可编辑对应角色权限</CardDescription>
              </div>
              <Button onClick={() => openRoleDialog()} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                新建角色
              </Button>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-x-auto md:block">
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
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
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
              </div>
              <div className="space-y-3 md:hidden">
                {roles.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                    暂无角色
                  </div>
                ) : (
                  roles.map((role) => (
                    <article key={role.id} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium text-gray-900">{role.name}</h3>
                            {role.is_super_admin && <Badge variant="destructive">超级管理员</Badge>}
                          </div>
                          <p className="mt-1 break-all text-xs text-gray-500">{role.code}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0">{role.permission_count} 项</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-md bg-gray-50 p-2">
                          <p className="text-xs text-gray-500">级别</p>
                          <p className="mt-1 text-gray-900">{role.level}</p>
                        </div>
                        <div className="rounded-md bg-gray-50 p-2">
                          <p className="text-xs text-gray-500">项目范围</p>
                          <p className={role.allowed_projects?.length === 0 ? 'mt-1 text-green-600' : 'mt-1 text-orange-600'}>
                            {role.allowed_projects?.length === 0 ? '全部项目' : `${role.allowed_projects?.length || 0} 个项目`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => openRoleDialog(role)}>
                          <Edit className="w-4 h-4 mr-1" />
                          编辑
                        </Button>
                        {!role.is_super_admin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deleteRole(role)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            删除
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            内置
                          </Button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 用户管理 */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>用户分配台账</CardTitle>
              <CardDescription>
                待分配钉钉账号在这里指定岗位模板、可访问项目和项目内业务身份，保存后账号正式启用
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>状态</TableHead>
                    <TableHead>用户名</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>手机号</TableHead>
                    <TableHead>岗位模板</TableHead>
                    <TableHead>钉钉绑定</TableHead>
                    <TableHead>可访问项目</TableHead>
                    <TableHead>项目身份</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                        暂无用户数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => {
                      const pending = isPendingUser(user);
                      const canUseGlobalScope = user.role === 'super_admin' || (user.roles || []).some(isBossRole);
                      const selectedProjectCount = user.allowed_projects?.length || 0;
                      return (
                        <TableRow key={user.id}>
                          <TableCell>
                            {user.is_disabled ? (
                              <Badge variant="destructive">已禁用</Badge>
                            ) : pending ? (
                              <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700">待分配</Badge>
                            ) : (
                              <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">已启用</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{user.username}</TableCell>
                          <TableCell>{user.name}</TableCell>
                          <TableCell>{user.phone || user.dingtalk_info?.mobile || '-'}</TableCell>
                          <TableCell>
                            {(user.roles || []).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.roles.map((role) => (
                                  <Badge key={role.id} variant="outline">{role.name}</Badge>
                                ))}
                              </div>
                            ) : (
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
                            {selectedProjectCount === 0 ? (
                              canUseGlobalScope ? (
                                <span className="text-green-600">全部项目</span>
                              ) : (
                                <span className="text-red-600">未选择项目</span>
                              )
                            ) : (
                              <span className="text-orange-600">{selectedProjectCount} 个项目</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {getUserProjectRoleSummary(user.id)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => openUserRoleDialog(user)}>
                              <UserCog className="w-4 h-4 mr-1" />
                              分配岗位与项目
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {users.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                    暂无用户数据
                  </div>
                ) : (
                  users.map((user) => {
                    const pending = isPendingUser(user);
                    const canUseGlobalScope = user.role === 'super_admin' || (user.roles || []).some(isBossRole);
                    const selectedProjectCount = user.allowed_projects?.length || 0;
                    return (
                      <article key={user.id} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium text-gray-900">{user.name || user.username}</h3>
                            <p className="mt-1 truncate text-xs text-gray-500">{user.username} · {user.phone || user.dingtalk_info?.mobile || '-'}</p>
                          </div>
                          {user.is_disabled ? (
                            <Badge variant="destructive" className="shrink-0">已禁用</Badge>
                          ) : pending ? (
                            <Badge variant="outline" className="shrink-0 border-orange-300 bg-orange-50 text-orange-700">待分配</Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0 border-green-300 bg-green-50 text-green-700">已启用</Badge>
                          )}
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                          <div>
                            <p className="mb-1 text-xs text-gray-500">岗位模板</p>
                            {(user.roles || []).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.roles.map((role) => (
                                  <Badge key={role.id} variant="outline">{role.name}</Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">未分配</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md bg-gray-50 p-2">
                              <p className="text-xs text-gray-500">钉钉绑定</p>
                              <p className="mt-1 truncate text-blue-600">
                                {user.dingtalk_bound ? (user.dingtalk_info?.name || user.dingtalk_info?.user_id || '已绑定') : '未绑定'}
                              </p>
                            </div>
                            <div className="rounded-md bg-gray-50 p-2">
                              <p className="text-xs text-gray-500">可访问项目</p>
                              <p className={selectedProjectCount === 0 && !canUseGlobalScope ? 'mt-1 text-red-600' : selectedProjectCount === 0 ? 'mt-1 text-green-600' : 'mt-1 text-orange-600'}>
                                {selectedProjectCount === 0 ? (canUseGlobalScope ? '全部项目' : '未选择') : `${selectedProjectCount} 个项目`}
                              </p>
                            </div>
                          </div>
                          <div className="rounded-md bg-gray-50 p-2">
                            <p className="text-xs text-gray-500">项目身份</p>
                            <p className="mt-1 text-gray-700">{getUserProjectRoleSummary(user.id)}</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => openUserRoleDialog(user)}>
                          <UserCog className="w-4 h-4 mr-1" />
                          分配岗位与项目
                        </Button>
                      </article>
                    );
                  })
                )}
              </div>
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
                      <div className="p-3 bg-white grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? '编辑岗位模板' : '新建岗位模板'}</DialogTitle>
            <DialogDescription>
              {editingRole ? `编辑「${editingRole.name}」的权限配置` : '创建新岗位模板并配置权限'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* 基本信息 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="roleName">岗位模板名称 *</Label>
                <Input
                  id="roleName"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="输入角色名称"
                  disabled={editingRole?.is_super_admin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleLevel">模板级别</Label>
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
              <Label htmlFor="roleDesc">模板描述</Label>
              <Input
                id="roleDesc"
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder="输入角色描述"
              />
            </div>

            {/* 可访问项目 */}
            <div className="space-y-2">
              <Label>模板默认项目范围（建议留空，具体项目在用户分配中勾选）</Label>
              <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
                {projects.length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无可选项目</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
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
                          if (el) {
                            (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = isModuleIndeterminate(module);
                          }
                        }}
                        onCheckedChange={(checked) => toggleModulePermissions(module, !!checked)}
                      />
                      <span className="font-medium text-sm">{module.icon} {module.name}</span>
                    </div>
                    <div className="p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
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
                已选择 {selectedPermissions.length} 个权限。需要取消模板里的权限时，直接取消对应勾选后保存。
              </p>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>分配岗位与项目</DialogTitle>
            <DialogDescription>
              为用户「{editingUser?.name}」指定岗位模板、可访问项目和项目内待办身份
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-medium">分配规则</p>
              <p className="mt-1">
                普通员工必须勾选可访问项目；老板可全局查看业务明细；超级管理员可管理全部项目，但负责项目和待办提醒仍按下方项目身份单独勾选。
              </p>
            </div>

            {/* 角色选择 */}
            <div className="space-y-2">
              <Label>1. 业务岗位模板</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                {roles.length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无可用角色</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {roles.filter((r) => !r.is_super_admin).map((role) => (
                      <div key={role.id} className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
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
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>2. 可访问项目</Label>
                  <p className="mt-1 text-xs text-gray-500">
                    普通员工按项目列表勾选；留空只建议用于老板或超级管理员这类全局查看身份。
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingUserProjects(projects.map((project) => project.id))}
                  disabled={projects.length === 0}
                >
                  全选项目
                </Button>
              </div>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                {projects.length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无可选项目</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                        <Checkbox
                          id={`up-${project.id}`}
                          checked={editingUserProjects.includes(project.id)}
                          onCheckedChange={(checked) => setEditingUserProjectChecked(project.id, !!checked)}
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
            <div className="space-y-2">
              <div>
                <Label>3. 项目内业务身份与待办提醒</Label>
                {editingUser && (
                  <p className="text-xs text-blue-600 mt-1">
                    当前配置：{getUserProjectRoleSummary(editingUser.id)}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  用于待办、提醒和后续钉钉推送；这里必须绑定到具体项目，不继承“全部项目可见”。
                </p>
              </div>
              <div className="border rounded-lg p-3 max-h-64 overflow-y-auto">
                {editingUserProjects.length === 0 ? (
                  <p className="text-gray-400 text-sm">请先选择需要绑定身份的具体项目</p>
                ) : (
                  <div className="space-y-3">
                    {projects
                      .filter((project) => editingUserProjects.includes(project.id))
                      .map((project) => (
                        <div key={project.id} className="rounded-md border border-gray-100 p-3">
                          <div className="text-sm font-medium text-gray-900 mb-2">{project.name}</div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {PROJECT_ROLE_OPTIONS.map((option) => (
                              <div key={option.code} className="flex items-center gap-2">
                                <Checkbox
                                  id={`project-role-${project.id}-${option.code}`}
                                  checked={(editingProjectRoles[project.id] || []).includes(option.code)}
                                  onCheckedChange={(checked) =>
                                    toggleEditingProjectRole(project.id, option.code, !!checked)
                                  }
                                />
                                <Label
                                  htmlFor={`project-role-${project.id}-${option.code}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {option.label}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
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
