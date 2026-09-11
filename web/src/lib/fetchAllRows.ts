import type { PostgrestError } from "@supabase/supabase-js";

interface PageResult {
  data: unknown;
  error: PostgrestError | null;
}

export interface AllRowsResult {
  data: unknown[];
  error: PostgrestError | null;
}

/** Load every server page instead of silently accepting Supabase's row cap. */
export async function fetchAllRows(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult>,
  pageSize = 1000
): Promise<AllRowsResult> {
  const all: unknown[] = [];
  for (let page = 0; ; page += 1) {
    const result = await fetchPage(page * pageSize, (page + 1) * pageSize - 1);
    if (result.error) return { data: all, error: result.error };
    const rows = Array.isArray(result.data) ? result.data : [];
    all.push(...rows);
    if (rows.length < pageSize) return { data: all, error: null };
  }
}
