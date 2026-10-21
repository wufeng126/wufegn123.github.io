'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RefreshCw, Search, Users } from 'lucide-react';

type TeamLedger = {
  team_id: number | null;
  team_name: string;
  worker_count: number;
  due_total: number;
  paid_total: number;
  unpaid_total: number;
};

type WorkerLedger = {
  worker_id: number;
  worker_name: string;
  team_id: number | null;
  team_name: string | null;
  year_month: string;
  due: number;
  paid: number;
  paid_company: number;
  paid_client: number;
  unpaid: number;
};

type Project = { id: number; name: string };
type TeamOption = { id: number; name: string };

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00');

export default function TeamSalaryLedgerClient() {
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [ledgerTeams, setLedgerTeams] = useState<TeamLedger[]>([]);
  const [workers, setWorkers] = useState<WorkerLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => { setShowContent(true); }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [projRes, teamRes] = await Promise.all([
        fetch('/api/projects', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
        fetch('/api/team-groups', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
      ]);
      setProjects(Array.isArray(projRes.data) ? projRes.data.map((p: any) => ({ id: p.id, name: p.name })) : []);
      const teamData = Array.isArray(teamRes.data) ? teamRes.data : (teamRes.teams || []);
      setTeams(Array.isArray(teamData) ? teamData.map((t: any) => ({ id: t.id, name: t.name })) : []);
    } catch { /* ignore */ }
  }, []);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      if (filterTeam) params.set('team_id', filterTeam);
      const res = await fetch(`/api/team-settlements/salary-ledger?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data || {};
      setLedgerTeams(data.teams || []);
      let list: WorkerLedger[] = data.workers || [];
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        list = list.filter(w => w.worker_name.toLowerCase().includes(kw));
      }
      setWorkers(list);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [projectId, filterTeam, keyword]);

  useEffect(() => { fetchMeta(); fetchLedger(); }, [fetchMeta, fetchLedger]);

  const totalDue = ledgerTeams.reduce((s, t) => s + t.due_total, 0);
  const totalPaid = ledgerTeams.reduce((s, t) => s + t.paid_total, 0);
  const totalUnpaid = ledgerTeams.reduce((s, t) => s + t.unpaid_total, 0);

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className={`mb-6 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>班组工人工资台账</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          展示班组分账生成的工人应发工资及发放情况（可拆分甲方代付/公司支付），用于核对欠薪
        </p>
      </div>

      {/* 筛选栏 */}
      <Card className="mb-6">
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm" style={{ color: 'var(--foreground)' }}>所属项目</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="全部项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部项目</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm" style={{ color: 'var(--foreground)' }}>班组</Label>
              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="全部班组" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部班组</SelectItem>
                  {teams.filter(t => !projectId || projects.find(p => p.id === Number(projectId))).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm" style={{ color: 'var(--foreground)' }}>工人姓名</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
                <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索工人" className="h-10 pl-9" />
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="h-10" onClick={fetchLedger}><RefreshCw className="mr-1.5 h-4 w-4" />刷新</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 汇总卡片 */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="stat-card stat-card-blue">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>班组应得总额</p>
            <p className="mt-2 text-2xl font-bold stat-number-blue">{fmt(totalDue)}</p>
          </CardContent>
        </Card>
        <Card className="stat-card stat-card-green">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>已发总额</p>
            <p className="mt-2 text-2xl font-bold" style={{ color: '#2F9E44' }}>{fmt(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="stat-card stat-card-orange">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>未发（欠薪）总额</p>
            <p className="mt-2 text-2xl font-bold" style={{ color: '#E8590C' }}>{fmt(totalUnpaid)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 班组汇总表 */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--foreground)' }}>
            <Users className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />班组应发/已发/未发汇总
          </h2>
          {loading ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>加载中...</div>
          ) : ledgerTeams.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无班组分账应发记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left py-2 pr-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>班组</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>工人数</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>应得</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>已发</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>未发</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerTeams.map(t => (
                    <tr key={`${t.team_id}`} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 pr-2 font-medium" style={{ color: 'var(--foreground)' }}>{t.team_name}</td>
                      <td className="py-2 px-2 text-right" style={{ color: 'var(--muted-foreground)' }}>{t.worker_count}</td>
                      <td className="py-2 px-2 text-right" style={{ color: 'var(--foreground)' }}>{fmt(t.due_total)}</td>
                      <td className="py-2 px-2 text-right" style={{ color: '#2F9E44' }}>{fmt(t.paid_total)}</td>
                      <td className="py-2 px-2 text-right font-medium" style={{ color: t.unpaid_total > 0 ? '#E8590C' : 'var(--foreground)' }}>{fmt(t.unpaid_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 工人明细表 */}
      <Card>
        <CardContent className="pt-5">
          <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--foreground)' }}>工人工资明细</h2>
          {loading ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>加载中...</div>
          ) : workers.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left py-2 pr-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>工人</th>
                    <th className="text-left px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>班组</th>
                    <th className="text-left px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>月份</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>应得</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>公司已发</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>甲方代发</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>已发合计</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>未发</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w, i) => (
                    <tr key={`${w.worker_id}-${w.year_month}-${i}`} className="border-b hover:bg-muted/50" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 pr-2 font-medium" style={{ color: 'var(--foreground)' }}>{w.worker_name}</td>
                      <td className="py-2 px-2" style={{ color: 'var(--muted-foreground)' }}>{w.team_name || '-'}</td>
                      <td className="py-2 px-2" style={{ color: 'var(--muted-foreground)' }}>{w.year_month}</td>
                      <td className="py-2 px-2 text-right" style={{ color: 'var(--foreground)' }}>{fmt(w.due)}</td>
                      <td className="py-2 px-2 text-right" style={{ color: 'var(--muted-foreground)' }}>{fmt(w.paid_company)}</td>
                      <td className="py-2 px-2 text-right" style={{ color: 'var(--muted-foreground)' }}>{fmt(w.paid_client)}</td>
                      <td className="py-2 px-2 text-right" style={{ color: '#2F9E44' }}>{fmt(w.paid)}</td>
                      <td className="py-2 px-2 text-right font-medium" style={{ color: w.unpaid > 0.005 ? '#E8590C' : 'var(--foreground)' }}>{fmt(w.unpaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}