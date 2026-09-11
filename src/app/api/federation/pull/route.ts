import { NextResponse } from "next/server";
import { validateAccessCode, checkRateLimit } from "@core/licensing/validate";
import { licensingDb } from "@core/licensing/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StoredBatch {
  subjectHash: string;
  kindCounts: Record<string, number>;
}

/**
 * GET /api/federation/pull — aggregated global update over the last 30 days.
 * Each subject's kind counts are summed across peers, then normalized into
 * weights (share of total tokens). This is the federated "model" the local
 * memory uses to bias its priors.
 */
export async function GET(req: Request) {
  const codeHeader = req.headers.get("x-access-code") ?? "";
  const validation = await validateAccessCode(codeHeader);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: validation.status });
  }
  const rl = checkRateLimit(validation.codeHash!);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate limit exceeded" }, { status: 429 });
  }

  const since = Date.now() - 30 * 86_400_000;
  const updates = await licensingDb().recentFederationUpdates(2_000);
  const fresh = updates.filter((u) => u.ts >= since);

  const agg = new Map<string, Record<string, number>>();
  const peers = new Set<string>();
  let totalTokens = 0;
  for (const u of fresh) {
    peers.add(u.peerHash);
    totalTokens += u.tokens;
    let batches: StoredBatch[] = [];
    try {
      batches = JSON.parse(u.batchJson) as StoredBatch[];
    } catch {
      continue;
    }
    for (const b of batches) {
      const cur = agg.get(b.subjectHash) ?? {};
      for (const [kind, n] of Object.entries(b.kindCounts)) {
        cur[kind] = (cur[kind] ?? 0) + n;
      }
      agg.set(b.subjectHash, cur);
    }
  }

  const aggregated = [...agg.entries()]
    .map(([subjectHash, kindCounts]) => {
      const subjectTokens = Object.values(kindCounts).reduce((s, x) => s + x, 0);
      return {
        subjectHash,
        kindCounts,
        weight: totalTokens > 0 ? Math.round((subjectTokens / totalTokens) * 10_000) / 10_000 : 0,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 100);

  return NextResponse.json({
    ok: true,
    epoch: Math.floor(Date.now() / 86_400_000),
    peers: peers.size,
    aggregated,
  });
}
