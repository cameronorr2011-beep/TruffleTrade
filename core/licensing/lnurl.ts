// LNURL-pay client: resolves a Lightning Address (user@domain) into a real
// BOLT11 invoice for an exact amount, server-side. Used to route settled
// payments to the operator's own wallet (Wallet of Satoshi) without any
// merchant API from the payee wallet — WoS just receives a normal Lightning
// payment to its Lightning Address, which it fully supports.
//
// Spec: https://github.com/lnurl/luds/blob/luds/01.md and LUD-06/LUD-16.
// Everything here is server-side only; never expose to the browser.

export interface LnurlPayInfo {
  callback: string;
  minSendable: number; // msats
  maxSendable: number; // msats
  commentAllowed?: number;
  tag: string;
}

export interface LnurlInvoice {
  pr: string; // BOLT11 invoice string
  routes?: unknown[];
}

async function getJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`lnurl: HTTP ${res.status} for ${new URL(url).host}`);
  return (await res.json()) as T;
}

/** Resolve a Lightning Address (LUD-16) to its LNURL-pay metadata document. */
export async function resolveLightningAddress(address: string): Promise<LnurlPayInfo> {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(address.trim());
  if (!m) throw new Error(`invalid lightning address: ${address}`);
  const [, user, domain] = m;
  const url = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`;
  const info = await getJson<LnurlPayInfo & { status?: string; reason?: string }>(url);
  if (info.status === "ERROR") throw new Error(`lnurl: wallet reported error: ${info.reason ?? "unknown"}`);
  if (info.tag !== "payRequest" || !info.callback) throw new Error("lnurl: not a payRequest endpoint");
  return info;
}

/**
 * Request an invoice for an exact amount (in msats) from the payee's wallet.
 * Verifies the returned invoice is present; the caller should also check the
 * amount decodes to the requested msats before paying it.
 */
export async function requestInvoice(info: LnurlPayInfo, msats: number, comment?: string): Promise<LnurlInvoice> {
  if (msats < info.minSendable || msats > info.maxSendable) {
    throw new Error(`lnurl: amount ${msats}msats outside wallet bounds ${info.minSendable}-${info.maxSendable}`);
  }
  const u = new URL(info.callback);
  u.searchParams.set("amount", String(msats));
  if (comment && info.commentAllowed && comment.length <= info.commentAllowed) {
    u.searchParams.set("comment", comment);
  }
  const inv = await getJson<LnurlInvoice & { status?: string; reason?: string }>(u.toString());
  if (inv.status === "ERROR") throw new Error(`lnurl: invoice request failed: ${inv.reason ?? "unknown"}`);
  if (!inv.pr || !inv.pr.toLowerCase().startsWith("lnbc")) throw new Error("lnurl: no valid BOLT11 invoice returned");
  return inv;
}

/** Resolve an address and get an exact-amount invoice in one call. */
export async function invoiceForAddress(address: string, msats: number, comment?: string): Promise<LnurlInvoice> {
  const info = await resolveLightningAddress(address);
  return requestInvoice(info, msats, comment);
}

/**
 * Decode just the amount (msats) and expiry from a BOLT11 string without any
 * dependency. BOLT11 data part: hrp carries amount for multipliers m/n/u/p;
 * for other multipliers the amount is in the 10-digit field.
 */
export function decodeBolt11AmountMsats(bolt11: string): number | null {
  const m = /^(lnbc|LNBC)(\d+)?([munp]?)(1)?/.exec(bolt11);
  if (!m) return null;
  const [, prefix, digits, multiplier] = m;
  if (!digits) return null; // no amount encoded
  const d = digits.slice(0, 10); // numeric field max 10 digits
  const val = Number(d);
  if (!Number.isFinite(val)) return null;
  switch (multiplier) {
    case "m": return val * 100_000_000; // milli-bitcoin -> msats
    case "u": return val * 100_000; // micro-bitcoin -> msats
    case "n": return val * 100; // nano-bitcoin -> msats
    case "p": return Math.round(val / 10); // pico-bitcoin -> msats
    default: {
      // No multiplier: amount is in whole BTC with 10-digit field => 10^11 msats per BTC
      if (prefix.toLowerCase() !== "lnbc") return null;
      return val * 100_000_000_000;
    }
  }
}
