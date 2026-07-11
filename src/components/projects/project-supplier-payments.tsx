'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, CheckCircle, AlertTriangle, DollarSign, TrendingUp } from 'lucide-react';

interface SupplierPaymentStats {
  supplier_id: number;
  supplier_name: string;
  supplier_type: string;
  payable_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payable_formatted: string;
  paid_formatted: string;
  unpaid_formatted: string;
  is_settled: boolean;
  has_business: boolean;
}

interface StatsSummary {
  total_payable: number;
  total_paid: number;
  total_unpaid: number;
  supplier_count: number;
  settled_count: number;
  unsettled_count: number;
}

interface ProjectSupplierPaymentsProps {
  projectId: number;
}

// 格式化数字为千分位 + 两位小数
function formatCurrency(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProjectSupplierPayments({ projectId }: ProjectSupplierPaymentsProps) {
  const [stats, setStats] = useState<SupplierPaymentStats[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [projectId]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/stats?project_id=${projectId}`);
      const data = await res.json();
      setStats(data.stats || []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error('获取供应商付款统计失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#86909C' }}>
        加载中...
      </div>
    );
  }

  // 筛选有业务往来的供应商
  const filteredStats = stats.filter(s => s.has_business);

  return (
    <div className="space-y-4">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>应付总额</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-bold" style={{ color: '#165DFF' }}>
                    ¥{summary ? formatCurrency(summary.total_payable) : '0.00'}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>供应商结算金额</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#E8F3FF' }}>
                💰
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>已付款</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-bold" style={{ color: '#00B42A' }}>
                    ¥{summary ? formatCurrency(summary.total_paid) : '0.00'}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>{summary?.settled_count || 0} 家已结清</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#E8FFEA' }}>
                ✅
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>未付款</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-bold" style={{ color: '#FF7D00' }}>
                    ¥{summary ? formatCurrency(summary.total_unpaid) : '0.00'}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>{summary?.unsettled_count || 0} 家待付款</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#FFF7E8' }}>
                ⏳
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>供应商数</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-bold" style={{ color: '#722ED1' }}>
                    {filteredStats.length}
                  </span>
                  <span className="text-xs" style={{ color: '#86909C' }}>家</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>本项目涉及</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#F5E8FF' }}>
                🏢
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 供应商列表 */}
      <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
        <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
            <Building2 className="w-4 h-4" style={{ color: '#165DFF' }} />
            供应商付款情况
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F7F8FA' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>供应商/班组</th>
                    <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>应付金额</th>
                    <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>已付金额</th>
                    <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>未付金额</th>
                    <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((stat, index) => (
                    <tr 
                      key={stat.supplier_id} 
                      className={`transition-colors ${index % 2 === 1 ? 'bg-gray-50' : ''}`}
                      style={{ borderBottom: '1px solid #E5E6EB' }}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-sm" style={{ color: '#1D2129' }}>
                          {stat.supplier_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: '#165DFF' }}>
                        ¥{stat.payable_formatted}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: '#00B42A' }}>
                        ¥{stat.paid_formatted}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: stat.unpaid_amount > 0 ? '#FF7D00' : '#00B42A' }}>
                        {stat.is_settled ? (
                          <span className="flex items-center justify-end gap-1">
                            <CheckCircle className="w-4 h-4" />
                            已结清
                          </span>
                        ) : (
                          `¥${stat.unpaid_formatted}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {stat.is_settled ? (
                          <Badge style={{ background: '#E8FFEA', color: '#00B42A' }}>已结清</Badge>
                        ) : stat.unpaid_amount > 0 ? (
                          <Badge style={{ background: '#FFF7E8', color: '#FF7D00' }}>待付款</Badge>
                        ) : (
                          <Badge style={{ background: '#F2F3F5', color: '#86909C' }}>无业务</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 mx-auto mb-3" style={{ color: '#C9CDD4' }} />
              <p className="text-sm" style={{ color: '#86909C' }}>暂无付款记录</p>
              <p className="text-xs mt-2" style={{ color: '#C9CDD4' }}>请先在供应商结算页面添加结算数据</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
