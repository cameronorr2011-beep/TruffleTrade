// One-off diagnostic (read-only): inspect the stuck order, code rows, and
// audit tail directly in the production Postgres DB.
import fs from "node:fs";

for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const orderId = process.argv[2] ?? "8edbf376f0e6501bcaeb261f";

const { Client } = await import("pg");
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 10_000,
});

await c.connect();
const order = await c.query(`SELECT * FROM tt_orders WHERE id = $1`, [orderId]);
console.log("ORDER:", JSON.stringify(order.rows[0] ?? null, null, 1));
const codes = await c.query(`SELECT * FROM tt_codes WHERE order_id = $1`, [orderId]);
console.log("CODES FOR ORDER:", JSON.stringify(codes.rows, null, 1));
const audit = await c.query(`SELECT ts, actor_hash, event, detail_json FROM tt_audit_events ORDER BY ts DESC, id DESC LIMIT 15`);
console.log("AUDIT TAIL (newest first):");
for (const r of audit.rows) console.log(` ${new Date(Number(r.ts)).toISOString()} [${r.event}] actor=${String(r.actor_hash).slice(0, 16)}… ${JSON.stringify(r.detail_json).slice(0, 140)}`);
await c.end();
process.exit(0);
