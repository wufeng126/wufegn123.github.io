'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Calculator, Users, Loader2 } from 'lucide-react';

interface Bid { id: number; name: string; project_type: string; duration_months: number; profit_rate: number; management_fee: string; total_labor_cost: string; total_amount: string; status: string; remark: string; created_at: string; }
interface BidItem { id: number; work_type: string; unit: string; quantity: number; unit_price: number; amount: number; }
interface MgmtFee { id: number; position: string; monthly_salary: number; headcount: number; months: number; amount: number; }

export default function BidDetailPage() {
  const params = useParams();
  const [bid, setBid] = useState<Bid | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [items, setItems] = useState<BidItem[]>([]);
  const [fees, setFees] = useState<MgmtFee[]>([]);

  useEffect(() => {
    const id = params.id;
    Promise.all([
      fetch(`/api/bid-estimations`).then(r => r.json()),
      fetch(`/api/bid-estimations/items?bidId=${id}&type=items`).then(r => r.json()),
      fetch(`/api/bid-estimations/items?bidId=${id}&type=fees`).then(r => r.json()),
    ]).then(([bJ, iJ, fJ]) => {
      if (bJ.success) setBid((bJ.data || []).find((b: any) => b.id === parseInt(id as string)));
      if (iJ.success) setItems(iJ.data);
      if (fJ.success) setFees(fJ.data);
    });
  }, [params.id]);

  async function archiveToKnowledge() {
    if (!bid) return;
    setArchiving(true);
    try {
      const content = `# ${bid.name} 投标报价单\n\n**项目类型**：${bid.project_type || '-'}\n**工期**：${bid.duration_months}个月\n**利润率**：${bid.profit_rate}%\n\n## 报价汇总\n- 人工费合计：¥${parseFloat(bid.total_labor_cost || '0').toLocaleString()}\n- 管理费合计：¥${parseFloat(bid.management_fee || '0').toLocaleString()}\n- 投标总价：¥${parseFloat(bid.total_amount || '0').toLocaleString()}\n- 利润率：${bid.profit_rate}%\n\n## 状态\n${bid.status}`;
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${bid.name} 投标报价`,
          category: '投标策略',
          source_type: 'bid_archive',
          source_ref: `bid:${bid.id}`,
          tags: ['投标策略', bid.status, bid.project_type || ''].filter(Boolean),
          content,
          created_by: '投标测算归档',
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('已归档到知识库 → 投标策略分类');
      } else {
        alert('归档失败: ' + (json.error || '未知错误'));
      }
    } catch (e: any) {
      alert('归档失败: ' + e.message);
    } finally {
      setArchiving(false);
    }
  }

  const totalLabor = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);
  const totalMgmt = useMemo(() => fees.reduce((s, f) => s + f.amount, 0), [fees]);
  const subtotal = totalLabor + totalMgmt;
  const profit = subtotal * ((parseFloat(bid?.profit_rate?.toString() || '5')) / 100);
  const totalAmount = subtotal + profit;

  if (!bid) return <div className="min-h-full bg-[#F5F6FA] p-6 flex items-center justify-center text-sm text-[#86909C]">加载中...</div>;

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/cost-estimation/bid" className="inline-flex h-9 items-center gap-1.5 text-sm text-[#4E5969] hover:text-[#1D2129] mb-4">
          <ArrowLeft className="h-4 w-4" /> 返回投标列表
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-[#E5E6EB] p-6 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#1D2129]">{bid.name}</h1>
              <p className="text-sm text-[#86909C] mt-1">{bid.project_type || '未分类'} · {bid.duration_months}个月工期 · {bid.created_at?.slice(0, 10)}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-[#165DFF]">{parseFloat(bid.total_amount || totalAmount.toString()).toLocaleString()} 元</p>
              <p className="text-sm text-[#86909C]">利润率 {bid.profit_rate}%</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Work items */}
          <div className="bg-white rounded-xl border border-[#E5E6EB] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E5E6EB] bg-[#FAFBFC] flex items-center gap-2">
              <Calculator className="h-4 w-4 text-[#165DFF]" />
              <span className="text-sm font-medium text-[#1D2129]">工程量清单</span>
              <span className="text-xs text-[#86909C]">{items.length} 项 · {totalLabor.toLocaleString()} 元</span>
            </div>
            <div className="divide-y divide-[#E5E6EB]">
              {items.map(i => (
                <div key={i.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#1D2129]">{i.work_type}</p>
                    <p className="text-xs text-[#86909C]">{i.quantity} {i.unit} × {i.unit_price} 元</p>
                  </div>
                  <span className="text-sm font-medium">{i.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Management fees */}
          <div className="bg-white rounded-xl border border-[#E5E6EB] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E5E6EB] bg-[#FAFBFC] flex items-center gap-2">
              <Users className="h-4 w-4 text-[#722ED1]" />
              <span className="text-sm font-medium text-[#1D2129]">管理费用</span>
              <span className="text-xs text-[#86909C]">{fees.length} 个岗位 · {totalMgmt.toLocaleString()} 元</span>
            </div>
            <div className="divide-y divide-[#E5E6EB]">
              {fees.map(f => (
                <div key={f.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#1D2129]">{f.position}</p>
                    <p className="text-xs text-[#86909C]">{f.monthly_salary}元/月 × {f.headcount}人 × {f.months}月</p>
                  </div>
                  <span className="text-sm font-medium">{f.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-[#E5E6EB] p-6 mt-4">
          <h3 className="font-semibold text-[#1D2129] mb-4">报价汇总</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-[#4E5969]">人工费</span><span>{totalLabor.toLocaleString()} 元</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#4E5969]">管理费</span><span>{totalMgmt.toLocaleString()} 元</span></div>
            <div className="flex justify-between text-sm border-t border-[#E5E6EB] pt-3"><span className="text-[#4E5969]">小计</span><span className="font-medium">{subtotal.toLocaleString()} 元</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#4E5969]">利润 ({bid.profit_rate}%)</span><span className="text-[#00A870]">+{profit.toLocaleString()} 元</span></div>
            <div className="flex justify-between text-lg font-bold border-t border-[#E5E6EB] pt-3">
              <span>投标总价</span><span className="text-[#165DFF]">{totalAmount.toLocaleString()} 元</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
