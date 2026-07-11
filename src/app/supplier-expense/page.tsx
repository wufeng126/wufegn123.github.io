'use client';

import { TabContainer, TabItem } from '@/components/tab-container';
import dynamic from 'next/dynamic';

const SupplierAccountPage = dynamic(() => import('@/app/supplier-contracts/account/page'), { ssr: false });
const SettlementPage = dynamic(() => import('@/app/supplier-contracts/settlement/page'), { ssr: false });
const PaymentsPage = dynamic(() => import('@/app/payments/page'), { ssr: false });
const MiscMaterialsPage = dynamic(() => import('@/app/miscellaneous-materials/page'), { ssr: false });
const CompExpensesPage = dynamic(() => import('@/app/comprehensive-expenses/page'), { ssr: false });

const tabs: TabItem[] = [
  { key: 'suppliers', label: '供应商库', href: '/supplier-expense?tab=suppliers', content: SupplierAccountPage, permission: 'suppliers:view' },
  { key: 'settlements', label: '结算管理', href: '/supplier-expense?tab=settlements', content: SettlementPage, permission: 'settlements:view' },
  { key: 'payments', label: '付款记录', href: '/supplier-expense?tab=payments', content: PaymentsPage, permission: 'supplier_payments:view' },
  { key: 'materials', label: '零星材料', href: '/supplier-expense?tab=materials', content: MiscMaterialsPage, permission: 'miscellaneous_materials:view' },
  { key: 'expenses', label: '综合费用', href: '/supplier-expense?tab=expenses', content: CompExpensesPage, permission: 'comprehensive_expenses:view' },
];

export default function SupplierExpensePage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="suppliers" />
    </div>
  );
}
