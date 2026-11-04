import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { fetchAllRows } from '@/lib/fetch-all-rows';

/**
 * GET /api/cost-center/diagnose?projectId=6
 * 「已支付」口径诊断：把供应商付款 / 工资发放按不同维度拆开，定位为什么金额偏大。
 *
 * 检查点：
 * 1) 按 project_id 汇总
 * 2) 通过合同归属（contract_id → supplier_contracts.project_id）汇总，找出 project_id 与合同项目不一致的付款
 * 3) 重复付款（同供应商+同日期+同金额）
 * 4) 单笔最大的 10 条
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = Number(searchParams.get('projectId')) || 0;

    const projects = await fetchAllRows<{ id: number; name: string }>((from, to) =>
      client.from('projects').select('id, name').range(from, to));
    const projectMap = new Map(projects.map((p) => [Number(p.id), String(p.name || '')]));

    const contracts = await fetchAllRows<{ id: number; project_id: number; contract_no?: string; supplier_id?: number }>((from, to) =>
      client.from('supplier_contracts').select('id, project_id, contract_no, supplier_id').range(from, to));
    const contractProjectMap = new Map(contracts.map((c) => [Number(c.id), Number(c.project_id) || 0]));

    const supplierPayments = await fetchAllRows<Record<string, unknown>>((from, to) =>
      client.from('supplier_payments').select('*').range(from, to));
    const salaryPayments = await fetchAllRows<Record<string, unknown>>((from, to) =>
      client.from('salary_payments').select('*').range(from, to));

    const toNumber = (value: unknown) => {
      const n = Number(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const isEffective = (status: unknown) => {
      const text = String(status || '').toLowerCase();
      if (!text) return true;
      return !['voided', '作废', 'cancelled', 'rejected', 'pending'].includes(text);
    };

    const targetProject = projectId || 0;
    const inScope = (pid: number) => targetProject === 0 || pid === targetProject;

    // 1) 按 project_id 汇总
    const supplierByProject = new Map<number, { count: number; sum: number }>();
    const salaryByProject = new Map<number, { count: number; sum: number }>();
    const mismatch: Array<{ id: number; contractId: number; paymentProject: number; contractProject: number; amount: number; date?: string }> = [];
    const dupGroups = new Map<string, { count: number; sum: number; ids: number[] }>();
    const large: Array<{ id: number; supplierId?: number; contractId?: number; projectId: number; projectName: string; amount: number; date?: string; status?: string }> = [];

    supplierPayments.forEach((row) => {
      if (!isEffective(row.status)) return;
      const pid = Number(row.project_id) || 0;
      const contractId = Number(row.contract_id) || 0;
      const contractPid = contractProjectMap.get(contractId) || 0;
      const amount = toNumber(row.payment_amount);

      if (!inScope(pid) && !inScope(contractPid)) return;

      const bucket = supplierByProject.get(pid) || { count: 0, sum: 0 };
      bucket.count += 1;
      bucket.sum += amount;
      supplierByProject.set(pid, bucket);

      if (contractId > 0 && contractPid > 0 && pid > 0 && pid !== contractPid) {
        mismatch.push({ id: Number(row.id), contractId, paymentProject: pid, contractProject: contractPid, amount, date: String(row.payment_date || '') });
      }

      const key = `${row.supplier_id || 0}|${String(row.payment_date || '').slice(0, 10)}|${amount.toFixed(2)}`;
      const dup = dupGroups.get(key) || { count: 0, sum: 0, ids: [] };
      dup.count += 1;
      dup.sum += amount;
      dup.ids.push(Number(row.id));
      dupGroups.set(key, dup);

      large.push({
        id: Number(row.id),
        supplierId: Number(row.supplier_id) || undefined,
        contractId: contractId || undefined,
        projectId: pid,
        projectName: projectMap.get(pid) || `项目#${pid}`,
        amount,
        date: String(row.payment_date || ''),
        status: String(row.status || ''),
      });
    });

    salaryPayments.forEach((row) => {
      const pid = Number(row.project_id) || 0;
      if (!inScope(pid)) return;
      const bucket = salaryByProject.get(pid) || { count: 0, sum: 0 };
      bucket.count += 1;
      bucket.sum += toNumber(row.payment_amount);
      salaryByProject.set(pid, bucket);
    });

    const duplicateGroups = Array.from(dupGroups.entries())
      .filter(([, value]) => value.count > 1)
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 20);

    // 老表 payments（历史付款）：与 supplier_payments 同「项目+日期+金额」的视为重复，不再计入
    let legacyRows: Array<Record<string, unknown>> = [];
    try {
      legacyRows = await fetchAllRows<Record<string, unknown>>((from, to) => {
        let q = client.from('payments').select('*').range(from, to);
        if (targetProject > 0) q = q.eq('project_id', targetProject);
        return q;
      });
    } catch {
      legacyRows = [];
    }
    const newKeys = new Set<string>();
    supplierPayments.forEach((row) => {
      if (!isEffective(row.status)) return;
      newKeys.add(`${Number(row.project_id) || 0}|${String(row.payment_date || '').slice(0, 10)}|${toNumber(row.payment_amount)}`);
    });
    let legacyKept = 0;
    let legacyKeptSum = 0;
    let legacyDupRows = 0;
    let legacyDupSum = 0;
    legacyRows.forEach((row) => {
      if (!isEffective(row.status)) return;
      const pid = Number(row.project_id) || 0;
      if (!inScope(pid)) return;
      const amount = toNumber(row.payment_amount);
      const key = `${pid}|${String(row.payment_date || '').slice(0, 10)}|${amount}`;
      if (newKeys.has(key)) {
        legacyDupRows += 1;
        legacyDupSum += amount;
      } else {
        legacyKept += 1;
        legacyKeptSum += amount;
      }
    });

    const rows = Array.from(new Set([...supplierByProject.keys(), ...salaryByProject.keys()]))
      .map((pid) => {
        const supplier = supplierByProject.get(pid) || { count: 0, sum: 0 };
        const salary = salaryByProject.get(pid) || { count: 0, sum: 0 };
        return {
          projectId: pid,
          projectName: projectMap.get(pid) || (pid ? `项目#${pid}` : '未分配项目'),
          supplierPaid: Number(supplier.sum.toFixed(2)),
          supplierCount: supplier.count,
          workerPaid: Number(salary.sum.toFixed(2)),
          workerCount: salary.count,
          totalPaid: Number((supplier.sum + salary.sum).toFixed(2)),
        };
      })
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 20);

    return apiSuccess({
      projectId: targetProject || 'all',
      totals: {
        supplierPaid: Number(Array.from(supplierByProject.values()).reduce((s, v) => s + v.sum, 0).toFixed(2)),
        workerPaid: Number(Array.from(salaryByProject.values()).reduce((s, v) => s + v.sum, 0).toFixed(2)),
        supplierPaymentRows: supplierPayments.length,
        salaryPaymentRows: salaryPayments.length,
        legacyPaid: Number(legacyKeptSum.toFixed(2)),
        legacyRows: legacyKept,
        legacyDuplicatePaid: Number(legacyDupSum.toFixed(2)),
        legacyDuplicateRows: legacyDupRows,
        grandTotalPaid: Number((Array.from(supplierByProject.values()).reduce((s2, v) => s2 + v.sum, 0)
          + Array.from(salaryByProject.values()).reduce((s2, v) => s2 + v.sum, 0)
          + legacyKeptSum).toFixed(2)),
      },
      byProject: rows,
      projectMismatch: mismatch.slice(0, 50),
      projectMismatchSum: Number(mismatch.reduce((s, v) => s + v.amount, 0).toFixed(2)),
      duplicateGroups,
      largestPayments: large.sort((a, b) => b.amount - a.amount).slice(0, 15),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '已支付诊断失败'));
  }
}
