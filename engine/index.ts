import { assertConfig, config } from "../core/config";
import { cycleOnce, makeBroker } from "../core/engine-core";

async function main(): Promise<void> {
  assertConfig();
  const once = process.argv.includes("--once");
  const broker = makeBroker();
  console.log(
    `[engine] TruffleTrade engine online — mode=${broker.mode}, model=${config.groqModel}, cycle=${config.cycleSeconds}s`,
  );

  const run = async () => {
    const started = Date.now();
    try {
      const r = await cycleOnce(broker);
      console.log(`[engine] ${new Date(started).toISOString()} ${r.decisionSummary}`);
    } catch (err) {
      console.error(`[engine] cycle error: ${(err as Error).message}`);
    }
  };

  await run();
  if (once) {
    console.log("[engine] --once: done");
    return;
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, config.cycleSeconds * 1000));
    await run();
  }
}

main().catch((err) => {
  console.error(`[engine] fatal: ${err.message}`);
  process.exit(1);
});
