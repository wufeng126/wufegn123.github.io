/**
 * 分页取全量（绕过 PostgREST 单次 1000 行上限）
 *
 * 用法：
 *   const rows = await fetchAllRows((from, to) =>
 *     client.from('worker_salaries').select('*').range(from, to));
 *
 * 说明：PostgREST 单次查询默认最多返回 1000 行且不报错（静默截断），
 * 统计类查询必须用本方法分批取全量后再聚合，否则数据过千会"悄悄少算"。
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  pageSize = 1000,
  maxRows = 1_000_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error?.message || '查询失败');
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * 对"已经带好筛选条件的查询构造器"分页取全量。
 * Supabase 构造器可重复调用 .range()，每次都会带同样的筛选条件重新执行。
 */
export async function fetchAllFromBuilder<T>(
  builder: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }> },
  pageSize = 1000,
  maxRows = 1_000_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await builder.range(from, from + pageSize - 1);
    if (error) throw new Error(error?.message || '查询失败');
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
