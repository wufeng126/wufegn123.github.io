import { redirect } from 'next/navigation';

/**
 * 旧版结算录入页（已被「供应商与费用 → 结算管理」取代）
 * 旧页面已无导航入口，保留 URL 兼容：访问时自动跳转到新页面。
 */
export default function LegacyPageRedirect() {
  redirect('/supplier-expense?tab=settlements');
}
