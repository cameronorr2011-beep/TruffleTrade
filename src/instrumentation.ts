/**
 * Next.js instrumentation hook — runs once per server start.
 * Starts the TruffleTrade memory auto-updater (twin training, consolidation)
 * in long-running local processes. Skipped on Vercel: the gateway is
 * stateless and each subscriber's memory lives on their device.
 *
 * Federated sync intentionally does NOT read an access code from env: the
 * subscription code belongs to the subscriber (entered in the app), and the
 * updater piggybacks on it when the desktop shell provides one via
 * TT_MACHINE_ID-scoped config. Local twin training runs regardless.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return; // serverless: nothing to keep warm
  if (process.env.MEMORY_DISABLED === "1") return;

  try {
    const { startMemoryUpdater } = await import("../core/memory/updater");
    startMemoryUpdater({
      twinPaths: 500,
      horizonDays: 20,
      // Federation requires a subscriber code; there is no env fallback.
      // The desktop shell can still opt in by exporting TT_FEDERATE=1 with
      // its code provided through the same channel the app itself uses.
      federate: false,
      gatewayUrl: process.env.TT_GATEWAY_URL,
      accessCode: undefined,
    });
    console.log("[truffletrade] memory auto-updater scheduled (every 6h, local twin training)");
  } catch (err) {
    console.warn("[truffletrade] memory updater not started:", (err as Error).message);
  }
}
