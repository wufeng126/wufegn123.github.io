'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calculator, Download, History, Users } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Bid {
  id: number;
  name: string;
  region?: string;
  project_type?: string;
  duration_months?: number;
  profit_rate?: number;
  management_fee_rate?: number;
  material_included?: boolean;
  material_scope_note?: string;
  management_fee?: string | number;
  total_labor_cost?: string | number;
  total_amount?: string | number;
  status?: string;
  created_at?: string;
}

interface BidItem {
  id: number;
  boq_item_name?: string;
  work_type?: string;
  standard_code?: string;
  unit?: string;
  quantity?: number;
  historical_bid_price?: number;
  cost_price?: number;
  management_fee_rate?: number;
  profit_rate?: number;
  suggested_price?: number;
  final_price?: number;
  final_amount?: number;
  bid_price?: number;
  bid_amount?: number;
  pricing_warning?: string;
  is_manual_price?: boolean;
}

interface MgmtFee {
  id: number;
  position: string;
  monthly_salary: number;
  headcount: number;
  months: number;
  amount: number;
}

interface VersionRow {
  id: number;
  name: string;
  summary?: string;
  total_amount?: number;
  created_at?: string;
}

function money(value: string | number | undefined) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export default function BidDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [bid, setBid] = useState<Bid | null>(null);
  const [items, setItems] = useState<BidItem[]>([]);
  const [fees, setFees] = useState<MgmtFee[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch('/api/bid-estimations').then(r => r.json()),
      fetch(`/api/bid-estimations/items?bidId=${id}&type=items`).then(r => r.json()),
      fetch(`/api/bid-estimations/items?bidId=${id}&type=fees`).then(r => r.json()),
      fetch(`/api/bid-estimations/versions?bidId=${id}`).then(r => r.json()),
    ]).then(([bidJson, itemJson, feeJson, versionJson]) => {
      if (bidJson.success) setBid((bidJson.data || []).find((row: Bid) => row.id === id) || null);
      if (itemJson.success) setItems(itemJson.data || []);
      if (feeJson.success) setFees(feeJson.data || []);
      if (versionJson.success) setVersions(versionJson.data || []);
    });
  }, [id]);

  const totals = useMemo(() => {
    const history = items.reduce((sum, item) => sum + Number(item.historical_bid_price || 0) * Number(item.quantity || 0), 0);
    const cost = items.reduce((sum, item) => sum + Number(item.cost_price || 0) * Number(item.quantity || 0), 0);
    const suggested = items.reduce((sum, item) => sum + Number(item.suggested_price || 0) * Number(item.quantity || 0), 0);
    const finalAmount = items.reduce((sum, item) => sum + Number(item.final_amount || item.bid_amount || 0), 0);
    const risk = items.filter(item => item.pricing_warning).length;
    return { history, cost, suggested, finalAmount, risk };
  }, [items]);

  function exportExcel() {
    if (!bid) return;
    const rows = items.map(item => ({
      甲方清单名称: item.boq_item_name,
      标准编码: item.standard_code,
      标准清单: item.work_type,
      单位: item.unit,
      工程量: item.quantity,
      历史中标单价: item.historical_bid_price,
      内部成本单价: item.cost_price,
      管理费率: item.management_fee_rate,
      利润率: item.profit_rate,
      建议报价单价: item.suggested_price,
      最终报价单价: item.final_price || item.bid_price,
      最终报价合价: item.final_amount || item.bid_amount,
      风险提示: item.pricing_warning,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '投标测算');
    XLSX.writeFile(workbook, `${bid.name}_测算表.xlsx`);
  }

  if (!bid) {
    return <div className="min-h-full bg-[#F5F6FA] p-6 text-center text-sm text-[#86909C]">正在读取测算详情...</div>;
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/cost-estimation/bid" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E6EB] bg-white hover:bg-[#F7F8FA]">
              <ArrowLeft className="h-4 w-4 text-[#4E5969]" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[#1D2129]">{bid.name}</h1>
              <p className="mt-1 text-sm text-[#86909C]">
                {bid.region || '-'} · {bid.project_type || '-'} · {bid.duration_months || 0} 个月 · {bid.material_included ? '含材料' : '不含材料'}
              </p>
            </div>
          </div>
          <button onClick={exportExcel} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D9DCE3] bg-white px-4 text-sm text-[#1D2129]">
            <Download className="h-4 w-4" />导出 Excel
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Kpi title="历史中标参考" value={money(totals.history)} unit="元" />
          <Kpi title="内部成本" value={money(totals.cost)} unit="元" />
          <Kpi title="管理费" value={money(bid.management_fee)} unit="元" />
          <Kpi title="最终报价" value={money(bid.total_amount || totals.finalAmount)} unit="元" />
          <Kpi title="风险提示" value={totals.risk} unit="项" danger={totals.risk > 0} />
        </div>

        <section className="overflow-hidden rounded-xl border border-[#E5E6EB] bg-white">
          <div className="flex items-center gap-2 border-b border-[#E5E6EB] px-4 py-3">
            <Calculator className="h-4 w-4 text-[#165DFF]" />
            <span className="font-medium text-[#1D2129]">测算清单</span>
            <span className="text-xs text-[#86909C]">{items.length} 项</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-[#F7F8FA] text-xs text-[#86909C]">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">甲方清单</th>
                  <th className="px-3 py-3 text-left font-medium">标准清单</th>
                  <th className="px-3 py-3 text-right font-medium">工程量</th>
                  <th className="px-3 py-3 text-right font-medium">历史中标价</th>
                  <th className="px-3 py-3 text-right font-medium">内部成本价</th>
                  <th className="px-3 py-3 text-right font-medium">建议报价</th>
                  <th className="px-3 py-3 text-right font-medium">最终报价</th>
                  <th className="px-3 py-3 text-right font-medium">合价</th>
                  <th className="px-3 py-3 text-left font-medium">风险</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E6EB]">
                {items.map(item => (
                  <tr key={item.id} className={item.pricing_warning ? 'bg-[#FFFBF0]' : ''}>
                    <td className="px-3 py-3 text-[#1D2129]">{item.boq_item_name || '-'}</td>
                    <td className="px-3 py-3 text-[#4E5969]">{item.standard_code || '-'} · {item.work_type || '-'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(item.quantity)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(item.historical_bid_price)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(item.cost_price)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(item.suggested_price)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(item.final_price || item.bid_price)}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{money(item.final_amount || item.bid_amount)}</td>
                    <td className="px-3 py-3 text-xs text-[#F59E0B]">{item.pricing_warning || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[#E5E6EB] bg-white">
            <div className="flex items-center gap-2 border-b border-[#E5E6EB] px-4 py-3">
              <Users className="h-4 w-4 text-[#722ED1]" />
              <span className="font-medium text-[#1D2129]">管理费明细</span>
            </div>
            <div className="divide-y divide-[#E5E6EB]">
              {fees.map(fee => (
                <div key={fee.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-[#1D2129]">{fee.position}</p>
                    <p className="mt-1 text-xs text-[#86909C]">{money(fee.monthly_salary)} 元/月 × {fee.headcount} 人 × {fee.months} 月</p>
                  </div>
                  <span className="font-medium tabular-nums">{money(fee.amount)} 元</span>
                </div>
              ))}
              {fees.length === 0 && <div className="px-4 py-10 text-center text-sm text-[#86909C]">暂无管理费明细</div>}
            </div>
          </section>

          <section className="rounded-xl border border-[#E5E6EB] bg-white">
            <div className="flex items-center gap-2 border-b border-[#E5E6EB] px-4 py-3">
              <History className="h-4 w-4 text-[#165DFF]" />
              <span className="font-medium text-[#1D2129]">测算版本</span>
            </div>
            <div className="divide-y divide-[#E5E6EB]">
              {versions.map(version => (
                <div key={version.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-[#1D2129]">{version.name}</p>
                    <span className="text-xs text-[#86909C]">{version.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#86909C]">{version.summary || '-'} · {money(version.total_amount)} 元</p>
                </div>
              ))}
              {versions.length === 0 && <div className="px-4 py-10 text-center text-sm text-[#86909C]">暂无保存版本</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({ title, value, unit, danger = false }: { title: string; value: string | number; unit: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
      <p className="text-xs text-[#86909C]">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${danger ? 'text-[#F59E0B]' : 'text-[#1D2129]'}`}>
        {value}<span className="ml-1 text-xs font-normal text-[#86909C]">{unit}</span>
      </p>
    </div>
  );
}
