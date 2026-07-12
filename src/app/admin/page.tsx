'use client';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdminUser, isSystemAdminUser } from '@/lib/route-permissions';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Plus,
  Key,
  Trash2,
  Loader2,
  AlertTriangle,
  UserCog,
  Clock,
  CheckCircle,
  Lock,
  Eye,
  EyeOff,
  Edit,
  User,
} from 'lucide-react';

interface Admin {
  id: number;
  username: string;
  role: string;
  created_at: string;
  last_login: string | null;
}

interface CurrentUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 新增管理员对话框
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'super_admin'>('admin');
  const [isAdding, setIsAdding] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // 修改密码对话框
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // 删除确认对话框
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingAdmin, setDeletingAdmin] = useState<Admin | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 获取当前用户和管理员列表
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 获取当前用户
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json();
      
      if (meRes.status === 401) {
        toast({ title: '登录已失效', description: '请重新登录', variant: 'error' });
        router.push('/login');
        return;
      }
      
      if (!meData.authenticated || meData.user.role !== 'super_admin') {
        toast({ title: '无访问权限', description: '仅管理员可访问此页面', variant: 'error' });
        router.push('/');
        return;
      }
      
      setCurrentUser(meData.user);

      // 获取管理员列表
      const adminsRes = await fetch('/api/admins');
      
      if (adminsRes.status === 401) {
        toast({ title: '登录已失效', description: '请重新登录', variant: 'error' });
        router.push('/login');
        return;
      }
      
      if (adminsRes.status === 403) {
        const errData = await adminsRes.json().catch(() => ({ error: '无访问权限' }));
        toast({ title: '权限不足', description: errData.error || '无模块访问权限', variant: 'error' });
        setIsLoading(false);
        return;
      }
      
      const adminsData = await adminsRes.json();
      
      if (adminsRes.ok) {
        setAdmins(adminsData.admins || []);
      } else {
        toast({ title: '获取数据失败', description: adminsData.error || '未知错误', variant: 'error' });
      }
    } catch {
      toast({ title: '获取数据失败', description: '网络错误', variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // 新增管理员
  const handleAddAdmin = async () => {
    // 表单验证
    if (!newUsername.trim()) {
      toast({ title: '验证失败', description: '请输入账号', variant: 'error' });
      return;
    }
    if (newUsername.trim().length < 3) {
      toast({ title: '验证失败', description: '账号至少需要3个字符', variant: 'error' });
      return;
    }
    if (!newPassword.trim()) {
      toast({ title: '验证失败', description: '请输入密码', variant: 'error' });
      return;
    }
    if (newPassword.trim().length < 6) {
      toast({ title: '验证失败', description: '密码至少需要6个字符', variant: 'error' });
      return;
    }

    setIsAdding(true);

    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowAddDialog(false);
        setNewUsername('');
        setNewPassword('');
        setNewRole('admin');
        fetchData();
        toast({ title: '创建成功', description: '管理员账号已创建', variant: 'success' });
      } else {
        toast({ title: '创建失败', description: data.error || '操作失败', variant: 'error' });
      }
    } catch {
      toast({ title: '创建失败', description: '网络错误', variant: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  // 修改密码
  const handleUpdatePassword = async () => {
    if (!editPassword.trim()) {
      toast({ title: '验证失败', description: '请输入新密码', variant: 'error' });
      return;
    }
    if (editPassword.trim().length < 6) {
      toast({ title: '验证失败', description: '密码至少需要6个字符', variant: 'error' });
      return;
    }

    if (!editingAdmin) return;

    setIsUpdating(true);

    try {
      const res = await fetch('/api/admins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAdmin.id,
          newPassword: editPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowPasswordDialog(false);
        setEditingAdmin(null);
        setEditPassword('');
        fetchData();
        toast({ title: '修改成功', description: '密码已更新', variant: 'success' });
      } else {
        toast({ title: '修改失败', description: data.error || '操作失败', variant: 'error' });
      }
    } catch {
      toast({ title: '修改失败', description: '网络错误', variant: 'error' });
    } finally {
      setIsUpdating(false);
    }
  };

  // 删除管理员
  const handleDeleteAdmin = async () => {
    if (!deletingAdmin) return;

    // 安全检查：不能删除当前登录的管理员
    if (deletingAdmin.id === currentUser?.id) {
      toast({ title: '操作禁止', description: '不能删除当前登录的账号', variant: 'error' });
      setShowDeleteDialog(false);
      return;
    }

    setIsDeleting(true);

    try {
      const res = await fetch(`/api/admins?id=${deletingAdmin.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (res.ok) {
        setShowDeleteDialog(false);
        setDeletingAdmin(null);
        fetchData();
        toast({ title: '删除成功', description: '管理员账号已删除', variant: 'success' });
      } else {
        toast({ title: '删除失败', description: data.error || '操作失败', variant: 'error' });
      }
    } catch {
      toast({ title: '删除失败', description: '网络错误', variant: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 角色标签
  const getRoleBadge = (role: string) => {
    if (isSuperAdminUser(role) || isSystemAdminUser(role)) {
      return (
        <span 
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ 
            background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
            color: 'white',
          }}
        >
          <Shield className="w-3 h-3" />
          超级管理员
        </span>
      );
    }
    return (
      <span 
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
        style={{ 
          background: '#F2F3F5',
          color: '#4E5969',
        }}
      >
        <UserCog className="w-3 h-3" />
        普通管理员
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#165DFF' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>后台管理</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>
            管理系统管理员账号，只有超级管理员可访问
          </p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium transition-all duration-200"
          style={{ 
            background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
            boxShadow: '0 4px 12px rgba(22, 93, 255, 0.3)',
          }}
        >
          <Plus className="w-4 h-4" />
          新增管理员
        </button>
      </div>

      {/* 管理员列表 */}
      <div 
        className="rounded-2xl overflow-hidden"
        style={{ 
          background: '#FFFFFF',
          border: '1px solid #E5E6EB',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* 表头 */}
        <div 
          className="grid grid-cols-12 gap-4 px-6 py-4 text-sm font-medium"
          style={{ 
            background: '#F7F8FA',
            color: '#4E5969',
            borderBottom: '1px solid #E5E6EB',
          }}
        >
          <div className="col-span-1">ID</div>
          <div className="col-span-3">账号</div>
          <div className="col-span-2">角色</div>
          <div className="col-span-3">创建时间</div>
          <div className="col-span-2">最后登录</div>
          <div className="col-span-1 text-right">操作</div>
        </div>

        {/* 表体 */}
        {admins.length === 0 ? (
          <div className="px-6 py-12 text-center" style={{ color: '#86909C' }}>
            暂无管理员数据
          </div>
        ) : (
          admins.map((admin) => (
            <div
              key={admin.id}
              className="grid grid-cols-12 gap-4 px-6 py-4 text-sm items-center transition-colors hover:bg-gray-50"
              style={{ 
                borderBottom: '1px solid #F2F3F5',
                color: '#1D2129',
              }}
            >
              <div className="col-span-1 font-mono" style={{ color: '#86909C' }}>
                #{admin.id}
              </div>
              <div className="col-span-3 font-medium flex items-center gap-2">
                {admin.username}
                {admin.id === currentUser?.id && (
                  <span 
                    className="px-1.5 py-0.5 rounded text-[10px]"
                    style={{ background: '#E8F3FF', color: '#165DFF' }}
                  >
                    当前
                  </span>
                )}
              </div>
              <div className="col-span-2">
                {getRoleBadge(admin.role)}
              </div>
              <div className="col-span-3 flex items-center gap-1.5" style={{ color: '#86909C' }}>
                <Clock className="w-3.5 h-3.5" />
                {formatDate(admin.created_at)}
              </div>
              <div className="col-span-2 flex items-center gap-1.5" style={{ color: '#86909C' }}>
                {admin.last_login ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                    {formatDate(admin.last_login)}
                  </>
                ) : (
                  <span style={{ color: '#C9CDD4' }}>从未登录</span>
                )}
              </div>
              <div className="col-span-1 flex justify-end gap-1">
                <button
                  onClick={() => {
                    setEditingAdmin(admin);
                    setShowPasswordDialog(true);
                  }}
                  className="p-2 rounded-lg transition-colors hover:bg-blue-50"
                  style={{ color: '#165DFF' }}
                  title="修改密码"
                >
                  <Key className="w-4 h-4" />
                </button>
                {admin.id !== currentUser?.id && (
                  <button
                    onClick={() => {
                      setDeletingAdmin(admin);
                      setShowDeleteDialog(true);
                    }}
                    className="p-2 rounded-lg transition-colors hover:bg-red-50"
                    style={{ color: '#DC2626' }}
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新增管理员对话框 */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddDialog(false)}
          />
          <div 
            className="relative w-full max-w-md rounded-2xl p-6"
            style={{ 
              background: '#FFFFFF',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <h3 className="text-lg font-bold mb-4" style={{ color: '#1D2129' }}>
              新增管理员
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#4E5969' }}>
                  账号 <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="请输入账号（3-50字符）"
                  className="w-full px-4 py-2.5 rounded-xl outline-none transition-all focus:ring-2 focus:ring-blue-500"
                  style={{ 
                    border: '1px solid #E5E6EB',
                    background: '#F7F8FA',
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#4E5969' }}>
                  密码 <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="请输入密码（至少6位）"
                    className="w-full px-4 py-2.5 pr-10 rounded-xl outline-none transition-all focus:ring-2 focus:ring-blue-500"
                    style={{ 
                      border: '1px solid #E5E6EB',
                      background: '#F7F8FA',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#4E5969' }}>
                  角色
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'super_admin')}
                  className="w-full px-4 py-2.5 rounded-xl outline-none transition-all focus:ring-2 focus:ring-blue-500"
                  style={{ 
                    border: '1px solid #E5E6EB',
                    background: '#F7F8FA',
                  }}
                >
                  <option value="admin">普通管理员</option>
                  <option value="super_admin">超级管理员</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-4 py-2.5 rounded-xl font-medium transition-colors"
                style={{ 
                  background: '#F2F3F5',
                  color: '#4E5969',
                }}
              >
                取消
              </button>
              <button
                onClick={handleAddAdmin}
                disabled={isAdding}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium transition-all"
                style={{ 
                  background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
                }}
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改密码对话框 */}
      {showPasswordDialog && editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPasswordDialog(false)}
          />
          <div 
            className="relative w-full max-w-md rounded-2xl p-6"
            style={{ 
              background: '#FFFFFF',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <h3 className="text-lg font-bold mb-2" style={{ color: '#1D2129' }}>
              修改密码
            </h3>
            <p className="text-sm mb-4" style={{ color: '#86909C' }}>
              为账号 <span className="font-medium" style={{ color: '#165DFF' }}>{editingAdmin.username}</span> 设置新密码
            </p>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#4E5969' }}>
                新密码 <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <div className="relative">
                <input
                  type={showEditPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="请输入新密码（至少6位）"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl outline-none transition-all focus:ring-2 focus:ring-blue-500"
                  style={{ 
                    border: '1px solid #E5E6EB',
                    background: '#F7F8FA',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPasswordDialog(false)}
                className="px-4 py-2.5 rounded-xl font-medium transition-colors"
                style={{ 
                  background: '#F2F3F5',
                  color: '#4E5969',
                }}
              >
                取消
              </button>
              <button
                onClick={handleUpdatePassword}
                disabled={isUpdating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium transition-all"
                style={{ 
                  background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
                }}
              >
                {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteDialog && deletingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDeleteDialog(false)}
          />
          <div 
            className="relative w-full max-w-md rounded-2xl p-6"
            style={{ 
              background: '#FFFFFF',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239, 68, 68, 0.1)' }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: '#DC2626' }} />
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: '#1D2129' }}>
                  确认删除
                </h3>
                <p className="text-sm" style={{ color: '#86909C' }}>
                  此操作不可撤销
                </p>
              </div>
            </div>
            <p className="text-sm mb-6" style={{ color: '#4E5969' }}>
              确定要删除管理员账号 <span className="font-medium" style={{ color: '#DC2626' }}>{deletingAdmin.username}</span> 吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2.5 rounded-xl font-medium transition-colors"
                style={{ 
                  background: '#F2F3F5',
                  color: '#4E5969',
                }}
              >
                取消
              </button>
              <button
                onClick={handleDeleteAdmin}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium transition-all"
                style={{ 
                  background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
                }}
              >
                {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
