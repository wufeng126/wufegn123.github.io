'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Archive,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  CreditCard,
  DollarSign,
  FileText,
  Loader2,
  ListTree,
  MapPin,
  ShieldAlert,
  Target,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { isSuperAdminUser } from '@/lib/route-permissions';

interface Project {
  id: number;
  name: string;
  year: number;
  status: string;
  address?: string | null;
  partner?: string | null;
  contract_amount?: string | null;
  building_area?: string | null;
  tax_rate?: number | string | null;
  expected_completion_date?: string | null;
  created_at?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: number | null;
  archive_note?: string | null;
}

interface ProjectStats {
  totalReport?: string;
  totalPayment?: string;
  budgetCost?: string;
  actualCost?: string;
  workItemCount?: number;
  workerCount?: number;
  inServiceCount?: number;
  leftCount?: number;
  totalVisa?: string;
  totalSettlement?: string;
  totalCost?: string;
  totalProfit?: string;
  profitRate?: string;
  receivableAmount?: string;
  totalPayableAmount?: string;
  cashOutAmount?: string;
  netCashFlow?: string;
  fundingGapAmount?: string;
  paymentRate?: string;
}

interface ProjectArchive {
  id: number;
  archived_at?: string | null;
  archived_by?: number | null;
  photo_count?: number | null;
  knowledge_doc_id?: number | null;
  note?: string | null;
  snapshot_data?: {
    constructionLogs?: {
      logCount?: number;
      cleanedPhotoCount?: number;
      totalWorkHours?: number;
    };
    finance?: Record<string, number | string | null | undefined>;
  } | null;
}

const statusStyles: Record<string, string> = {
  在建: 'bg-blue-50 text-blue-700 border-blue-200',
  竣工结算: 'bg-green-50 text-green-700 border-green-200',
  质保期: 'bg-purple-50 text-purple-700 border-purple-200',
  质保期满: 'bg-amber-50 text-amber-700 border-amber-200',
  进行中: 'bg-blue-50 text-blue-700 border-blue-200',
  已完成: 'bg-green-50 text-green-700 border-green-200',
  暂停: 'bg-orange-50 text-orange-700 border-orange-200',
};

function parseAmount(value?: string | null) {
  if (!value) return 0;
  return Number.parseFloat(String(value).replace(/,/g, '')) || 0;
}

function formatCurrency(value?: string | number | null) {
  const amount = typeof value === 'number' ? value : parseAmount(value);
  if (!amount) return '-';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [archives, setArchives] = useState<ProjectArchive[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProject = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '获取项目详情失败');
        }
        setProject(data.project || null);
        setStats(data.stats || null);
        setArchives(data.archives || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '获取项目详情失败');
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        const user = data.user || data.data;
        setIsSuperAdmin(isSuperAdminUser(user?.role, user?.role_id || user?.roleId));
      } catch {
        setIsSuperAdmin(false);
      }
    };

    fetchUser();
  }, []);

  const handleArchiveProject = async () => {
    if (!project || archiving) return;
    const note = window.prompt('请输入归档备注，可留空：');
    if (note === null) return;
    const confirmed = window.confirm('确认归档该项目吗？归档后将清理施工日志照片，且不能再提交施工日志和出勤。');
    if (!confirmed) return;

    setArchiving(true);
    setArchiveError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || '项目归档失败');
      }
      const detailRes = await fetch(`/api/projects/${projectId}`);
      const detailData = await detailRes.json();
      if (detailRes.ok) {
        setProject(detailData.project || null);
        setStats(detailData.stats || null);
        setArchives(detailData.archives || []);
      }
    } catch (err: unknown) {
      setArchiveError(err instanceof Error ? err.message : '项目归档失败');
    } finally {
      setArchiving(false);
    }
  };

  const archiveItems = useMemo(() => {
    if (!project) return [];
    return [
      { label: '项目名称', value: project.name, icon: Building2 },
      { label: '甲方', value: project.partner || '-', icon: FileText },
      { label: '项目地址', value: project.address || '-', icon: MapPin },
      { label: '合同金额', value: formatCurrency(project.contract_amount), icon: DollarSign },
      { label: '年度', value: `${project.year}年`, icon: Calendar },
      { label: '项目状态', value: project.status || '-', icon: Target },
      { label: '建筑面积', value: project.building_area ? `${Number(project.building_area).toLocaleString('zh-CN')} ㎡` : '-', icon: BarChart3 },
      { label: '适用税率', value: project.tax_rate ? `${project.tax_rate}%` : '-', icon: Wallet },
      { label: '预计完工', value: formatDate(project.expected_completion_date), icon: Calendar },
      { label: '建档时间', value: formatDate(project.created_at), icon: FileText },
    ];
  }, [project]);

  const businessEntries = useMemo(() => {
    const encodedProjectId = encodeURIComponent(projectId);
    return [
      {
        title: '报量管理',
        desc: '维护预算工程量、对上报量、对下结算和差异提醒',
        href: `/project-center?tab=quantity-reporting&projectId=${encodedProjectId}`,
        value: `${stats?.workItemCount || 0} 个分项`,
        icon: ListTree,
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-100',
      },
      {
        title: '签证',
        desc: '跟进签证发生、申报和签回情况',
        href: `/project-center?tab=visas&projectId=${encodedProjectId}`,
        value: formatCurrency(stats?.totalVisa),
        icon: FileText,
        color: 'text-orange-700',
        bg: 'bg-orange-50',
        border: 'border-orange-100',
      },
      {
        title: '产值结算',
        desc: '进入月度产值结算和甲方确认记录',
        href: `/project-center?tab=client-reports&project_id=${encodedProjectId}`,
        value: formatCurrency(stats?.totalReport),
        icon: BarChart3,
        color: 'text-cyan-700',
        bg: 'bg-cyan-50',
        border: 'border-cyan-100',
      },
      {
        title: '甲方回款',
        desc: '查看甲方回款记录和待回款金额',
        href: `/project-center?tab=client-payments&project_id=${encodedProjectId}`,
        value: formatCurrency(stats?.totalPayment),
        icon: CreditCard,
        color: 'text-green-700',
        bg: 'bg-green-50',
        border: 'border-green-100',
      },
    ];
  }, [projectId, stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-500">{error || '项目不存在'}</p>
        <Link href="/project-center?tab=projects">
          <Button className="mt-4" variant="outline">返回项目信息</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/project-center?tab=projects">
            <Button variant="outline" size="sm" className="h-9">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              返回
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">{project.name}</h1>
              <Badge className={statusStyles[project.status] || 'bg-gray-50 text-gray-600 border-gray-200'}>
                {project.status || '未设置'}
              </Badge>
              {project.is_archived && (
                <Badge className="border-gray-200 bg-gray-100 text-gray-700">
                  已归档
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {project.partner || '未填写甲方'} · {project.year}年度 · {project.address || '未填写地址'}
            </p>
          </div>
        </div>
        {isSuperAdmin && !project.is_archived && (
          <Button
            variant="outline"
            className="h-9 border-amber-200 text-amber-700 hover:bg-amber-50"
            disabled={archiving}
            onClick={handleArchiveProject}
          >
            {archiving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Archive className="w-4 h-4 mr-1.5" />}
            项目归档
          </Button>
        )}
      </div>

      {archiveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {archiveError}
        </div>
      )}

      {project.is_archived && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">该项目已归档</p>
            <p className="mt-1 text-amber-700">
              归档后施工日志照片已清理，施工日志和出勤不再录入；结算、付款、回款等收尾数据仍可继续维护。
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="py-4">
            <p className="text-sm text-blue-600">合同金额</p>
            <p className="text-xl font-bold text-blue-800 mt-1">{formatCurrency(project.contract_amount)}</p>
          </CardContent>
        </Card>
        <Card className="border-green-100 bg-green-50">
          <CardContent className="py-4">
            <p className="text-sm text-green-600">已回款</p>
            <p className="text-xl font-bold text-green-800 mt-1">{formatCurrency(stats?.totalPayment)}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-100 bg-orange-50">
          <CardContent className="py-4">
            <p className="text-sm text-orange-600">应收未回</p>
            <p className="text-xl font-bold text-orange-800 mt-1">{formatCurrency(stats?.receivableAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">资金净流</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(stats?.netCashFlow)}</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">基础档案详情</h2>
          <p className="text-xs text-gray-500 mt-1">这里仅展示项目档案信息，具体业务数据从下方入口进入对应页面办理。</p>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 divide-y md:divide-y-0">
              {archiveItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-start gap-3 px-5 py-4 border-b md:border-r border-gray-100">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">{item.label}</p>
                      <p className="text-sm font-medium text-gray-900 mt-1 break-words">{item.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">业务办理入口</h2>
          <p className="text-xs text-gray-500 mt-1">详情页只做项目导航，不把工程量、签证、结算和回款明细混在档案页里。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {businessEntries.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link key={entry.title} href={entry.href} className="group block">
                <Card className={`h-full transition-all hover:-translate-y-0.5 hover:shadow-md ${entry.border}`}>
                  <CardContent className="p-4">
                    <div className={`w-10 h-10 rounded-lg ${entry.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${entry.color}`} />
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{entry.title}</h3>
                        <span className={`text-xs font-medium ${entry.color}`}>{entry.value}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 leading-5">{entry.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">归档记录</h2>
          <p className="text-xs text-gray-500 mt-1">项目结束后的归档快照会同步沉淀到知识库，便于后续复盘和资料追溯。</p>
        </div>
        <Card>
          <CardContent className="p-0">
            {archives.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <Archive className="h-9 w-9 text-gray-300" />
                <p className="mt-3 text-sm font-medium text-gray-700">暂无归档记录</p>
                <p className="mt-1 text-xs text-gray-500">项目归档后，这里会显示归档时间、清理照片数量和知识库沉淀入口。</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {archives.map((archive) => {
                  const logs = archive.snapshot_data?.constructionLogs;
                  return (
                    <div key={archive.id} className="p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">项目归档报告 #{archive.id}</h3>
                            <Badge className="border-green-200 bg-green-50 text-green-700">已生成快照</Badge>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">归档时间：{formatDateTime(archive.archived_at)}</p>
                          {archive.note && (
                            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700">{archive.note}</p>
                          )}
                        </div>
                        {archive.knowledge_doc_id && (
                          <Link href={`/knowledge/${archive.knowledge_doc_id}`}>
                            <Button variant="outline" size="sm" className="h-9">
                              <BookOpen className="mr-1.5 h-4 w-4" />
                              查看知识库沉淀
                            </Button>
                          </Link>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-lg bg-blue-50 px-3 py-3">
                          <p className="text-xs text-blue-600">施工日志</p>
                          <p className="mt-1 text-lg font-semibold text-blue-800">{logs?.logCount || 0} 篇</p>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-3 py-3">
                          <p className="text-xs text-amber-600">已清理照片</p>
                          <p className="mt-1 text-lg font-semibold text-amber-800">{archive.photo_count || logs?.cleanedPhotoCount || 0} 张</p>
                        </div>
                        <div className="rounded-lg bg-green-50 px-3 py-3">
                          <p className="text-xs text-green-600">出勤总工时</p>
                          <p className="mt-1 text-lg font-semibold text-green-800">{Number(logs?.totalWorkHours || 0).toLocaleString('zh-CN')} 小时</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
