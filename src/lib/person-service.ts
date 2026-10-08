/**
 * 人员主档服务（方案A）
 * -----------------------------------------
 * 背景：原 workers 表把"人"与"项目任职"绑定在同一行，一人多项目时产生重复 worker / worker_id，
 *       导致工资、发放、考勤按不同 id 记录对不上（重名、跨项目分裂）。
 *
 * 设计：persons = 全局唯一的人（身份证号全局唯一）；workers = 某人在某项目的任职记录。
 *       新导入/新增工人时，先按身份证（无证按项目+姓名）归入（resolve 或创建）一个 person，
 *       再把 person_id 回填到 worker，从而让同一人的所有项目任职共享一个主档。
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type PersonRow = {
  id: number;
  name: string;
  id_card?: string | null;
  phone?: string | null;
  bank_card?: string | null;
  is_blacklist?: boolean | null;
  remark?: string | null;
};

function normalizeCard(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

/**
 * 按身份证查询人员（身份证唯一索引）。
 */
export async function findPersonByIdCard(
  client: SupabaseClient,
  idCard: string | null | undefined,
): Promise<PersonRow | null> {
  const card = normalizeCard(idCard);
  if (!card) return null;
  const { data, error } = await client
    .from('persons')
    .select('*')
    .eq('id_card', card)
    .maybeSingle();
  if (error) {
    // 表不存在（旧库未执行 migration）时静默降级，调用方自行处理无 person 场景
    const msg = String(error.message || '');
    if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01' || error.code === 'PGRST205') {
      return null;
    }
    throw new Error(error.message);
  }
  return (data as PersonRow) || null;
}

/**
 * 按 项目+姓名 查询人员（无身份证时的兜底归并，仅同项目内）。
 */
export async function findPersonByProjectName(
  client: SupabaseClient,
  projectId: number | null | undefined,
  name: string | null | undefined,
): Promise<PersonRow | null> {
  if (!projectId || !name) return null;
  const { data, error } = await client
    .from('persons')
    .select('id, name, id_card, phone')
    .eq('name', String(name).trim())
    .is('id_card', null)
    .limit(50);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01' || error.code === 'PGRST205') {
      return null;
    }
    throw new Error(error.message);
  }
  const rows = (data || []) as PersonRow[];
  // 无身份证 person 表内不冗余 project 维度，取第一个（person 全局唯一，同名同项目视为同一人）
  return rows[0] || null;
}

/**
 * 归人：为一个工人解析出归属的 person（不存在则创建）。
 * 规则：有身份证按身份证归人；无身份证按 项目+姓名 归人（兜底）。
 * 返回 person 记录；persons 表不可用（旧库未迁移）时返回 null。
 */
export async function resolvePersonForWorker(
  client: SupabaseClient,
  input: {
    idCard?: string | null;
    phone?: string | null;
    bankCard?: string | null;
    name: string;
    projectId?: number | null;
    isBlacklist?: boolean | null;
    remark?: string | null;
  },
): Promise<PersonRow | null> {
  const card = normalizeCard(input.idCard);
  const name = String(input.name || '').trim();

  if (!name) return null;

  // 1. 有身份证 → 按身份证归人（唯一）
  if (card) {
    const person = await findPersonByIdCard(client, card);
    if (person) {
      // 补充最新联系方式
      if (input.phone || input.bankCard) {
        const patch: Record<string, unknown> = {};
        if (input.phone && person.phone !== input.phone) patch.phone = input.phone;
        if (input.bankCard && person.bank_card !== input.bankCard) patch.bank_card = input.bankCard;
        if (input.isBlacklist !== undefined) patch.is_blacklist = !!input.isBlacklist;
        if (Object.keys(patch).length > 0) {
          patch.updated_at = new Date().toISOString();
          await client.from('persons').update(patch).eq('id', person.id);
        }
      }
      return person;
    }
    // 创建新 person
    const { data, error } = await client
      .from('persons')
      .insert({
        name,
        id_card: card,
        phone: input.phone || null,
        bank_card: input.bankCard || null,
        is_blacklist: input.isBlacklist || false,
        remark: input.remark || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();
    if (error) {
      // 并发下身份证可能刚被占用 → 重查
      if (String(error.message || '').includes('duplicate') || String(error.message || '').includes('unique')) {
        const existing = await findPersonByIdCard(client, card);
        if (existing) return existing;
      }
      const msg = String(error.message || '');
      if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01' || error.code === 'PGRST205') {
        return null;
      }
      throw new Error(error.message);
    }
    return (data as PersonRow) || null;
  }

  // 2. 无身份证 → 按 项目+姓名 归人
  if (input.projectId) {
    const person = await findPersonByProjectName(client, input.projectId, name);
    if (person) return person;
  }
  // 创建：无身份证 people 也允许，作为兜底
  const { data, error } = await client
    .from('persons')
    .insert({
      name,
      id_card: null,
      phone: input.phone || null,
      bank_card: input.bankCard || null,
      is_blacklist: input.isBlacklist || false,
      remark: input.remark || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01' || error.code === 'PGRST205') {
      return null;
    }
    throw new Error(error.message);
  }
  return (data as PersonRow) || null;
}

/**
 * 给已存在的 worker 回填 person_id（幂等）。persons 表不可用时静默返回。
 */
export async function ensureWorkerPerson(
  client: SupabaseClient,
  worker: { id: number; name: string; id_card?: string | null; phone?: string | null; bank_card?: string | null; project_id?: number | null; is_blacklist?: boolean | null; remark?: string | null },
): Promise<PersonRow | null> {
  if (!worker?.id) return null;
  const person = await resolvePersonForWorker(client, {
    idCard: worker.id_card,
    phone: worker.phone,
    bankCard: worker.bank_card,
    name: worker.name,
    projectId: worker.project_id,
    isBlacklist: worker.is_blacklist,
    remark: worker.remark,
  });
  if (person) {
    await client.from('workers').update({ person_id: person.id }).eq('id', worker.id);
  }
  return person;
}

/**
 * 按 worker 查询其归属 person；无 person 时返回 null。
 */
export async function getPersonByWorkerId(
  client: SupabaseClient,
  workerId: number,
): Promise<PersonRow | null> {
  if (!workerId) return null;
  const { data } = await client
    .from('workers')
    .select('person_id, persons(*)')
    .eq('id', workerId)
    .maybeSingle();
  const person = (data as { persons?: PersonRow | PersonRow[] | null } | null)?.persons;
  if (Array.isArray(person)) return person[0] || null;
  return (person as PersonRow) || null;
}
