'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Link2, Unlink, UserSearch, RefreshCw, Users, Phone, Clock,
  AlertTriangle, CheckCircle2, XCircle, Search, UserCheck, UserX,
} from 'lucide-react';

interface BoundUser {
  id: number;
  userId?: number;
  username: string;
  name: string;
  role: string;
  role_names?: string;
  project_count?: number;
  projectNames?: string[];
  dingtalk_user_id?: string;
  dingtalkUserId?: string;
  dingtalk_name?: string;
  dingtalkName?: string;
  dingtalk_mobile?: string;
  dingtalkMobile?: string;
  dingtalk_dept_id?: string;
  dingtalkDept?: string;
  lastSyncAt?: string | null;
  last_dingtalk_sync_at?: string | null;
  isDisabled?: boolean;
  is_disabled?: boolean;
  dingtalkActive?: boolean;
  dingtalk_active?: boolean;
}

interface UnboundUser {
  id: number;
  username: string;
  name: string;
  role?: string;
  role_names?: string;
  project_count?: number;
  projectNames?: string[];
}

interface DingtalkContact {
  id: number;
  dingtalkUserId: string;
  name: string;
  mobile: string | null;
  deptName: string | null;
  active: boolean;
  bound: boolean;
  syncTime: string;
}

interface BindingLog {
  id: number;
  operationType: string;
  userId: number | null;
  username: string | null;
  dingtalkUserId: string | null;
  dingtalkName: string | null;
  details: string;
  createdAt: string;
}

export default function DingtalkBindingPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('bound');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 数据
  const [boundUsers, setBoundUsers] = useState<BoundUser[]>([]);
  const [unboundUsers, setUnboundUsers] = useState<UnboundUser[]>([]);
  const [contacts, setContacts] = useState<DingtalkContact[]>([]);
  const [bindingLogs, setBindingLogs] = useState<BindingLog[]>([]);

  // 搜索
  const [boundSearch, setBoundSearch] = useState('');
  const [unboundSearch, setUnboundSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');

  // 绑定对话框
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [selectedDingtalkUser, setSelectedDingtalkUser] = useState<DingtalkContact | null>(null);
  const [selectedSystemUserId, setSelectedSystemUserId] = useState<string>('');
  const [binding, setBinding] = useState(false);

  // 解绑对话框
  const [unbindDialogOpen, setUnbindDialogOpen] = useState(false);
  const [unbindingUser, setUnbindingUser] = useState<BoundUser | null>(null);
  const [unbinding, setUnbinding] = useState(false);

  // 同步状态
  const [syncStatus, setSyncStatus] = useState<{ total: number; active: number; lastSyncTime: string | null } | null>(null);

  const fetchBoundUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dingtalk/bindings?tab=bound');
      const data = await res.json();
      if (data.success) setBoundUsers(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchUnboundUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dingtalk/bindings?tab=unbound_users');
      const data = await res.json();
      if (data.success) setUnboundUsers(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dingtalk/bindings?tab=unbound_dingtalk');
      const data = await res.json();
      if (data.success) setContacts(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchBindingLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dingtalk/bindings?tab=logs');
      const data = await res.json();
      if (data.success) setBindingLogs(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/dingtalk/contacts?status=true');
      const data = await res.json();
      if (data.success && data.data) {
        setSyncStatus({
          total: data.data.totalContacts || 0,
          active: data.data.activeContacts || 0,
          lastSyncTime: data.data.lastSyncTime || null,
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchBoundUsers();
    fetchUnboundUsers();
    fetchSyncStatus();
  }, [fetchBoundUsers, fetchUnboundUsers, fetchSyncStatus]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'bound') fetchBoundUsers();
    else if (tab === 'unbound') fetchUnboundUsers();
    else if (tab === 'contacts') fetchContacts();
    else if (tab === 'logs') fetchBindingLogs();
  };

  const handleSyncContacts = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/dingtalk/contacts/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast({ title: '同步成功', description: `已同步 ${data.data.userCount} 人` });
        fetchSyncStatus();
        if (activeTab === 'contacts') fetchContacts();
      } else {
        toast({ title: '同步失败', description: data.error, variant: 'error' });
      }
    } catch {
      toast({ title: '同步失败', description: '网络错误', variant: 'error' });
    }
    setSyncing(false);
  };

  const handleAutoMatch = async () => {
    setBinding(true);
    try {
      const res = await fetch('/api/dingtalk/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_match' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '自动匹配完成', description: `成功绑定 ${data.data.matched} 个用户` });
        fetchBoundUsers();
        fetchUnboundUsers();
        if (activeTab === 'contacts') fetchContacts();
      } else {
        toast({ title: '自动匹配失败', description: data.error, variant: 'error' });
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'error' });
    }
    setBinding(false);
  };

  const handleManualBind = async () => {
    if (!selectedDingtalkUser || !selectedSystemUserId) {
      toast({ title: '请选择', description: '请选择系统用户和钉钉人员', variant: 'error' });
      return;
    }
    setBinding(true);
    try {
      const res = await fetch('/api/dingtalk/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bind',
          userId: parseInt(selectedSystemUserId),
          dingtalkUserId: selectedDingtalkUser.dingtalkUserId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '绑定成功' });
        setBindDialogOpen(false);
        setSelectedDingtalkUser(null);
        setSelectedSystemUserId('');
        fetchBoundUsers();
        fetchUnboundUsers();
        if (activeTab === 'contacts') fetchContacts();
      } else {
        toast({ title: '绑定失败', description: data.error, variant: 'error' });
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'error' });
    }
    setBinding(false);
  };

  const handleUnbind = async () => {
    if (!unbindingUser) return;
    setUnbinding(true);
    try {
      const res = await fetch('/api/dingtalk/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unbind',
          userId: unbindingUser.id || unbindingUser.userId,
          dingtalkUserId: unbindingUser.dingtalk_user_id || unbindingUser.dingtalkUserId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '解绑成功', description: '已解除绑定，历史数据不受影响' });
        setUnbindDialogOpen(false);
        setUnbindingUser(null);
        fetchBoundUsers();
        if (activeTab === 'unbound') fetchUnboundUsers();
        if (activeTab === 'contacts') fetchContacts();
      } else {
        toast({ title: '解绑失败', description: data.error, variant: 'error' });
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'error' });
    }
    setUnbinding(false);
  };

  const handleToggleDisable = async (user: BoundUser, disable: boolean) => {
    try {
      const res = await fetch('/api/dingtalk/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: disable ? 'disable' : 'enable', userId: user.id || user.userId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: disable ? '已禁用' : '已启用', description: disable ? '该用户已被禁用登录' : '该用户已恢复登录权限' });
        fetchBoundUsers();
      } else {
        toast({ title: '操作失败', description: data.error, variant: 'error' });
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'error' });
    }
  };

  const filteredBoundUsers = boundUsers.filter(u =>
    !boundSearch || u.name.includes(boundSearch) || u.username.includes(boundSearch) ||
    (u.dingtalk_name || u.dingtalkName || '').includes(boundSearch) || (u.dingtalk_mobile || u.dingtalkMobile || '').includes(boundSearch)
  );

  const filteredUnboundUsers = unboundUsers.filter(u =>
    !unboundSearch || u.name.includes(unboundSearch) || u.username.includes(unboundSearch)
  );

  const filteredContacts = contacts.filter(c =>
    !contactSearch || c.name.includes(contactSearch) || c.mobile?.includes(contactSearch) || c.dingtalkUserId.includes(contactSearch)
  );

  const filteredLogs = bindingLogs.filter(l =>
    !logSearch || l.username?.includes(logSearch) || l.dingtalkName?.includes(logSearch) || l.operationType.includes(logSearch) || l.details?.includes(logSearch)
  );

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">钉钉通讯录绑定</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理系统用户与钉钉账号的绑定关系
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncStatus && (
            <Badge variant="outline" className="text-xs">
              <Users className="w-3 h-3 mr-1" />
              通讯录 {syncStatus.active}/{syncStatus.total} 人
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleSyncContacts} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '同步中...' : '同步通讯录'}
          </Button>
          <Button size="sm" onClick={handleAutoMatch} disabled={binding}>
            <UserSearch className="w-4 h-4 mr-1" />
            手机号自动匹配
          </Button>
        </div>
      </div>

      {/* 选项卡 */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="bound">已绑定用户</TabsTrigger>
          <TabsTrigger value="unbound">未绑定系统用户</TabsTrigger>
          <TabsTrigger value="contacts">钉钉通讯录人员</TabsTrigger>
          <TabsTrigger value="logs">绑定日志</TabsTrigger>
        </TabsList>

        {/* 已绑定用户 */}
        <TabsContent value="bound">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">已绑定用户 ({filteredBoundUsers.length})</CardTitle>
                <div className="relative w-60">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索姓名/用户名/手机号..."
                    className="pl-9 h-9"
                    value={boundSearch}
                    onChange={e => setBoundSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredBoundUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {loading ? '加载中...' : '暂无已绑定用户'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>系统用户</TableHead>
                      <TableHead>钉钉手机号</TableHead>
                      <TableHead>系统角色</TableHead>
                      <TableHead>项目权限</TableHead>
                      <TableHead>钉钉姓名</TableHead>
                      <TableHead>钉钉部门</TableHead>
                      <TableHead>钉钉userId</TableHead>
                      <TableHead>账号状态</TableHead>
                      <TableHead>最后同步</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBoundUsers.map(u => {
                      const uid = u.id || u.userId;
                      const mobile = u.dingtalk_mobile || u.dingtalkMobile || '-';
                      const roleName = u.role_names || u.role || '-';
                      const projCount = u.project_count ?? (u.projectNames?.length ?? 0);
                      const dtName = u.dingtalk_name || u.dingtalkName || '-';
                      const dtDept = u.dingtalk_dept_id || u.dingtalkDept || '-';
                      const dtUserId = u.dingtalk_user_id || u.dingtalkUserId || '-';
                      const disabled = u.is_disabled || u.isDisabled;
                      const dtActive = u.dingtalk_active ?? u.dingtalkActive ?? true;
                      const lastSync = u.last_dingtalk_sync_at || u.lastSyncAt;
                      return (
                      <TableRow key={uid}>
                        <TableCell className="font-medium">{u.name || u.username}</TableCell>
                        <TableCell>{mobile}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{roleName}</Badge>
                        </TableCell>
                        <TableCell className="max-w-32 truncate">
                          {projCount > 0 ? `${projCount} 个项目` : '-'}
                        </TableCell>
                        <TableCell>{dtName}</TableCell>
                        <TableCell>{dtDept}</TableCell>
                        <TableCell className="text-xs font-mono">{dtUserId}</TableCell>
                        <TableCell>
                          {disabled ? (
                            <Badge variant="destructive">已禁用</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-green-100 text-green-700">正常</Badge>
                          )}
                          {!dtActive && dtUserId !== '-' && (
                            <Badge variant="outline" className="ml-1 text-orange-600 border-orange-300">钉钉离职</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lastSync ? new Date(lastSync).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {disabled ? (
                              <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700" onClick={() => handleToggleDisable(u, false)}>
                                <UserCheck className="w-4 h-4 mr-1" />启用
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="text-orange-600 hover:text-orange-700" onClick={() => handleToggleDisable(u, true)}>
                                <UserX className="w-4 h-4 mr-1" />禁用
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => { setUnbindingUser(u); setUnbindDialogOpen(true); }}
                            >
                              <Unlink className="w-4 h-4 mr-1" />解绑
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ); })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 未绑定系统用户 */}
        <TabsContent value="unbound">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">未绑定系统用户 ({filteredUnboundUsers.length})</CardTitle>
                <div className="relative w-60">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索姓名/用户名/手机号..."
                    className="pl-9 h-9"
                    value={unboundSearch}
                    onChange={e => setUnboundSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredUnboundUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {loading ? '加载中...' : '所有系统用户均已绑定钉钉账号'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>系统用户</TableHead>
                      <TableHead>用户名</TableHead>
                      <TableHead>系统角色</TableHead>
                      <TableHead>项目权限</TableHead>
                      <TableHead>绑定状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUnboundUsers.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name || u.username}</TableCell>
                        <TableCell>{u.username || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{u.role_names || u.role || '未分配'}</Badge>
                        </TableCell>
                        <TableCell>
                          {(u.project_count ?? (u.projectNames?.length ?? 0)) > 0 ? `${u.project_count ?? u.projectNames!.length} 个项目` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-muted-foreground">
                            <XCircle className="w-3 h-3 mr-1" />未绑定
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedSystemUserId(String(u.id));
                              fetchUnboundUsers();
                              setBindDialogOpen(true);
                            }}
                          >
                            <Link2 className="w-4 h-4 mr-1" />手动绑定
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 钉钉通讯录人员 */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">钉钉通讯录人员 ({filteredContacts.length})</CardTitle>
                <div className="relative w-60">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索姓名/手机号/userId..."
                    className="pl-9 h-9"
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredContacts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {loading ? '加载中...' : '暂无通讯录数据，请先同步通讯录'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>钉钉姓名</TableHead>
                      <TableHead>手机号</TableHead>
                      <TableHead>部门</TableHead>
                      <TableHead>钉钉userId</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>绑定状态</TableHead>
                      <TableHead>同步时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.mobile || '-'}</TableCell>
                        <TableCell>{c.deptName || '-'}</TableCell>
                        <TableCell className="text-xs font-mono">{c.dingtalkUserId}</TableCell>
                        <TableCell>
                          <Badge variant={c.active ? 'default' : 'secondary'}>
                            {c.active ? '在职' : '离职'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {c.bound ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle2 className="w-3 h-3 mr-1" />已绑定
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <XCircle className="w-3 h-3 mr-1" />未绑定
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(c.syncTime).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {!c.bound && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedDingtalkUser(c);
                                setSelectedSystemUserId('');
                                fetchUnboundUsers();
                                setBindDialogOpen(true);
                              }}
                            >
                              <Link2 className="w-4 h-4 mr-1" />绑定
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 绑定日志 */}
        <TabsContent value="logs">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">绑定日志</CardTitle>
                <div className="relative w-60">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索用户/操作/详情..."
                    className="pl-9 h-9"
                    value={logSearch}
                    onChange={e => setLogSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {loading ? '加载中...' : '暂无绑定日志'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>操作类型</TableHead>
                      <TableHead>系统用户</TableHead>
                      <TableHead>钉钉用户</TableHead>
                      <TableHead>详情</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(l.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              l.operationType === 'unbind' ? 'destructive' :
                              l.operationType === 'bind_auto' ? 'secondary' : 'default'
                            }
                          >
                            {l.operationType === 'bind_auto' ? '自动绑定' :
                             l.operationType === 'bind_manual' ? '手动绑定' :
                             l.operationType === 'unbind' ? '解绑' : l.operationType}
                          </Badge>
                        </TableCell>
                        <TableCell>{l.username || '-'}</TableCell>
                        <TableCell>{l.dingtalkName || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={l.details}>
                          {l.details || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 手动绑定对话框 */}
      <Dialog open={bindDialogOpen} onOpenChange={setBindDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>手动绑定钉钉账号</DialogTitle>
            <DialogDescription>选择系统用户和钉钉人员进行一对一绑定</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 钉钉人员 */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">钉钉人员</label>
              {selectedDingtalkUser ? (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <div className="font-medium">{selectedDingtalkUser.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedDingtalkUser.mobile && <span><Phone className="w-3 h-3 inline mr-1" />{selectedDingtalkUser.mobile}</span>}
                      {selectedDingtalkUser.deptName && <span className="ml-2">{selectedDingtalkUser.deptName}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDingtalkUser(null)}>更换</Button>
                </div>
              ) : (
                <Select value="" onValueChange={v => {
                  const c = contacts.find(c => c.dingtalkUserId === v);
                  if (c) setSelectedDingtalkUser(c);
                }}>
                  <SelectTrigger><SelectValue placeholder="选择钉钉人员" /></SelectTrigger>
                  <SelectContent>
                    {contacts.filter(c => !c.bound && c.active).map(c => (
                      <SelectItem key={c.dingtalkUserId} value={c.dingtalkUserId}>
                        {c.name} {c.mobile ? `(${c.mobile})` : ''} {c.deptName ? `- ${c.deptName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 系统用户 */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">系统用户</label>
              <Select value={selectedSystemUserId} onValueChange={setSelectedSystemUserId}>
                <SelectTrigger><SelectValue placeholder="选择系统用户" /></SelectTrigger>
                <SelectContent>
                  {unboundUsers.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name || u.username} - {u.role_names || u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 校验提示 */}
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p>一个系统用户只能绑定一个钉钉账号，一个钉钉账号只能绑定一个系统用户。</p>
                <p>绑定后该用户可通过钉钉免登方式登录系统。</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindDialogOpen(false)}>取消</Button>
            <Button onClick={handleManualBind} disabled={binding || (!selectedDingtalkUser && !selectedSystemUserId) || (!selectedDingtalkUser || !selectedSystemUserId)}>
              {binding ? '绑定中...' : '确认绑定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 解绑确认对话框 */}
      <Dialog open={unbindDialogOpen} onOpenChange={setUnbindDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认解绑</DialogTitle>
            <DialogDescription>解除系统用户与钉钉账号的绑定关系</DialogDescription>
          </DialogHeader>
          {unbindingUser && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">系统用户</span>
                  <span className="font-medium">{unbindingUser.name || unbindingUser.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">钉钉账号</span>
                  <span className="font-medium">{unbindingUser.dingtalk_name || unbindingUser.dingtalkName}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-200 rounded-lg text-sm">
                <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>解绑不会删除历史业务数据，该用户将无法通过钉钉免登方式登录。</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnbindDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleUnbind} disabled={unbinding}>
              {unbinding ? '解绑中...' : '确认解绑'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
