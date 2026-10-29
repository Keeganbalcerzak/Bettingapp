import "server-only";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ data: T; headers: Headers }> {
  const { timeoutMs = 12000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": "ParlayLab/1.0", ...(rest.headers ?? {}) },
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        // ignore
      }
      throw new HttpError(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`, res.status, url);
    }
    return { data: (await res.json()) as T, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs async work over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Like mapLimit but a failure for one item yields null instead of rejecting. */
export async function mapLimitSettled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<(R | null)[]> {
  return mapLimit(items, limit, async (item) => {
    try {
      return await fn(item);
    } catch {
      return null;
    }
  });
}
