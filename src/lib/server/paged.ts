import "server-only";

/**
 * The Supabase API returns at most 1,000 rows per request, whatever .limit()
 * says. These helpers read complete results and fail loudly on errors, so a
 * total or an automation never silently works from a partial or empty list.
 */
type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type CountRes = PromiseLike<{ count: number | null; error: { message: string } | null }>;

const PAGE = 1000;

/**
 * Every row of a query, page by page. `page(from, to)` must build the query
 * with a stable .order() (e.g. by id) and apply .range(from, to).
 */
export async function allRows<T>(page: (from: number, to: number) => Res<T>, max = 200_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Exact row count of a `select("id", { count: "exact", head: true })` query. */
export async function countOf(q: CountRes): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
