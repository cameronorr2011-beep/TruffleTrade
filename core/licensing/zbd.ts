// ZBD (Zebedee) Lightning payments client — server-side only.
// Docs: https://docs.zbdpay.com — Create Charge: POST https://api.zebedee.io/v0/charges
// Amounts are in millisatoshis (msats). 1,000 sats = 1,000,000 msats.
// Callbacks arrive at our webhook unauthenticated, so the authoritative check
// is always a server-to-server poll: GET /v0/charges/:id with our apikey.

const ZBD_API = "https://api.zebedee.io/v0";

export const PRICE_SATS = 1_000; // 1,000 sats / month
export const PRICE_MSATS = String(PRICE_SATS * 1_000);

export interface ZbdCharge {
  id: string;
  internalId: string | null;
  amount: string; // msats
  status: "pending" | "completed" | "expired";
  description: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  confirmedAt: string | null;
  invoice: { request: string; uri: string } | null;
}

function zbdApiKey(): string {
  const key = process.env.ZBD_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ZBD_API_KEY is required (ZBD project apikey from https://zbd.gg / dev dashboard). Set it in the server .env — never in the client.",
    );
  }
  return key;
}

async function zbdFetch(path: string, init?: RequestInit): Promise<ZbdCharge> {
  const res = await fetch(`${ZBD_API}${path}`, {
    ...init,
    headers: {
      apikey: zbdApiKey(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: ZbdCharge;
  };
  if (!res.ok || !j.success || !j.data) {
    throw new Error(`ZBD ${path}: ${j.message ?? `HTTP ${res.status}`}`);
  }
  return j.data;
}

export interface CreateChargeInput {
  orderId: string;
  callbackUrl: string; // absolute URL of our webhook, e.g. https://truffletrade.app/api/billing/zbd-webhook
  expiresInSec?: number; // ZBD min 30s, default here: 30 min to pay
  description?: string;
}

export async function createCharge(input: CreateChargeInput): Promise<ZbdCharge> {
  return zbdFetch("/charges", {
    method: "POST",
    body: JSON.stringify({
      amount: PRICE_MSATS,
      description: input.description ?? "TruffleTrade — 30 days access (1000 sats)",
      expiresIn: input.expiresInSec ?? 1_800,
      callbackUrl: input.callbackUrl,
      internalId: `tt-${input.orderId}`,
    }),
  });
}

/** Authoritative status check — server-to-server, does not trust webhook payloads. */
export async function getCharge(chargeId: string): Promise<ZbdCharge> {
  return zbdFetch(`/charges/${encodeURIComponent(chargeId)}`, { method: "GET" });
}

/** True only when ZBD itself reports this exact charge as completed for our price. */
export async function isChargePaid(chargeId: string): Promise<boolean> {
  const c = await getCharge(chargeId);
  return c.status === "completed" && c.amount === PRICE_MSATS;
}

// ---------------------------------------------------------------- payouts --

interface ZbdPayment {
  id: string;
  fee: string; // msats
  amount: string; // msats
  invoice: string;
  preimage: string;
  status: "completed" | "error" | "pending";
  internalId: string | null;
  processedAt: string | null;
  confirmedAt: string | null;
}

/**
 * Pay a BOLT11 invoice from the ZBD account balance (payout).
 * POST /v0/payments — sends Lightning from our wallet to any invoice.
 * Returns the payment record with preimage when completed.
 */
export async function sendPayment(input: {
  invoice: string;
  amountMsats: string;
  internalId: string;
  description?: string;
}): Promise<ZbdPayment> {
  return zbdFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      invoice: input.invoice,
      amount: input.amountMsats,
      internalId: input.internalId,
      description: input.description ?? "TruffleTrade settlement",
    }),
  }) as unknown as ZbdPayment;
}

interface ZbdBalance {
  balance: string; // msats
  unit: string;
}

/** Current ZBD account balance in msats (for payout pre-checks / dashboards). */
export async function getWalletBalance(): Promise<{ msats: number }> {
  const j = await zbdFetch("/wallet-balance", { method: "GET" });
  const b = j as unknown as ZbdBalance;
  return { msats: Number(b.balance) || 0 };
}
