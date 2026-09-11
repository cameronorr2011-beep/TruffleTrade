// Operator tool: provisions a test access code directly in the Postgres
// licensing store, for verifying the live gateway end-to-end.
// Usage: node scripts/provision-test-code.mjs [label]
// The code is printed once; revoke it afterwards via the admin API.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const envPath = path.resolve(process.cwd(), ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] ??= m[2].trim();
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const key = process.env.LICENSE_HMAC_KEY;
if (!key) throw new Error("LICENSE_HMAC_KEY missing in .env");

function checksum(body) {
  const hmac = crypto.createHmac("sha256", key).update(`TT:${body}`).digest();
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[hmac[i] % ALPHABET.length];
  return out;
}
function makeCode() {
  const bytes = crypto.randomBytes(64);
  let body = "";
  for (const b of bytes) {
    if (b < 248) body += ALPHABET[b % ALPHABET.length];
    if (body.length === 12) break;
  }
  return `TT-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${checksum(body)}`;
}
function hashCode(code) {
  return crypto.createHmac("sha256", key).update(`hash:${code}`).digest("hex");
}

const code = makeCode();
const hash = hashCode(code);
const orderId = crypto.randomBytes(12).toString("hex");
const now = Date.now();
const label = process.argv[2] || "gateway-e2e-test";

const { Client } = await import("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
  `INSERT INTO tt_orders (id, charge_id, status, created_ts, paid_ts, code_hash, code_plain) VALUES ($1,$2,'issued',$3,$3,$4,$5)`,
  [orderId, `test-${orderId}`, now, hash, code],
);
await client.query(
  `INSERT INTO tt_codes (code_hash, order_id, status, activated_ts, expires_ts) VALUES ($1,$2,'active',$3,$4)`,
  [hash, orderId, now, now + 30 * 86_400_000],
);
await client.end();

console.log(`test access code (${label}):\n${code}\norder: ${orderId}`);
console.log("revoke later with: curl -X POST <site>/api/admin -H 'x-admin-token: <ADMIN_TOKEN>' -d '{\"action\":\"revoke\",\"code\":\"<code>\"}'");
