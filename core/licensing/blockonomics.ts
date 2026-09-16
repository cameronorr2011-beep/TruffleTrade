// Blockonomics (blockonomics.co) on-chain Bitcoin payments adapter — server-side only.
//
// Why Blockonomics: payments are plain on-chain BTC straight to the operator's
// OWN wallet (xpub-based, Blockonomics never custodies funds) with a free
// self-serve account. One Bearer API key is all that's needed — no KYB, no
// payout leg, no settlement sweep. 1,000 sats is a fixed amount, so no fiat
// price conversion is required: the buyer always pays exactly 0.00001 BTC.
//
// API: https://www.blockonomics.co, auth via `Authorization: Bearer <key>`.
//   POST /api/new_address   → unique BTC address for this order
//   GET  /api/balance/:addr → { confirmed, unconfirmed } in satoshis
// Callbacks (GET, dashboard-configured) fire at 2 confirmations and are only
// a hint — the authoritative check is this server polling /api/balance, same
// trust model as the ZBD/Blink integrations.
//
// Orders are stored with charge id `bnc-btc-<address>` (Blockonomics issues a
// fresh address per call, so the address uniquely identifies the order).

import crypto from "node:crypto";

const BLOCKONOMICS_API = "https://www.blockonomics.co/api";

export const PRICE_SATS = 1_000; // 1,000 sats / month = 0.00001 BTC on-chain
export const BTC_AMOUNT = (PRICE_SATS / 100_000_000).toFixed(8); // "0.00001000"

export const CHARGE_PREFIX = "bnc-btc-";

/** Orders whose charge_id starts with this prefix are Blockonomics on-chain BTC orders. */
export function chargeIdIsBlockonomics(chargeId: string): boolean {
  return chargeId.startsWith(CHARGE_PREFIX);
}

export function chargeIdForAddress(address: string): string {
  return `${CHARGE_PREFIX}${address}`;
}

export function addressFromChargeId(chargeId: string): string {
  return chargeId.slice(CHARGE_PREFIX.length);
}

/** Blockonomics mode is on when a key exists and the operator hasn't forced another flow. */
export function blockonomicsEnabled(): boolean {
  return (
    Boolean(process.env.BLOCKONOMICS_API_KEY?.trim()) &&
    process.env.TT_PAYMENT_MODE !== "manual" &&
    process.env.TT_PAYMENT_MODE !== "blink" &&
    process.env.TT_PAYMENT_MODE !== "zbd"
  );
}

function apiKey(): string {
  const key = process.env.BLOCKONOMICS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "BLOCKONOMICS_API_KEY is required (Blockonomics dashboard → Stores → API key). Set it server-side only — never in the client.",
    );
  }
  return key;
}

// ------------------------------------------------------------- callback secret ---

/**
 * The dashboard callback URL includes ?secret=<...> — the only auth on the
 * callback itself. Falls back to the API key when no dedicated secret is set
 * (the key is already server-only). Callbacks remain untrusted hints; the
 * authoritative check polls /api/balance, so a leaked secret cannot mint codes
 * on its own — it can only force extra polls.
 */
export function callbackSecret(): string {
  return process.env.BLOCKONOMICS_CALLBACK_SECRET?.trim() || apiKey();
}

/** Constant-time comparison so callback timing leaks nothing. */
export function verifyCallbackSecret(provided: string | null): boolean {
  const expected = callbackSecret();
  if (!provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// ------------------------------------------------------------- address creation ---

export interface BlockonomicsAddress {
  address: string;
}

/**
 * Create a unique BTC address for one order. match_callback is the site host —
 * Blockonomics only generates addresses from stores whose callback URL is on
 * that host (per their docs, the match is domain-level, so the secret in the
 * full callback URL does not break matching).
 */
export async function createBlockonomicsAddress(siteUrl: string): Promise<BlockonomicsAddress> {
  let host: string;
  try {
    host = new URL(siteUrl).host;
  } catch {
    throw new Error(`invalid TT_SITE_URL: ${siteUrl}`);
  }
  const res = await fetch(`${BLOCKONOMICS_API}/new_address?match_callback=${encodeURIComponent(host)}&crypto=BTC`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { address?: string; message?: string; error?: { message?: string } };
  if (!res.ok || !j.address) {
    const msg = j.error?.message ?? j.message ?? `HTTP ${res.status}`;
    throw new Error(`Blockonomics new_address failed: ${msg}`);
  }
  return { address: j.address };
}

// ------------------------------------------------------------- status polling ---

interface BalanceRow {
  confirmed: number; // satoshis
  unconfirmed: number;
}

// Short-lived memo so the buy page's 2.5s polling loop doesn't hammer the API.
const balanceCache = new Map<string, { ts: number; row: BalanceRow }>();
const BALANCE_TTL_MS = 5_000;

async function fetchBalance(address: string): Promise<BalanceRow> {
  const cached = balanceCache.get(address);
  if (cached && Date.now() - cached.ts < BALANCE_TTL_MS) return cached.row;
  const res = await fetch(`${BLOCKONOMICS_API}/balance/${encodeURIComponent(address)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as BalanceRow[] | { message?: string };
  if (!res.ok || !Array.isArray(j) || !j[0]) {
    const msg = !Array.isArray(j) && j.message ? j.message : `HTTP ${res.status}`;
    throw new Error(`Blockonomics balance failed: ${msg}`);
  }
  const row = { confirmed: Number(j[0].confirmed) || 0, unconfirmed: Number(j[0].unconfirmed) || 0 };
  balanceCache.set(address, { ts: Date.now(), row });
  return row;
}

/**
 * Authoritative paid check for a Blockonomics order: the address has received
 * at least our price in CONFIRMED satoshis. Unconfirmed funds never fulfill —
 * unconfirmed transactions can be reversed (same rule as Blockonomics' own docs).
 */
export async function isBlockonomicsOrderPaid(chargeId: string): Promise<boolean> {
  const address = addressFromChargeId(chargeId);
  if (!address) return false;
  const { confirmed } = await fetchBalance(address);
  return confirmed >= PRICE_SATS;
}

/** Unconfirmed total for the address — the buy page shows a "seen, confirming" state. */
export async function blockonomicsUnconfirmed(chargeId: string): Promise<number> {
  const address = addressFromChargeId(chargeId);
  if (!address) return 0;
  const { unconfirmed } = await fetchBalance(address);
  return unconfirmed;
}
