/**
 * simulate-payment.ts — full buyer journey, zero real money.
 *
 * Runs the exact production flow end-to-end:
 *   1. POST /api/billing/checkout         → order created (pending payment)
 *   2. GET  /api/billing/status           → "pending"
 *   3. POST /api/admin/orders (approve)   → simulates the confirmed payment;
 *                                           access code generated at this instant
 *   4. GET  /api/billing/status           → "issued" (buyer's screen would show the code)
 *   5. POST /api/analyst with the code    → AI unlocked (200)
 *   6. approve again                      → idempotent: same code, never a second one
 *   7. POST /api/analyst with fake code   → 401 (forgery rejected)
 *   8. revoke + cleanup                   → test code dead, order rows removed
 *
 * Usage: npx tsx scripts/simulate-payment.ts [baseUrl]
 * Reads ADMIN_TOKEN and DATABASE_URL from .env. Never prints the token.
 */

import "dotenv/config";

const BASE = (process.argv[2] ?? "https://ai-stock-trader-two.vercel.app").replace(/\/$/, "");

async function main(): Promise<void> {
  const { randomBytes } = await import("node:crypto");
  void randomBytes; // (kept import shape stable for future jitter)

  const ADMIN = process.env.ADMIN_TOKEN?.trim();
  if (!ADMIN) {
    console.error("ADMIN_TOKEN missing from .env — cannot simulate the approval step.");
    process.exit(1);
  }

  const results: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => {
    results.push({ step, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
  };

  const adminHeaders = { "x-admin-token": ADMIN, "content-type": "application/json" };

  const json = async <T,>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
    const res = await fetch(`${BASE}${path}`, init);
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  };

  // ── Step 1: buyer clicks "Buy" ──────────────────────────────────────────────
  const checkout = await json<{ ok: boolean; manual?: boolean; orderId?: string; priceSats?: number; lightningAddress?: string; error?: string }>(
    "/api/billing/checkout",
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  );
  const orderId = checkout.body.orderId ?? "";
  record(
    "1. checkout creates order",
    checkout.status === 200 && checkout.body.ok === true && /^[0-9a-f]{24}$/.test(orderId),
    `orderId=${orderId} mode=${checkout.body.manual ? "manual (WoS)" : "zbd-auto"} price=${checkout.body.priceSats}sats`,
  );

  // ── Step 2: buyer sees "waiting for payment" ────────────────────────────────
  const pending = await json<{ ok: boolean; status?: string; paid?: boolean }>(`/api/billing/status?orderId=${orderId}`);
  record(
    "2. order pending before payment",
    pending.status === 200 && pending.body.status === "pending" && pending.body.paid === false,
    `status=${pending.body.status} paid=${pending.body.paid}`,
  );

  // ── Step 3: payment confirmed → code generated instantly ────────────────────
  // (ZBD mode: webhook/poll calls this same fulfillment; manual mode: operator
  // approves after seeing the deposit in Wallet of Satoshi. Same code path.)
  const t0 = Date.now();
  const approve = await json<{ ok: boolean; status?: string; accessCode?: string }>(
    "/api/admin/orders",
    { method: "POST", headers: adminHeaders, body: JSON.stringify({ orderId, action: "approve" }) },
  );
  const code = (approve.body.accessCode ?? "").trim();
  record(
    "3. payment confirmed → code generated",
    approve.status === 200 && approve.body.ok === true && /^TT(-[A-Z0-9]{4}){4}$/.test(code),
    `code=${code} issued in ${Date.now() - t0}ms`,
  );

  // ── Step 4: buyer's screen shows the code (status flips to issued) ──────────
  const issued = await json<{ ok: boolean; status?: string; paid?: boolean }>(`/api/billing/status?orderId=${orderId}`);
  record(
    "4. order now issued on buyer's screen",
    issued.status === 200 && issued.body.status === "issued" && issued.body.paid === true,
    `status=${issued.body.status} paid=${issued.body.paid}`,
  );

  // ── Step 5: the fresh code unlocks the premium AI ───────────────────────────
  const chat = await json<{ ok?: boolean; reply?: string; error?: string; code?: string }>("/api/analyst", {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-code": code },
    body: JSON.stringify({ ticker: "AAPL", messages: [{ role: "user", content: "In two sentences: what is driving AAPL right now? End with one risk." }] }),
  });
  const reply = chat.body.reply ?? "";
  record(
    "5. fresh code unlocks AI analyst",
    chat.status === 200 && reply.length > 40,
    reply ? `${reply.slice(0, 140).replace(/\s+/g, " ")}…` : `status=${chat.status} err=${chat.body.error}`,
  );

  // ── Step 6: idempotency — approving the same paid order twice mints nothing ─
  const approve2 = await json<{ ok: boolean; status?: string; accessCode?: string }>(
    "/api/admin/orders",
    { method: "POST", headers: adminHeaders, body: JSON.stringify({ orderId, action: "approve" }) },
  );
  record(
    "6. duplicate approval → same code (idempotent)",
    approve2.status === 200 && (approve2.body.accessCode ?? "") === code,
    approve2.body.accessCode === code ? "identical code returned" : `got=${approve2.body.accessCode}`,
  );

  // ── Step 7: a forged code is rejected (wrong checksum, unknown hash) ────────
  const fake = code.replace(/[A-Z0-9]/, (c: string) => (c === "A" ? "B" : "A")); // flip first char
  const forged = await json<{ ok?: boolean; error?: string }>("/api/analyst", {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-code": fake },
    body: JSON.stringify({ ticker: "AAPL", messages: [{ role: "user", content: "hello" }] }),
  });
  record("7. forged code rejected", forged.status === 401, `status=${forged.status} err=${forged.body.error ?? ""}`);

  // ── Step 8: cleanup — revoke the simulated key, wipe the test order rows ────
  const revoke = await json<{ ok: boolean; revoked?: boolean }>("/api/admin", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ action: "revoke", code }),
  });
  record("8. test code revoked", revoke.status === 200 && revoke.body.revoked === true, "");

  const stillValid = await json<{ ok?: boolean; error?: string }>("/api/analyst", {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-code": code },
    body: JSON.stringify({ ticker: "AAPL", messages: [{ role: "user", content: "ping" }] }),
  });
  record("8b. revoked code can no longer use AI", stillValid.status === 401 || stillValid.status === 403, `status=${stillValid.status}`);

  let purged = false;
  try {
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL!, max: 1 });
    const out = await pool.query(
      "WITH d1 AS (DELETE FROM tt_orders WHERE id = $1 RETURNING 1), d2 AS (DELETE FROM tt_codes WHERE order_id = $1 RETURNING 1) SELECT (SELECT count(*) FROM d1)::int AS orders, (SELECT count(*) FROM d2)::int AS codes",
      [orderId],
    );
    await pool.end();
    purged = out.rows[0].orders === 1 && out.rows[0].codes === 1;
    record("8c. test rows purged from Neon", purged, `orders=${out.rows[0].orders} codes=${out.rows[0].codes}`);
  } catch (err) {
    record("8c. test rows purged from Neon", false, `${(err as Error).message} — remove orderId=${orderId} manually`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed — simulated buyer journey against ${BASE}`);
  if (failed > 0 || !purged) {
    console.log(`NOTE: keep orderId ${orderId} for debugging; its code ${code} is already revoked.`);
    process.exit(1);
  }
  console.log("No leftover artifacts: simulated order purged, simulated key revoked.");
}

main().catch((err) => {
  console.error("simulation crashed:", err);
  process.exit(1);
});
