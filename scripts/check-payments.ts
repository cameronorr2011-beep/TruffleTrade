// Payments readiness doctor. Run: npm run check:payments
// Verifies the things the checkout depends on:
//   1. DATABASE_URL reachable + licensing tables creatable (Neon/Postgres)
//   2. Payment provider configured → automated checkout, none → manual WoS
//      (Blockonomics > Blink > ZBD by default; TT_PAYMENT_MODE overrides)
import dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  const bnc = process.env.BLOCKONOMICS_API_KEY?.trim();
  const blink = process.env.BLINK_API_KEY?.trim();
  const zbd = process.env.ZBD_API_KEY?.trim();
  const mode = process.env.TT_PAYMENT_MODE?.trim();

  // 1. Database
  if (!url) {
    console.error("[payments] ✗ DATABASE_URL missing — orders and access codes cannot be stored.");
    process.exit(1);
  }
  try {
    const { licensingDb } = await import("../core/licensing/db");
    const db = licensingDb();
    await db.recentFederationUpdates(1); // cheapest query; forces connect + migrate
    console.log("[payments] ✓ database reachable, licensing schema ready");
  } catch (e) {
    console.error(`[payments] ✗ database unreachable: ${(e as Error).message}`);
    process.exit(1);
  }

  // 2. Payment provider
  if (mode === "manual") {
    console.log("[payments] ○ TT_PAYMENT_MODE=manual — forcing MANUAL Wallet-of-Satoshi checkout.");
  } else if (bnc) {
    console.log("[payments] ✓ BLOCKONOMICS_API_KEY present — on-chain BTC checkout, funds land in your own wallet");
    console.log("[payments]   dashboard callback URL → <TT_SITE_URL>/api/billing/blockonomics-webhook?secret=<BLOCKONOMICS_CALLBACK_SECRET or API key>");
  } else if (blink) {
    console.log("[payments] ✓ BLINK_API_KEY present — checkout issues automated Lightning invoices");
  } else if (zbd) {
    console.log("[payments] ✓ ZBD_API_KEY present — checkout issues automated Lightning charges");
    if (zbd.length < 20) console.warn("[payments] ! ZBD key looks short — double-check it in the ZBD dashboard");
  } else {
    console.log(
      "[payments] ○ no payment provider key — checkout falls back to MANUAL Wallet-of-Satoshi mode:\n" +
        "            buyers see clumsyyparsnip913@walletofsatoshi.com + order id, you approve at /admin.",
    );
  }

  console.log("[payments] done.");
  process.exit(0);
}

void main();
