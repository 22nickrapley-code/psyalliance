// PostgREST caps each response at 1,000 rows. Reads that can grow past
// that page through the whole result. `page(from, to)` must apply a stable
// order and .range(from, to).
export async function readAll<T = any>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
