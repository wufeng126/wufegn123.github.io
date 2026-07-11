'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, DollarSign, Calendar, TrendingUp, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';

interface MiscMaterial {
  id: number;
  material_name: string;
  unit: string | null;
  quantity: string;
  unit_price: string;
  total_price: string;
  purchase_date: string;
  supplier: string | null;
  remark: string | null;
}

interface MiscMaterialStats {
  total_count: number;
  total_amount: number;
  avg_unit_price: number;
  materials: MiscMaterial[];
}

interface ProjectMiscMaterialsProps {
  projectId: number;
}

// 格式化数字为千分位 + 两位小数
function formatCurrency(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 格式化日期
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export function ProjectMiscMaterials({ projectId }: ProjectMiscMaterialsProps) {
  const [stats, setStats] = useState<MiscMaterialStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [projectId]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/miscellaneous-materials?projectId=${projectId}&pageSize=100`);
      const data = await res.json();
      
      const materials = (data.materials || []).map((item: any) => ({
        id: item.id,
        material_name: item.material_name,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        purchase_date: item.purchase_date,
        supplier: item.supplier,
        remark: item.remark,
      }));

      const totalAmount = materials.reduce((sum: number, m: MiscMaterial) => 
        sum + (parseFloat(m.total_price) || 0), 0);
      const avgUnitPrice = materials.length > 0 
        ? materials.reduce((sum: number, m: MiscMaterial) => 
            sum + (parseFloat(m.unit_price) || 0), 0) / materials.length 
        : 0;

      setStats({
        total_count: data.pagination?.total || materials.length,
        total_amount: totalAmount,
        avg_unit_price: avgUnitPrice,
        materials,
      });
    } catch (error) {
      console.error('获取零星材料统计失败:', error);
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

  return (
    <div className="space-y-4">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>材料记录</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-bold" style={{ color: '#165DFF' }}>
                    {stats?.total_count || 0}
                  </span>
                  <span className="text-xs" style={{ color: '#86909C' }}>条</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>零星材料采购</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#E8F3FF' }}>
                📦
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>总金额</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-bold" style={{ color: '#FF7D00' }}>
                    ¥{stats ? formatCurrency(stats.total_amount) : '0.00'}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>计入项目成本</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#FFF7E8' }}>
                💰
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>平均单价</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-bold" style={{ color: '#722ED1' }}>
                    ¥{stats ? formatCurrency(stats.avg_unit_price) : '0.00'}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>材料平均单价</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#F5E8FF' }}>
                📊
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>查看详情</p>
                <div className="flex items-center gap-2 mt-2">
                  <Link 
                    href={`/miscellaneous-materials?projectId=${projectId}`}
                    className="text-sm font-medium hover:underline"
                    style={{ color: '#165DFF' }}
                  >
                    前往零星材料页面 →
                  </Link>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>支持导入导出</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#E8FFEA' }}>
                🔗
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 材料列表 */}
      <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
        <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
            <Package className="w-4 h-4" style={{ color: '#165DFF' }} />
            零星材料明细
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stats && stats.materials.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F7F8FA' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>材料名称</th>
                    <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>单位</th>
                    <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>数量</th>
                    <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>单价</th>
                    <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>金额</th>
                    <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>采购日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>供应商</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.materials.slice(0, 20).map((material, index) => (
                    <tr 
                      key={material.id} 
                      className={`transition-colors ${index % 2 === 1 ? 'bg-gray-50' : ''}`}
                      style={{ borderBottom: '1px solid #E5E6EB' }}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-sm" style={{ color: '#1D2129' }}>
                          {material.material_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm" style={{ color: '#86909C' }}>
                        {material.unit || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm" style={{ color: '#1D2129' }}>
                        {parseFloat(material.quantity).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3 text-right text-sm" style={{ color: '#1D2129' }}>
                        ¥{formatCurrency(parseFloat(material.unit_price))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: '#FF7D00' }}>
                        ¥{formatCurrency(parseFloat(material.total_price))}
                      </td>
                      <td className="px-4 py-3 text-center text-sm" style={{ color: '#86909C' }}>
                        {formatDate(material.purchase_date)}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: '#86909C' }}>
                        {material.supplier || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.materials.length > 20 && (
                <div className="px-4 py-3 text-center border-t" style={{ borderColor: '#E5E6EB' }}>
                  <Link 
                    href={`/miscellaneous-materials?projectId=${projectId}`}
                    className="text-sm hover:underline"
                    style={{ color: '#165DFF' }}
                  >
                    查看全部 {stats.materials.length} 条记录 →
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto mb-3" style={{ color: '#C9CDD4' }} />
              <p className="text-sm" style={{ color: '#86909C' }}>暂无零星材料记录</p>
              <p className="text-xs mt-2" style={{ color: '#C9CDD4' }}>
                请前往
                <Link href="/miscellaneous-materials" className="mx-1 hover:underline" style={{ color: '#165DFF' }}>
                  零星材料统计
                </Link>
                页面添加材料数据
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
