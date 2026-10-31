import { redirect } from 'next/navigation';

/** 应付台账已由「供应商成本看板」替代，旧地址保留跳转 */
export default function LegacyAccountDashboardRedirect() {
  redirect('/data-board/supplier-cost');
}