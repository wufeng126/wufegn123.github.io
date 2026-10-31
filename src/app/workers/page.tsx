import { redirect } from 'next/navigation';

/** 旧版工人成本管理已由「工资查询」替代，旧地址保留跳转 */
export default function LegacyWorkersRedirect() {
  redirect('/workers/query');
}