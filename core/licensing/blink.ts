// Blink (blink.sv, by Galoy) Lightning payments adapter — server-side only.
//
// Why Blink over ZBD for this product: free self-serve account (email, no
// business KYB), API keys with minimal scopes (Read + Receive — the key
// physically cannot send money), and invoices are created on the operator's
// OWN wallet, so received sats land directly in the operator's balance.
// No middleman balance to fund, no payout leg, no settlement sweep.
//
// API: GraphQL at https://api.blink.sv/graphql, auth via `X-API-KEY` header.
// Docs: https://dev.blink.sv (lnInvoiceCreate / invoiceByPaymentHash).
// As with ZBD, webhook callbacks are only a hint — the authoritative check
// is always this server polling Blink for the invoice status by payment hash.

const BLINK_API_URL = process.env.BLINK_API_URL?.trim() || "https://api.blink.sv/graphql";

export const PRICE_SATS = 1_000; // 1,000 sats / month
export const PRICE_MSATS = String(PRICE_SATS * 1_000);

interface BlinkGraphQLError {
  message: string;
  path?: string[];
}

async function blinkFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.BLINK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BLINK_API_KEY is required (create a free account at dashboard.blink.sv, key with Read+Receive scopes). Set it server-side only — never in the client.");
  }
  const res = await fetch(BLINK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { data?: T; errors?: BlinkGraphQLError[] };
  if (!res.ok || j.errors?.length || !j.data) {
    throw new Error(`Blink ${res.status}: ${j.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  }
  return j.data;
}

/** Blink mode is on when a key exists and the operator hasn't forced manual/zbd. */
export function blinkEnabled(): boolean {
  return Boolean(process.env.BLINK_API_KEY?.trim()) && process.env.TT_PAYMENT_MODE !== "manual" && process.env.TT_PAYMENT_MODE !== "zbd";
}

// ---------------------------------------------------------------- wallets ---

interface WalletInfo {
  id: string;
  walletCurrency: string;
}

/** BTC wallet id: BLINK_WALLET_ID if set, else auto-resolve the BTC wallet. */
async function btcWalletId(): Promise<string> {
  const fixed = process.env.BLINK_WALLET_ID?.trim();
  if (fixed) return fixed;
  const data = await blinkFetch<{ me: { defaultAccount: { wallets: WalletInfo[] } } }>(
    `query Me { me { defaultAccount { wallets { id walletCurrency } } } }`,
    {},
  );
  const btc = data.me.defaultAccount.wallets.find((w) => w.walletCurrency === "BTC");
  if (!btc) throw new Error("No BTC wallet found on the Blink account");
  return btc.id;
}

// -------------------------------------------------------------- invoicing ---

export interface BlinkInvoice {
  paymentRequest: string; // BOLT11 (lnbc...)
  paymentHash: string;
  satoshis: number;
}

/** Create a 1,000-sat BOLT11 invoice on the operator's own Blink BTC wallet. */
export async function createInvoice(input: { orderId: string; memo?: string }): Promise<BlinkInvoice> {
  const walletId = await btcWalletId();
  const data = await blinkFetch<{
    lnInvoiceCreate: {
      invoice: { paymentRequest: string; paymentHash: string; satoshis: number } | null;
      errors: BlinkGraphQLError[];
    };
  }>(
    `mutation LnInvoiceCreate($input: LnInvoiceCreateInput!) {
      lnInvoiceCreate(input: $input) {
        invoice { paymentRequest paymentHash satoshis }
        errors { message }
      }
    }`,
    {
      input: {
        walletId,
        amount: PRICE_SATS,
        memo: input.memo ?? `TruffleTrade — 30 days access (order ${input.orderId})`,
      },
    },
  );
  const inv = data.lnInvoiceCreate.invoice;
  if (!inv) {
    throw new Error(`Blink invoice creation failed: ${data.lnInvoiceCreate.errors[0]?.message ?? "unknown error"}`);
  }
  return { paymentRequest: inv.paymentRequest, paymentHash: inv.paymentHash, satoshis: inv.satoshis };
}

// ---------------------------------------------------------------- status ----

interface LnInvoiceStatus {
  paymentHash: string;
  paymentStatus: "PENDING" | "PAID" | "EXPIRED" | null;
  satoshis: number | null;
}

async function invoiceStatusInWallet(walletId: string, paymentHash: string): Promise<LnInvoiceStatus | null> {
  const data = await blinkFetch<{
    me: { defaultAccount: { walletById: { invoiceByPaymentHash: LnInvoiceStatus | null } | null } | null };
  }>(
    `query InvoiceByHash($walletId: WalletId!, $paymentHash: PaymentHash!) {
      me { defaultAccount { walletById(walletId: $walletId) {
        ... on BTCWallet { invoiceByPaymentHash(paymentHash: $paymentHash) {
          paymentHash paymentStatus satoshis
        } }
      } } }
    }`,
    { walletId, paymentHash },
  );
  return data.me.defaultAccount?.walletById?.invoiceByPaymentHash ?? null;
}

/** Authoritative status: PAID only when Blink itself reports PAID for exactly our price. */
export async function isInvoicePaid(paymentHash: string): Promise<boolean> {
  const fixed = process.env.BLINK_WALLET_ID?.trim();
  if (fixed) {
    const inv = await invoiceStatusInWallet(fixed, paymentHash);
    return inv?.paymentStatus === "PAID" && inv.satoshis === PRICE_SATS;
  }
  // No wallet id configured: search all BTC wallets on the account.
  const data = await blinkFetch<{ me: { defaultAccount: { wallets: WalletInfo[] } | null } | null }>(
    `query Me { me { defaultAccount { wallets { id walletCurrency } } } }`,
    {},
  );
  const wallets = data.me?.defaultAccount?.wallets ?? [];
  for (const w of wallets.filter((w) => w.walletCurrency === "BTC")) {
    const inv = await invoiceStatusInWallet(w.id, paymentHash);
    if (inv?.paymentStatus === "PAID" && inv.satoshis === PRICE_SATS) return true;
    if (inv) return false; // found the invoice in this wallet — not paid / wrong amount
  }
  return false;
}
