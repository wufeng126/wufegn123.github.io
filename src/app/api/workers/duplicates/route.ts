import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { fetchAllRows } from '@/lib/fetch-all-rows';

/**
 * GET /api/workers/duplicates
 * 花名册重复检测：
 *  - 姓名 / 电话 / 身份证号 任一相同 → 归入同一组，标记「需人工」
 *  - 三项完全相同（含都为空也算相同项）→ 标记「可自动去重」
 * 同时返回每人的月度工资、已发放工资笔数与金额，供合并时判断影响。
 */

type WorkerRow = {
  id: number;
  name?: string | null;
  phone?: string | null;
  id_card?: string | null;
  work_type?: string | null;
  project_id?: number | null;
  person_id?: number | null;
  status?: string | null;
};

const normName = (value: unknown) => String(value || '').replace(/\s/g, '').trim();
const normPhone = (value: unknown) => String(value || '').replace(/[^\d]/g, '');
const normCard = (value: unknown) => String(value || '').replace(/\s/g, '').toUpperCase();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const scope = await getAccessibleProjectIds(client, auth.user);

    let query = client
      .from('workers')
      .select('id, name, phone, id_card, work_type, project_id, person_id, status')
      .order('id', { ascending: true });
    if (scope !== null) {
      if (scope.length === 0) return apiSuccess({ groups: [], summary: { groups: 0, auto: 0, manual: 0, workers: 0 } });
      query = query.in('project_id', scope);
    }
    const { data, error } = await query.limit(20000);
    if (error) throw new Error(error.message);

    const workers = (data || []) as WorkerRow[];
    const byId = new Map<number, WorkerRow>(workers.map((worker) => [Number(worker.id), worker]));

    // 并查集：按 姓名 / 电话 / 身份证 合并
    const parent = new Map<number, number>();
    const find = (id: number): number => {
      let root = id;
      while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
      if (parent.get(id) === undefined) parent.set(id, id);
      return root;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    workers.forEach((worker) => parent.set(Number(worker.id), Number(worker.id)));

    const keyOwner = new Map<string, number>();
    const keyed = (key: string, id: number) => {
      if (!key) return;
      const owner = keyOwner.get(key);
      if (owner === undefined) keyOwner.set(key, id);
      else union(owner, id);
    };

    // 只在「同一项目内」判定重复：三项相同但项目不同 = 同一人在不同项目任职，属正常
    workers.forEach((worker) => {
      const id = Number(worker.id);
      const projectKey = `pr${Number(worker.project_id) || 0}`;
      const name = normName(worker.name);
      const phone = normPhone(worker.phone);
      const card = normCard(worker.id_card);
      if (name.length >= 2) keyed(`${projectKey}:n:${name}`, id);
      if (phone.length >= 7) keyed(`${projectKey}:p:${phone}`, id);
      if (card.length >= 15) keyed(`${projectKey}:c:${card}`, id);
    });

    const clusters = new Map<number, number[]>();
    workers.forEach((worker) => {
      const root = find(Number(worker.id));
      const list = clusters.get(root) || [];
      list.push(Number(worker.id));
      clusters.set(root, list);
    });

    // 工资 / 发放统计
    const salaryRows = await fetchAllRows<{ worker_id?: unknown; gross_pay?: unknown; net_pay?: unknown }>((from, to) =>
      client.from('worker_salaries').select('worker_id, gross_pay, net_pay').range(from, to));
    const paymentRows = await fetchAllRows<{ worker_id?: unknown; payment_amount?: unknown }>((from, to) =>
      client.from('salary_payments').select('worker_id, payment_amount').range(from, to));

    const toNumber = (value: unknown) => {
      const n = Number(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const salaryStat = new Map<number, { count: number; gross: number }>();
    salaryRows.forEach((row) => {
      const id = Number(row.worker_id);
      const stat = salaryStat.get(id) || { count: 0, gross: 0 };
      stat.count += 1;
      stat.gross += toNumber(row.gross_pay);
      salaryStat.set(id, stat);
    });
    const paymentStat = new Map<number, { count: number; amount: number }>();
    paymentRows.forEach((row) => {
      const id = Number(row.worker_id);
      const stat = paymentStat.get(id) || { count: 0, amount: 0 };
      stat.count += 1;
      stat.amount += toNumber(row.payment_amount);
      paymentStat.set(id, stat);
    });

    const auditByProject = await (async () => {
      const projectIds = Array.from(new Set(workers.map((worker) => Number(worker.project_id)).filter(Boolean)));
      const map = new Map<number, string>();
      if (projectIds.length > 0) {
        const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
        (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
          map.set(Number(project.id), String(project.name || ''));
        });
      }
      return map;
    })();

    const groups = Array.from(clusters.values())
      .filter((ids) => ids.length > 1)
      .map((ids) => {
        const members = ids.map((id) => {
          const worker = byId.get(id)!;
          const salary = salaryStat.get(id) || { count: 0, gross: 0 };
          const payment = paymentStat.get(id) || { count: 0, amount: 0 };
          return {
            id,
            name: String(worker.name || ''),
            phone: String(worker.phone || ''),
            idCard: String(worker.id_card || ''),
            workType: String(worker.work_type || ''),
            projectId: Number(worker.project_id) || null,
            projectName: auditByProject.get(Number(worker.project_id)) || '',
            status: String(worker.status || ''),
            salaryCount: salary.count,
            salaryGross: Number(salary.gross.toFixed(2)),
            paymentCount: payment.count,
            paymentAmount: Number(payment.amount.toFixed(2)),
          };
        });

        // 三项是否完全一致 → 可自动去重
        const signature = (member: (typeof members)[number]) =>
          `${normName(member.name)}|${normPhone(member.phone)}|${normCard(member.idCard)}`;
        const allSame = new Set(members.map(signature)).size === 1
          && new Set(members.map((member) => member.projectId)).size === 1;

        // 建议保留：有身份证优先 → 工资记录多 → 发放记录多 → id 小
        const suggestedKeepId = [...members].sort((a, b) => {
          const cardScore = (m: typeof a) => (normCard(m.idCard).length >= 15 ? 1 : 0);
          if (cardScore(b) !== cardScore(a)) return cardScore(b) - cardScore(a);
          if (b.salaryCount !== a.salaryCount) return b.salaryCount - a.salaryCount;
          if (b.paymentCount !== a.paymentCount) return b.paymentCount - a.paymentCount;
          return a.id - b.id;
        })[0].id;

        return {
          key: `g-${Math.min(...ids)}`,
          mode: allSame ? 'auto' : 'manual',
          suggestedKeepId,
          members: members.sort((a, b) => b.salaryCount - a.salaryCount || a.id - b.id),
        };
      })
      .sort((a, b) => (a.mode === 'auto' ? -1 : 1) - (b.mode === 'auto' ? -1 : 1) || b.members.length - a.members.length);

    return apiSuccess({
      groups,
      summary: {
        groups: groups.length,
        auto: groups.filter((group) => group.mode === 'auto').length,
        manual: groups.filter((group) => group.mode === 'manual').length,
        workers: groups.reduce((sum, group) => sum + group.members.length, 0),
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '重复人员检测失败'));
  }
}
