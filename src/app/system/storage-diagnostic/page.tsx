import { redirect } from 'next/navigation';

/** 存储诊断页已停用 */
export default function LegacyStorageDiagnosticRedirect() {
  redirect('/system-management');
}