// `npm run verify` — checks the subscriber's access code against the gateway.
import dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const gatewayUrl = process.env.TT_GATEWAY_URL?.trim();
  const accessCode = process.env.TT_ACCESS_CODE?.trim();
  if (!gatewayUrl || !accessCode) {
    console.error(
      "[verify] TT_GATEWAY_URL and TT_ACCESS_CODE must be set in .env\n" +
        "Subscribers: copy .env.example to .env and add both. Get your code at /buy after payment.",
    );
    process.exit(1);
  }
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/api/gateway/verify`, {
      headers: { "x-access-code": accessCode },
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      daysRemaining?: number;
      expiresTs?: number;
    };
    if (!res.ok || !j.ok) {
      console.error(`[verify] ✗ ${j.error ?? `HTTP ${res.status}`}`);
      process.exit(1);
    }
    console.log(`[verify] ✓ TruffleTrade access active — ${j.daysRemaining} day(s) remaining.`);
    process.exit(0);
  } catch (err) {
    console.error(`[verify] gateway unreachable: ${(err as Error).message}`);
    process.exit(1);
  }
}

void main();
