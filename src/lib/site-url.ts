// The canonical hosted site URL. The desktop app bundles its own Next server,
// but payments must ALWAYS go through the hosted site — the local app has no
// payment-provider keys by design (secrets never ship in the installer), so
// its own /buy would fall back to the manual Wallet-of-Satoshi flow. Pointing
// buy/renew links here keeps app and website payments identical (Blockonomics
// on-chain BTC). Override with NEXT_PUBLIC_SITE_URL if the domain changes.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://ai-stock-trader-two.vercel.app";

/** Absolute URL for the purchase page — safe to use from the desktop app. */
export const BUY_URL = `${SITE_URL}/buy`;
