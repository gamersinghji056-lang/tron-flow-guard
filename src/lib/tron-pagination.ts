export interface PaginatedFetchResult<T> {
  rows: T[];
  fingerprint?: string | null | undefined;
}

export async function collectPaginatedTronGridRows<T>(
  fetchPage: (fingerprint?: string) => Promise<PaginatedFetchResult<T>>,
  rowKey: (row: T) => string | null | undefined,
  options: { maxPages?: number | undefined } = {},
) {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 10, 50));
  const rows: T[] = [];
  const seenRows = new Set<string>();
  const seenFingerprints = new Set<string>();
  let fingerprint: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(fingerprint);
    const pageRows = result.rows;
    for (const row of pageRows) {
      const key = rowKey(row);
      if (!key || seenRows.has(key)) continue;
      seenRows.add(key);
      rows.push(row);
    }

    const next = result.fingerprint ?? undefined;
    if (!next || next === fingerprint || seenFingerprints.has(next) || pageRows.length === 0) break;
    seenFingerprints.add(next);
    fingerprint = next;
  }

  return rows;
}
