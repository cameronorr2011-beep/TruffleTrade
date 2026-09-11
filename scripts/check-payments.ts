// Payments readiness doctor. Run: npm run check:payments
// Verifies the two things the checkout depends on:
//   1. DATABASE_URL reachable + licensing tables creatable (Neon/Postgres)
//   2. ZBD_API_KEY present → automated invoices, absent → manual WoS approval
import dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  const zbd = process.env.ZBD_API_KEY?.trim();

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

  // 2. ZBD
  if (zbd) {
    console.log("[payments] ✓ ZBD_API_KEY present — checkout issues automated Lightning invoices");
    if (zbd.length < 20) console.warn("[payments] ! ZBD key looks short — double-check it in the ZBD dashboard");
  } else {
    console.log(
      "[payments] ○ ZBD_API_KEY absent — checkout falls back to MANUAL Wallet-of-Satoshi mode:\n" +
        "            buyers see clumsyyparsnip913@walletofsatoshi.com + order id, you approve at /admin.",
    );
  }

  console.log("[payments] done.");
  process.exit(0);
}

void main();
