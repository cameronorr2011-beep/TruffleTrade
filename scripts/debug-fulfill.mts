// One-off diagnostic: run fulfillTestModeOrder against the production DB with
// progress markers — pinpoints the exact step that stalls or throws.
import fs from "node:fs";

for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const orderId = process.argv[2] ?? "8edbf376f0e6501bcaeb261f";
const step = (s: string) => console.log(`[${new Date().toISOString()}] ${s}`);

step("loading fulfill module…");
const { fulfillTestModeOrder } = await import("../core/licensing/fulfill");
step("loaded");
const { licensingDb } = await import("../core/licensing/db");
step("db module loaded");
const db = licensingDb();
step(`db kind: ${db.kind}`);

step("fetching order…");
const order = await Promise.race([
  db.getOrder(orderId),
  new Promise((_, rej) => setTimeout(() => rej(new Error("getOrder timed out after 15s")), 15_000)),
]);
step(`order: status=${order?.status} paidTs=${order?.paidTs} codeHash=${order?.codeHash}`);

step("running fulfillTestModeOrder…");
try {
  const r = await fulfillTestModeOrder(orderId);
  step(`RESULT: ${JSON.stringify(r)}`);
} catch (e) {
  step(`THREW: ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}`);
}

const after = await db.getOrder(orderId);
step(`order after: status=${after?.status} codePlain=${after?.codePlain ? "SET" : "null"}`);
process.exit(0);
