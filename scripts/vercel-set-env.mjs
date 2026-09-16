// Operator tool: syncs secrets from local .env to the Vercel project.
// Values are NEVER printed — only a masked fingerprint per key.
// Usage: VT=<vercel-token> node scripts/vercel-set-env.mjs [project]
//
// Vars managed here (see .env.example for what each does):
//   DATABASE_URL, GROQ_API_KEY, GROQ_MODEL, LICENSE_HMAC_KEY,
//   ADMIN_TOKEN, TT_SITE_URL, BLOCKONOMICS_API_KEY, BLOCKONOMICS_CALLBACK_SECRET
// ZBD_API_KEY is intentionally NOT set by this script — obtain it from the
// ZBD developer dashboard and add it via the Vercel dashboard instead.

import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.VT;
if (!TOKEN) {
  console.error("Usage: VT=<vercel-token> node scripts/vercel-set-env.mjs [project]");
  process.exit(1);
}
const PROJECT = process.argv[2] || "ai-stock-trader";
const API = "https://api.vercel.com";

// Load .env from the repo root (gitignored).
const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error(`.env not found at ${envPath}`);
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].trim();
}

// Generate strong licensing secrets on first run and persist them to .env
// so local and server stay in sync.
function ensureSecret(name) {
  if (env[name] && env[name].length >= 32) return env[name];
  const val = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  env[name] = val;
  fs.appendFileSync(envPath, `\n${name}=${val}\n`);
  console.log(`  generated and saved to .env: ${name}`);
  return val;
}
import crypto from "node:crypto";
const LICENSE_HMAC_KEY = ensureSecret("LICENSE_HMAC_KEY");
const ADMIN_TOKEN = ensureSecret("ADMIN_TOKEN");

const desired = {
  DATABASE_URL: env.DATABASE_URL,
  GROQ_API_KEY: env.GROQ_API_KEY,
  GROQ_MODEL: env.GROQ_MODEL || "openai/gpt-oss-120b",
  LICENSE_HMAC_KEY,
  ADMIN_TOKEN,
  TT_SITE_URL: env.TT_SITE_URL || `https://ai-stock-trader-two.vercel.app`,
};
// Payment-provider keys sync only when present in .env (adding one to .env and
// re-running this script is all it takes to enable that provider in production).
if (env.BLOCKONOMICS_API_KEY) {
  desired.BLOCKONOMICS_API_KEY = env.BLOCKONOMICS_API_KEY;
  if (env.BLOCKONOMICS_CALLBACK_SECRET) desired.BLOCKONOMICS_CALLBACK_SECRET = env.BLOCKONOMICS_CALLBACK_SECRET;
}

const missing = Object.entries(desired).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Missing values in .env: ${missing.join(", ")} — fill them in and re-run.`);
  process.exit(1);
}

async function api(pathName, init = {}) {
  const res = await fetch(`${API}${pathName}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

function mask(v) {
  return v ? `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} chars)` : "(empty)";
}

// Push each var to all environments (production, preview, development).
// upsert=true makes this idempotent.
let ok = 0;
for (const [key, value] of Object.entries(desired)) {
  const res = await api(`/v10/projects/${PROJECT}/env?upsert=true`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: ["production", "preview", "development"],
    }),
  });
  if (res.status >= 200 && res.status < 300) {
    console.log(`✓ ${key} → ${mask(value)}`);
    ok += 1;
  } else {
    console.error(`✗ ${key}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  }
}

console.log(`\n${ok}/${Object.keys(desired).length} vars synced to project "${PROJECT}".`);
console.log("ZBD_API_KEY is NOT managed here — add it via the Vercel dashboard.");
console.log("\nRedeploy production so the new vars take effect:");
console.log(`  curl -X POST ${API}/v13/deployments -H "Authorization: Bearer $VT" -d '{"name":"${PROJECT}","target":"production","gitSource":{"ref":"main"}}'`);
