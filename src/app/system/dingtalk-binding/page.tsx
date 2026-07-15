'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserCog,
  UserX,
  Users,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getUserDisplayName } from '@/lib/user-display-name';

type PermissionUser = {
  id: number;
  username: string;
  name?: string | null;
  role?: string | null;
  is_disabled?: boolean | null;
  role_ids?: number[];
  role_names?: string;
  roles?: Array<{ id: number; name: string; code?: string | null }>;
  allowed_projects?: number[];
  dingtalk_bound?: boolean;
  dingtalk_info?: {
    user_id?: string | null;
    name?: string | null;
    mobile?: string | null;
    dept_id?: string | null;
    active?: boolean | null;
    last_sync?: string | null;
  } | null;
  created_at?: string;
  last_login?: string | null;
};

type SyncStatus = {
  totalContacts: number;
  activeContacts: number;
  lastSyncTime: string | null;
  pendingAccounts: number;
  enabledAccounts: number;
  disabledAccounts: number;
  boundAccounts: number;
};

type DingTalkConfigStatus = {
  configured: boolean;
  config?: Record<string, string | boolean>;
};

type DingTalkContact = {
  id: number;
  dingtalk_user_id: string;
  name: string;
  mobile?: string | null;
  dept_name_list?: string | null;
  active?: boolean | null;
  title?: string | null;
  sync_time?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getAccountStatus(user: PermissionUser) {
  if (user.role === 'pending' || (user.role_ids || []).length === 0) {
    return { label: '待分配', className: 'border-orange-200 bg-orange-50 text-orange-700' };
  }
  if (user.is_disabled || user.dingtalk_info?.active === false) {
    return { label: '已禁用', className: 'border-red-200 bg-red-50 text-red-700' };
  }
  return { label: '已启用', className: 'border-green-200 bg-green-50 text-green-700' };
}

function matchUserKeyword(user: PermissionUser, keyword: string) {
  if (!keyword) return true;
  const search = keyword.toLowerCase();
  return [
    user.username,
    user.name,
    user.dingtalk_info?.name,
    user.dingtalk_info?.mobile,
    user.dingtalk_info?.user_id,
    user.role_names,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

function matchContactKeyword(contact: DingTalkContact, keyword: string) {
  if (!keyword) return true;
  const search = keyword.toLowerCase();
  return [contact.name, contact.mobile, contact.dingtalk_user_id, contact.dept_name_list, contact.title]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

export default function DingtalkBindingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [users, setUsers] = useState<PermissionUser[]>([]);
  const [contacts, setContacts] = useState<DingTalkContact[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [configStatus, setConfigStatus] = useState<DingTalkConfigStatus | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, statusRes, contactsRes, configRes] = await Promise.all([
        fetch('/api/system/permission/users'),
        fetch('/api/dingtalk/contacts?status=true'),
        fetch('/api/dingtalk/contacts?active_only=false&limit=200'),
        fetch('/api/dingtalk/config'),
      ]);

      const [usersData, statusData, contactsData, configData] = await Promise.all([
        usersRes.json(),
        statusRes.json(),
        contactsRes.json(),
        configRes.json(),
      ]);

      if (usersData.success) setUsers(usersData.users || []);
      if (statusData.success) setSyncStatus(statusData.data || null);
      if (contactsData.success) setContacts(contactsData.data || []);
      if (configData.success) setConfigStatus(configData.data || null);
    } catch {
      toast({ title: '读取失败', description: '无法读取钉钉集成数据', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  const dingTalkUsers = useMemo(
    () => users.filter((user) => user.dingtalk_bound || user.dingtalk_info?.user_id),
    [users]
  );

  const pendingUsers = useMemo(
    () =>
      dingTalkUsers.filter(
        (user) => user.role === 'pending' || (user.role_ids || []).length === 0
      ),
    [dingTalkUsers]
  );

  const enabledUsers = useMemo(
    () =>
      dingTalkUsers.filter(
        (user) =>
          user.role !== 'pending' &&
          (user.role_ids || []).length > 0 &&
          !user.is_disabled &&
          user.dingtalk_info?.active !== false
      ),
    [dingTalkUsers]
  );

  const disabledUsers = useMemo(
    () =>
      dingTalkUsers.filter(
        (user) => Boolean(user.is_disabled) || user.dingtalk_info?.active === false
      ),
    [dingTalkUsers]
  );

  const filteredPendingUsers = pendingUsers.filter((user) => matchUserKeyword(user, keyword));
  const filteredEnabledUsers = enabledUsers.filter((user) => matchUserKeyword(user, keyword));
  const filteredDisabledUsers = disabledUsers.filter((user) => matchUserKeyword(user, keyword));
  const filteredContacts = contacts.filter((contact) => matchContactKeyword(contact, keyword));

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/dingtalk/contacts/sync', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        toast({ title: '同步失败', description: data.error || '请检查钉钉配置', variant: 'error' });
        return;
      }
      toast({
        title: '同步完成',
        description: data.message || `已同步 ${data.data?.userCount || 0} 名钉钉人员`,
      });
      await loadData();
    } catch {
      toast({ title: '同步失败', description: '网络或服务异常', variant: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const goPermission = () => {
    router.push('/system-management?tab=permission');
  };

  const statCards = [
    {
      title: '钉钉配置',
      value: configStatus?.configured ? '已配置' : '未配置',
      desc: configStatus?.configured ? '可执行通讯录同步和免登录' : '请先配置 AppKey / AppSecret / CorpId',
      icon: Smartphone,
      tone: configStatus?.configured ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50',
    },
    {
      title: '通讯录人员',
      value: `${syncStatus?.activeContacts || 0}/${syncStatus?.totalContacts || 0}`,
      desc: `最近同步：${formatDateTime(syncStatus?.lastSyncTime)}`,
      icon: Users,
      tone: 'text-blue-700 bg-blue-50',
    },
    {
      title: '待分配账号',
      value: String(syncStatus?.pendingAccounts ?? pendingUsers.length),
      desc: '需分配岗位模板和项目后才能登录',
      icon: UserCog,
      tone: 'text-orange-700 bg-orange-50',
    },
    {
      title: '自动禁用账号',
      value: String(syncStatus?.disabledAccounts ?? disabledUsers.length),
      desc: '钉钉离职/停用后自动禁止登录',
      icon: UserX,
      tone: 'text-red-700 bg-red-50',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">组织与账号集成</h1>
          <p className="mt-1 text-sm text-slate-500">
            钉钉作为普通员工唯一账号来源；同步后生成待分配账号，完成岗位和项目分配后正式启用。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading || syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '同步中' : '立即同步钉钉'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className={`rounded-lg p-2 ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">{card.title}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{card.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{card.desc}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-blue-100 bg-blue-50/60">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div>
              <p className="font-medium text-blue-950">账号启用规则</p>
              <p className="mt-1 text-sm leading-6 text-blue-800">
                每天自动同步钉钉人员。新人员进入待分配账号；超级管理员在“用户与权限”中分配岗位模板、可访问项目和项目身份后，账号才允许登录。
              </p>
            </div>
          </div>
          <Button variant="outline" className="bg-white" onClick={goPermission}>
            去用户与权限分配
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>账号同步台账</CardTitle>
            <CardDescription>
              只展示钉钉来源账号，不再维护未绑定系统账号入口。
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索姓名 / 手机 / userId"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="pending">待分配账号</TabsTrigger>
              <TabsTrigger value="enabled">已启用账号</TabsTrigger>
              <TabsTrigger value="disabled">已禁用账号</TabsTrigger>
              <TabsTrigger value="contacts">钉钉通讯录</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              <UserTable
                users={filteredPendingUsers}
                loading={loading}
                emptyText="暂无待分配账号"
                actionLabel="去分配"
                onAction={goPermission}
              />
            </TabsContent>

            <TabsContent value="enabled" className="mt-4">
              <UserTable
                users={filteredEnabledUsers}
                loading={loading}
                emptyText="暂无已启用钉钉账号"
              />
            </TabsContent>

            <TabsContent value="disabled" className="mt-4">
              <UserTable
                users={filteredDisabledUsers}
                loading={loading}
                emptyText="暂无自动禁用账号"
              />
            </TabsContent>

            <TabsContent value="contacts" className="mt-4">
              <ContactsTable contacts={filteredContacts} loading={loading} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function UserTable({
  users,
  loading,
  emptyText,
  actionLabel,
  onAction,
}: {
  users: PermissionUser[];
  loading: boolean;
  emptyText: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (users.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        {loading ? '正在读取账号...' : emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>状态</TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>手机号</TableHead>
            <TableHead>岗位模板</TableHead>
            <TableHead>可访问项目</TableHead>
            <TableHead>钉钉 UserId</TableHead>
            <TableHead>最后同步</TableHead>
            {actionLabel && <TableHead>操作</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const status = getAccountStatus(user);
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{getUserDisplayName(user)}</div>
                  <div className="text-xs text-slate-500">{user.username}</div>
                </TableCell>
                <TableCell>{user.dingtalk_info?.mobile || '-'}</TableCell>
                <TableCell>
                  {(user.roles || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(user.roles || []).map((role) => (
                        <Badge key={role.id} variant="secondary">{role.name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-orange-600">未分配</span>
                  )}
                </TableCell>
                <TableCell>
                  {(user.allowed_projects || []).length > 0 ? `${user.allowed_projects?.length} 个项目` : '-'}
                </TableCell>
                <TableCell className="font-mono text-xs">{user.dingtalk_info?.user_id || '-'}</TableCell>
                <TableCell className="text-xs text-slate-500">
                  {formatDateTime(user.dingtalk_info?.last_sync)}
                </TableCell>
                {actionLabel && (
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={onAction}>
                      <UserCheck className="mr-1 h-4 w-4" />
                      {actionLabel}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ContactsTable({ contacts, loading }: { contacts: DingTalkContact[]; loading: boolean }) {
  if (contacts.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        {loading ? '正在读取通讯录...' : '暂无钉钉通讯录数据'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>状态</TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>手机号</TableHead>
            <TableHead>职务</TableHead>
            <TableHead>部门</TableHead>
            <TableHead>钉钉 UserId</TableHead>
            <TableHead>同步时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow key={contact.id}>
              <TableCell>
                {contact.active === false ? (
                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    停用
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    在职
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-medium text-slate-900">{contact.name}</TableCell>
              <TableCell>{contact.mobile || '-'}</TableCell>
              <TableCell>{contact.title || '-'}</TableCell>
              <TableCell className="max-w-64 truncate">{contact.dept_name_list || '-'}</TableCell>
              <TableCell className="font-mono text-xs">{contact.dingtalk_user_id}</TableCell>
              <TableCell className="text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  {formatDateTime(contact.sync_time)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
