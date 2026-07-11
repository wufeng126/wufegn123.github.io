'use client';

import { TabContainer, TabItem } from '@/components/tab-container';
import dynamic from 'next/dynamic';

const CostCenterPage = dynamic(() => import('@/app/cost-center/page'), { ssr: false });
const WorkerCostPage = dynamic(() => import('@/app/data-board/worker-cost/page'), { ssr: false });
const SupplierCostPage = dynamic(() => import('@/app/data-board/supplier-cost/page'), { ssr: false });
const FundManagementPage = dynamic(() => import('@/app/data-board/fund-management/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'cost-center', label: '成本利润', href: '/business-analysis?tab=cost-center', content: CostCenterPage, permission: 'cost_center:view' },
  { key: 'worker-cost', label: '人工成本', href: '/business-analysis?tab=worker-cost', content: WorkerCostPage, permission: 'data_board:worker_cost_view' },
  { key: 'supplier-cost', label: '供应商成本', href: '/business-analysis?tab=supplier-cost', content: SupplierCostPage, permission: 'data_board:supplier_cost_view' },
  { key: 'fund-management', label: '资金分析', href: '/business-analysis?tab=fund-management', content: FundManagementPage, permission: 'data_board:fund_management_view' },
];

export default function BusinessAnalysisPage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="cost-center" />
    </div>
  );
}
