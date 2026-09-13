// Shared Postgres (Neon) client — self-healing, timeout-guarded.
//
// Why this exists: a single long-lived Client cached forever dies silently
// whenever an idle TCP socket is reaped (NAT, firewall, host maintenance).
// The next query then either throws instantly or hangs forever (pg sets no
// query timeout by default), and every route touching licensing or audit
// fails. This module instead:
//   * caps connect and statement/query time (no infinite hangs)
//   * detects a failed query on a cached client, discards the socket, and
//     retries exactly once on a freshly-built connection (stale-socket heal)
//   * never retries a failure from a brand-new connection (real errors surface)
//
// Both backends (licensing, audit) share this client — one socket per server
// process, rebuilt automatically whenever it goes bad.

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end?: () => Promise<void>;
};

const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 20_000;

let cached: PgClient | null = null;
let connecting: Promise<PgClient> | null = null;

async function freshClient(): Promise<PgClient> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required for the Postgres backend.");
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
  });
  await client.connect();
  return client as unknown as PgClient;
}

async function discard(client: PgClient): Promise<void> {
  try {
    await client.end?.();
  } catch {
    // Socket already dead — nothing to do.
  }
}

/**
 * Run a query against the shared client. Safe against stale sockets:
 * a failure on a cached connection triggers one rebuild + retry; a failure
 * on a fresh connection propagates immediately.
 */
export async function pgQuery(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const wasCached = cached !== null;
    if (!cached) {
      cached = await (connecting ??= freshClient().finally(() => {
        connecting = null;
      }));
    }
    const client = cached;
    try {
      const res = await client.query(sql, params);
      return res.rows;
    } catch (err) {
      cached = null;
      void discard(client);
      // Only retry when the failed socket may have been stale. A connection
      // that was just built has no excuse — surface the real error.
      if (!wasCached || attempt === 1) throw err;
    }
  }
  throw new Error("pgQuery: unreachable retry state");
}
