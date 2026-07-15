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
  standard_item_id?: number;
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
  match_score?: number;
  match_status?: string;
  price_source?: string;
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

interface PriceRecord {
  id: number;
  standard_item_id: number;
  project_name?: string;
  price: number;
  bid_year?: number;
  cost_year?: number;
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
  const [bidPrices, setBidPrices] = useState<PriceRecord[]>([]);
  const [costPrices, setCostPrices] = useState<PriceRecord[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch('/api/bid-estimations').then(r => r.json()),
      fetch(`/api/bid-estimations/items?bidId=${id}&type=items`).then(r => r.json()),
      fetch(`/api/bid-estimations/items?bidId=${id}&type=fees`).then(r => r.json()),
      fetch(`/api/bid-estimations/versions?bidId=${id}`).then(r => r.json()),
      fetch('/api/bid-estimations/library').then(r => r.json()),
    ]).then(([bidJson, itemJson, feeJson, versionJson, libraryJson]) => {
      if (bidJson.success) setBid((bidJson.data || []).find((row: Bid) => row.id === id) || null);
      if (itemJson.success) setItems(itemJson.data || []);
      if (feeJson.success) setFees(feeJson.data || []);
      if (versionJson.success) setVersions(versionJson.data || []);
      if (libraryJson.success) {
        setBidPrices(libraryJson.data.bidPrices || []);
        setCostPrices(libraryJson.data.costPrices || []);
      }
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

  const itemSources = useMemo(() => {
    const latest = (records: PriceRecord[], standardItemId?: number) => records
      .filter(record => record.standard_item_id === standardItemId)
      .sort((a, b) => Number(b.bid_year || b.cost_year || 0) - Number(a.bid_year || a.cost_year || 0) || b.id - a.id)[0];

    return items.reduce<Record<number, { bid?: PriceRecord; cost?: PriceRecord }>>((map, item) => {
      map[item.id] = {
        bid: latest(bidPrices, item.standard_item_id),
        cost: latest(costPrices, item.standard_item_id),
      };
      return map;
    }, {});
  }, [items, bidPrices, costPrices]);

  function exportExcel() {
    if (!bid) return;
    const overviewRows = [
      { 项目: '项目名称', 内容: bid.name },
      { 项目: '地区', 内容: bid.region || '-' },
      { 项目: '工程类型', 内容: bid.project_type || '-' },
      { 项目: '施工月份', 内容: bid.duration_months || 0 },
      { 项目: '材料口径', 内容: bid.material_included ? '含材料' : '不含材料' },
      { 项目: '管理费率', 内容: `${money(bid.management_fee_rate)}%` },
      { 项目: '管理费', 内容: money(bid.management_fee) },
      { 项目: '历史中标参考合计', 内容: money(totals.history) },
      { 项目: '内部成本合计', 内容: money(totals.cost) },
      { 项目: '最终报价合计', 内容: money(bid.total_amount || totals.finalAmount) },
      { 项目: '风险项数量', 内容: totals.risk },
    ];
    const rows = items.map(item => {
      const source = itemSources[item.id] || {};
      return {
      甲方清单名称: item.boq_item_name,
      标准编码: item.standard_code,
      标准清单: item.work_type,
      单位: item.unit,
      工程量: item.quantity,
      匹配状态: item.match_status,
      匹配度: item.match_score,
      历史中标单价: item.historical_bid_price,
      历史价来源项目: source.bid?.project_name || '',
      历史价年份: source.bid?.bid_year || '',
      内部成本单价: item.cost_price,
      成本价来源项目: source.cost?.project_name || '',
      成本价年份: source.cost?.cost_year || '',
      管理费率: item.management_fee_rate,
      利润率: item.profit_rate,
      建议报价单价: item.suggested_price,
      最终报价单价: item.final_price || item.bid_price,
      最终报价合价: item.final_amount || item.bid_amount,
      价格来源: item.is_manual_price || item.price_source === 'manual' ? '手动覆盖' : '自动建议',
      风险提示: item.pricing_warning,
    };
    });
    const feeRows = fees.map(fee => ({
      岗位: fee.position,
      月工资: fee.monthly_salary,
      人数: fee.headcount,
      月份: fee.months,
      金额: fee.amount,
    }));
    const riskRows = items
      .filter(item => item.pricing_warning)
      .map(item => ({
        甲方清单名称: item.boq_item_name,
        标准清单: item.work_type,
        风险提示: item.pricing_warning,
        最终报价单价: item.final_price || item.bid_price,
      }));
    const versionRows = versions.map(version => ({
      版本名称: version.name,
      摘要: version.summary,
      测算金额: version.total_amount,
      保存时间: version.created_at?.slice(0, 16).replace('T', ' '),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(overviewRows), '项目概况');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '测算明细');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(feeRows), '管理费明细');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(riskRows), '风险提示');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(versionRows), '版本记录');
    XLSX.writeFile(workbook, `${bid.name}_正式测算表.xlsx`);
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
            <table className="w-full min-w-[1450px] text-sm">
              <thead className="bg-[#F7F8FA] text-xs text-[#86909C]">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">甲方清单</th>
                  <th className="px-3 py-3 text-left font-medium">标准清单</th>
                  <th className="px-3 py-3 text-right font-medium">工程量</th>
                  <th className="px-3 py-3 text-right font-medium">历史中标价</th>
                  <th className="px-3 py-3 text-right font-medium">内部成本价</th>
                  <th className="px-3 py-3 text-center font-medium">匹配</th>
                  <th className="px-3 py-3 text-right font-medium">建议报价</th>
                  <th className="px-3 py-3 text-right font-medium">最终报价</th>
                  <th className="px-3 py-3 text-right font-medium">合价</th>
                  <th className="px-3 py-3 text-center font-medium">价格来源</th>
                  <th className="px-3 py-3 text-left font-medium">风险</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E6EB]">
                {items.map(item => {
                  const source = itemSources[item.id] || {};
                  return (
                    <tr key={item.id} className={item.pricing_warning ? 'bg-[#FFFBF0]' : ''}>
                      <td className="px-3 py-3 text-[#1D2129]">{item.boq_item_name || '-'}</td>
                      <td className="px-3 py-3 text-[#4E5969]">{item.standard_code || '-'} · {item.work_type || '-'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(item.quantity)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div>{money(item.historical_bid_price)}</div>
                        <div className="mt-1 text-xs text-[#86909C]">{source.bid ? `${source.bid.project_name || '-'} · ${source.bid.bid_year || '-'}` : '-'}</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div>{money(item.cost_price)}</div>
                        <div className="mt-1 text-xs text-[#86909C]">{source.cost ? `${source.cost.project_name || '-'} · ${source.cost.cost_year || '-'}` : '-'}</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs ${item.match_status === 'matched' ? 'bg-[#E8F3FF] text-[#165DFF]' : 'bg-[#FFF7E8] text-[#F59E0B]'}`}>
                          {item.match_status || '-'} · {item.match_score || 0}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(item.suggested_price)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(item.final_price || item.bid_price)}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{money(item.final_amount || item.bid_amount)}</td>
                      <td className="px-3 py-3 text-center text-xs text-[#4E5969]">{item.is_manual_price || item.price_source === 'manual' ? '手动覆盖' : '自动建议'}</td>
                      <td className="px-3 py-3 text-xs text-[#F59E0B]">{item.pricing_warning || '-'}</td>
                    </tr>
                  );
                })}
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
