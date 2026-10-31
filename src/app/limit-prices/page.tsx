import { redirect } from 'next/navigation';

/** 限价管理已并入报量管理，旧地址保留跳转 */
export default function LegacyLimitPricesRedirect() {
  redirect('/quantity-reporting');
}