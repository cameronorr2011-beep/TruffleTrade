/**
 * Next.js instrumentation hook — runs once per server start.
 * Starts the TruffleTrade memory auto-updater (twin training, consolidation,
 * federated sync) in long-running local processes. Skipped on Vercel: the
 * gateway is stateless and each subscriber's memory lives on their device.
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
      federate: Boolean(process.env.TT_GATEWAY_URL && process.env.TT_ACCESS_CODE),
      gatewayUrl: process.env.TT_GATEWAY_URL,
      accessCode: process.env.TT_ACCESS_CODE,
    });
    console.log("[truffletrade] memory auto-updater scheduled (every 6h)");
  } catch (err) {
    console.warn("[truffletrade] memory updater not started:", (err as Error).message);
  }
}
