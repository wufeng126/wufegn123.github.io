'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  BellRing,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  RefreshCw,
  Settings,
  Send,
  Trash2,
  CheckCheck,
  FileText,
  DollarSign,
  Users,
  TrendingDown,
  CreditCard,
  ChevronRight,
  X,
  Save,
  TestTube,
  Zap,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import Link from 'next/link';

// 类型定义
interface Notification {
  id: number;
  type: string;
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'danger';
  priority: number; // 0=普通, 1=重要, 2=紧急
  project_id: number | null;
  related_id: number | null;
  related_type: string | null;
  is_read: boolean;
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface Stats {
  total: number;
  unread: number;
  today: number;
  danger: number;
  warning: number;
  info: number;
}

interface Settings {
  [key: string]: {
    value: string;
    enabled: boolean;
    description: string;
  };
}

const notificationRules = [
  {
    settingKey: 'new_record_reminder_enabled',
    title: '月度分析流转',
    target: '当前流程节点负责人',
    channel: '站内待办 + 钉钉个人工作通知',
    detail: '预算员提交给手动选择的项目经理；项目经理确认后返回原预算员；预算员再选择老板。',
  },
  {
    settingKey: 'visa_reminder_enabled',
    title: '签证办理流转',
    target: '项目经理 / 原发起预算员',
    channel: '站内待办 + 钉钉个人工作通知',
    detail: '预算员发起后推给项目经理；项目经理完成线下签字后推回预算员确认计入结算。',
  },
  {
    settingKey: 'visa_reminder_enabled',
    title: '签证超期推进',
    target: '当前负责人',
    channel: '站内待办 + 钉钉个人工作通知',
    detail: '超过 7 天未进入下一状态时，只提醒当前负责推进的人。',
  },
  {
    settingKey: 'cost_warning_enabled',
    title: '施工日志风险',
    target: '项目绑定预算员',
    channel: '站内待办 + 钉钉个人工作通知',
    detail: '按项目身份中的预算员接收，不因超级管理员可看全部项目而默认接收全部提醒。',
  },
  {
    settingKey: 'new_record_reminder_enabled',
    title: '项目日报汇总',
    target: '公司广播',
    channel: '站内通知 + 钉钉群机器人',
    detail: '用于每日 12 点后自动汇总推送；后续可再缩小为项目相关人员。',
  },
  {
    settingKey: 'salary_reminder_enabled',
    title: '工资核算/发放',
    target: '相关项目预算员、财务或流程负责人',
    channel: '站内待办 + 钉钉个人工作通知',
    detail: '工资类提醒不发群，避免工资信息扩散。',
  },
  {
    settingKey: 'supplier_payment_reminder_enabled',
    title: '供应商付款/结算',
    target: '相关业务负责人',
    channel: '站内待办 + 钉钉个人工作通知',
    detail: '供应商付款和结算按业务记录接收人推送。',
  },
  {
    settingKey: 'dingtalk_robot_broadcast_enabled',
    title: '公司级广播',
    target: '钉钉群',
    channel: '钉钉群机器人',
    detail: '仅用于日报汇总、系统公告这类适合公开广播的消息。',
  },
];

// 获取通知图标
function getNotificationIcon(type: string, severity: string) {
  if (type.includes('certificate')) {
    return severity === 'danger' ? 
      <AlertCircle className="w-5 h-5 text-red-500" /> : 
      <Clock className="w-5 h-5 text-orange-500" />;
  }
  if (type.includes('visa')) {
    return <FileText className="w-5 h-5 text-orange-500" />;
  }
  if (type === 'new_report') {
    return <FileText className="w-5 h-5 text-blue-500" />;
  }
  if (type === 'new_payment') {
    return <DollarSign className="w-5 h-5 text-green-500" />;
  }
  if (type === 'new_worker') {
    return <Users className="w-5 h-5 text-blue-500" />;
  }
  if (type === 'cost_warning') {
    return <TrendingDown className="w-5 h-5 text-red-500" />;
  }
  if (type === 'new_settlement') {
    return <FileText className="w-5 h-5 text-purple-500" />;
  }
  if (type === 'new_worker_payment') {
    return <CreditCard className="w-5 h-5 text-green-500" />;
  }
  if (type === 'new_worker_salary') {
    return <DollarSign className="w-5 h-5 text-blue-500" />;
  }
  if (type === 'new_client_payment') {
    return <DollarSign className="w-5 h-5 text-emerald-500" />;
  }
  if (type === 'new_supplier_payment') {
    return <CreditCard className="w-5 h-5 text-orange-500" />;
  }
  return <Bell className="w-5 h-5 text-gray-500" />;
}

// 获取严重程度样式
function getSeverityStyle(severity: string) {
  switch (severity) {
    case 'danger':
      return { bg: '#FFECE8', border: '#F53F3F', color: '#F53F3F' };
    case 'warning':
      return { bg: '#FFF7E8', border: '#FF7D00', color: '#FF7D00' };
    default:
      return { bg: '#E8F3FF', border: '#165DFF', color: '#165DFF' };
  }
}

// 格式化时间
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, unread: 0, today: 0, danger: 0, warning: 0, info: 0 });
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [dingtalkSecret, setDingtalkSecret] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testingWorkNotice, setTestingWorkNotice] = useState(false);
  const [checking, setChecking] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (activeTab === 'unread') params.append('isRead', 'false');
      if (activeTab === 'danger') params.append('type', 'danger');
      params.append('page', page.toString());
      params.append('pageSize', '20');

      const res = await fetch(`/api/notifications?${params}`);
      const data = await res.json();
      setNotifications(data.notifications || []);
      setStats(data.stats || { total: 0, unread: 0, today: 0, danger: 0, warning: 0, info: 0 });
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/notifications/settings');
      const data = await res.json();
      setSettings(data.settings || {});
      setWebhookUrl(data.settings?.dingtalk_webhook?.value || '');
      setDingtalkSecret(data.settings?.dingtalk_secret?.value || '');
    } catch (error) {
      console.error('获取设置失败:', error);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchData();
      fetchSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, page]);

  // 标记已读
  const markAsRead = async (id: number) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchData();
    } catch (error) {
      toast({ title: '操作失败', description: '无法标记已读', variant: 'error' });
    }
  };

  // 全部标记已读
  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      fetchData();
      toast({ title: '成功', description: '已全部标记为已读', variant: 'success' });
    } catch (error) {
      toast({ title: '操作失败', description: '无法标记已读', variant: 'error' });
    }
  };

  // 删除通知
  const deleteNotification = async (id: number) => {
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  // 保存Webhook设置
  const saveWebhook = async () => {
    try {
      const webhookRes = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'dingtalk_webhook', value: webhookUrl.trim() }),
      });
      const webhookData = await webhookRes.json().catch(() => ({}));
      if (!webhookRes.ok) {
        throw new Error(webhookData.error || 'Webhook 保存失败');
      }

      const secretRes = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'dingtalk_secret', value: dingtalkSecret.trim() }),
      });
      const secretData = await secretRes.json().catch(() => ({}));
      if (!secretRes.ok) {
        throw new Error(secretData.error || '加签密钥保存失败');
      }

      toast({ title: '保存成功', description: '钉钉配置已更新', variant: 'success' });
      fetchSettings();
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'error',
      });
    }
  };

  // 测试Webhook
  const testWebhook = async () => {
    setTestingWebhook(true);
    try {
      const res = await fetch('/api/notifications/dingtalk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '测试成功', description: '钉钉消息已发送，请检查群消息', variant: 'success' });
      } else {
        toast({ title: '测试失败', description: data.error || '发送失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '测试失败', description: '网络错误', variant: 'error' });
    } finally {
      setTestingWebhook(false);
    }
  };

  // 测试钉钉个人工作通知
  const testWorkNotice = async () => {
    setTestingWorkNotice(true);
    try {
      const res = await fetch('/api/notifications/dingtalk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, channel: 'work' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '测试成功', description: '钉钉个人工作通知已发送', variant: 'success' });
      } else {
        toast({ title: '测试失败', description: data.error || '发送失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '测试失败', description: '网络错误', variant: 'error' });
    } finally {
      setTestingWorkNotice(false);
    }
  };

  // 执行检测
  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/notifications/check?force=true');
      const data = await res.json();
      if (data.success) {
        toast({
          title: '检测完成',
          description: `发现 ${data.totalNotifications} 条新通知`,
          variant: 'success',
        });
        fetchData();
      }
    } catch (error) {
      toast({ title: '检测失败', variant: 'error' });
    } finally {
      setChecking(false);
    }
  };

  // 切换通知开关
  const toggleSetting = async (key: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '设置保存失败');
      }
      fetchSettings();
    } catch (error) {
      toast({
        title: '设置失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'error',
      });
    }
  };

  // 获取跳转链接
  const getLink = (notification: Notification): string => {
    const { type, project_id, related_id } = notification;
    if (type.includes('certificate')) return '/certificates';
    if (type.includes('visa')) return '/visas';
    if (type === 'new_report') return '/client-reports';
    if (type === 'new_payment') return '/client-payments';
    if (type === 'new_worker') return '/workers/roster';
    if (type === 'cost_warning') return '/cost-center';
    if (type === 'new_settlement') return '/data-board/supplier-cost';
    if (type === 'new_worker_payment') return '/workers/payments';
    if (type === 'new_worker_salary') return '/workers/salaries';
    if (type === 'new_client_payment') return '/client-payments';
    if (type === 'new_supplier_payment') return '/data-board/supplier-cost';
    return '/notifications';
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>消息通知中心</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>自动化通知管理 · 钉钉消息推送</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" />
            设置
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runCheck}
            disabled={checking}
            className="flex items-center gap-1.5"
          >
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            立即检测
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>今日通知</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#1D2129' }}>{stats.today}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F3FF' }}>
                <Bell className="w-5 h-5" style={{ color: '#165DFF' }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all cursor-pointer" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }} onClick={() => setActiveTab('unread')}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>未读消息</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#165DFF' }}>{stats.unread}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F3FF' }}>
                <BellRing className="w-5 h-5" style={{ color: '#165DFF' }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>预警消息</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#FF7D00' }}>{stats.warning + stats.danger}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7E8' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#FF7D00' }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>已推送钉钉</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#00B42A' }}>
                  {notifications.filter(n => n.is_sent).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8FFEA' }}>
                <Send className="w-5 h-5" style={{ color: '#00B42A' }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
              <Settings className="w-4 h-4" style={{ color: '#165DFF' }} />
              通知设置
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* 钉钉Webhook设置 */}
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: '#1D2129' }}>钉钉群机器人 Webhook</label>
              <div className="flex gap-2">
                <Input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
                  className="flex-1"
                />
                <Button variant="outline" onClick={saveWebhook} className="flex items-center gap-1">
                  <Save className="w-4 h-4" />
                  保存
                </Button>
                <Button 
                  variant="outline" 
                  onClick={testWebhook} 
                  disabled={testingWebhook || !webhookUrl}
                  className="flex items-center gap-1"
                >
                  <TestTube className="w-4 h-4" />
                  测试
                </Button>
                <Button
                  variant="outline"
                  onClick={testWorkNotice}
                  disabled={testingWorkNotice}
                  className="flex items-center gap-1"
                >
                  {testingWorkNotice ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  测试个人
                </Button>
              </div>
              <p className="text-xs" style={{ color: '#86909C' }}>
                群机器人用于群内广播；个人工作通知使用钉钉企业内部应用配置，按接收人推送到对应钉钉账号
              </p>
              <label className="text-sm font-medium mt-3 block" style={{ color: '#1D2129' }}>钉钉机器人加签密钥 (Secret)</label>
              <div className="flex gap-2">
                <Input
                  value={dingtalkSecret}
                  onChange={(e) => setDingtalkSecret(e.target.value)}
                  placeholder="SEC..."
                  className="flex-1"
                  type="password"
                />
              </div>
              <p className="text-xs" style={{ color: '#86909C' }}>
                创建机器人时选择“加签”安全设置，获取SEC开头的密钥
              </p>
            </div>

            {/* 通知开关 */}
            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium" style={{ color: '#1D2129' }}>通知开关</p>
              {[
                { key: 'dingtalk_enabled', label: '钉钉消息推送', desc: '开启后将通过钉钉发送通知消息' },
                { key: 'dingtalk_robot_broadcast_enabled', label: '群机器人广播', desc: '仅用于项目日报汇总、系统公告等公司级广播' },
                { key: 'certificate_reminder_enabled', label: '证件到期提醒', desc: '证件即将到期时发送钉钉通知' },
                { key: 'visa_reminder_enabled', label: '签证流程提醒', desc: '签证提交、推进、超期和预算员确认时发送提醒' },
                { key: 'settlement_reminder_enabled', label: '结算单提醒', desc: '新增结算单时发送钉钉通知' },
                { key: 'new_record_reminder_enabled', label: '业务流转提醒', desc: '新增记录、月度分析、日报汇总等业务节点通知' },
                { key: 'salary_reminder_enabled', label: '工资发放提醒', desc: '新增工资发放记录时发送钉钉通知' },
                { key: 'payment_warning_enabled', label: '应付款预警', desc: '应付款到期、超期欠款时发送预警' },
                { key: 'cost_warning_enabled', label: '成本预警', desc: '成本超支或利润为负时发送预警' },
                { key: 'client_payment_reminder_enabled', label: '甲方回款提醒', desc: '新增甲方回款时发送钉钉通知' },
                { key: 'supplier_payment_reminder_enabled', label: '供应商付款提醒', desc: '新增供应商付款时发送钉钉通知' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#F7F8FA' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1D2129' }}>{item.label}</p>
                    <p className="text-xs" style={{ color: '#86909C' }}>{item.desc}</p>
                  </div>
                  <Switch
                    checked={settings[item.key]?.enabled ?? false}
                    onCheckedChange={(checked) => toggleSetting(item.key, checked)}
                    className="data-[state=checked]:bg-blue-500"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <p className="text-sm font-medium" style={{ color: '#1D2129' }}>消息推送规则台账</p>
                <p className="mt-1 text-xs" style={{ color: '#86909C' }}>
                  这里展示“哪些消息推给哪些人”。待办类消息按项目身份或流程负责人精准推送；群机器人只做公司级广播。
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {notificationRules.map((rule) => {
                  const enabled = settings[rule.settingKey]?.enabled ?? true;
                  return (
                    <div key={`${rule.settingKey}-${rule.title}`} className="rounded-lg border p-3" style={{ borderColor: '#E5E6EB', background: '#FFFFFF' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#1D2129' }}>{rule.title}</p>
                          <p className="mt-1 text-xs" style={{ color: '#4E5969' }}>接收对象：{rule.target}</p>
                        </div>
                        <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? '已启用' : '已停用'}</Badge>
                      </div>
                      <div className="mt-3 rounded-md px-3 py-2 text-xs" style={{ background: '#F7F8FA', color: '#4E5969' }}>
                        推送通道：{rule.channel}
                      </div>
                      <p className="mt-2 text-xs leading-5" style={{ color: '#86909C' }}>{rule.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 消息列表 */}
      <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
        <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
          <div className="flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="unread">未读 {stats.unread > 0 && `(${stats.unread})`}</TabsTrigger>
                <TabsTrigger value="danger">预警</TabsTrigger>
              </TabsList>
            </Tabs>
            {stats.unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs">
                <CheckCheck className="w-4 h-4 mr-1" />
                全部已读
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin" style={{ color: '#165DFF' }} />
              <p className="mt-2 text-sm" style={{ color: '#86909C' }}>加载中...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="w-12 h-12 mx-auto" style={{ color: '#C9CDD4' }} />
              <p className="mt-2 text-sm" style={{ color: '#86909C' }}>暂无通知</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#E5E6EB' }}>
              {notifications.map((notification) => {
                const severityStyle = getSeverityStyle(notification.severity);
                return (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors ${
                      !notification.is_read ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    {/* 图标 */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type, notification.severity)}
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#1D2129' }}>
                            {notification.title}
                            {!notification.is_read && (
                              <Badge variant="secondary" className="ml-2 text-xs">新</Badge>
                            )}
                            {notification.priority === 2 && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">紧急</span>
                            )}
                            {notification.priority === 1 && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">重要</span>
                            )}
                          </p>
                          <p className="text-sm mt-1 whitespace-pre-line" style={{ color: '#4E5969' }}>
                            {notification.content}
                          </p>
                        </div>
                        <span className="text-xs whitespace-nowrap" style={{ color: '#86909C' }}>
                          {formatTime(notification.created_at)}
                        </span>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2 mt-2">
                        <Link
                          href={getLink(notification)}
                          className="text-xs flex items-center gap-1 hover:underline"
                          style={{ color: '#165DFF' }}
                        >
                          查看详情 <ChevronRight className="w-3 h-3" />
                        </Link>
                        {!notification.is_read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="text-xs px-2 py-0.5 rounded hover:bg-gray-100"
                            style={{ color: '#86909C' }}
                          >
                            标记已读
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(notification.id)}
                          className="text-xs px-2 py-0.5 rounded hover:bg-gray-100"
                          style={{ color: '#F53F3F' }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4 border-t" style={{ borderColor: '#E5E6EB' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <span className="text-sm" style={{ color: '#86909C' }}>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
