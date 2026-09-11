// TruffleTrade access codes — TT-XXXX-XXXX-XXXX-XXXX
// 12 random Crockford-base32 body chars + 4-char HMAC checksum.
// The server can verify a code's integrity without a DB roundtrip, and the
// DB lookup still decides subscription state. Constant-time comparisons.

import crypto from "node:crypto";

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I/L/O/U
const BODY_LEN = 12;
const CHECK_LEN = 4;

export function licenseHmacKey(): string {
  const key = process.env.LICENSE_HMAC_KEY?.trim();
  if (!key) {
    throw new Error(
      "LICENSE_HMAC_KEY is required (the secret that makes access codes unforgeable). Set it in .env — any long random string.",
    );
  }
  return key;
}

function checksum(body: string): string {
  const hmac = crypto.createHmac("sha256", licenseHmacKey()).update(`TT:${body}`).digest();
  let out = "";
  for (let i = 0; i < CHECK_LEN; i++) {
    out += CODE_ALPHABET[hmac[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Generate a fresh, unforgeable access code. */
export function generateAccessCode(randomBytes: () => Buffer = () => crypto.randomBytes(32)): string {
  let body = "";
  while (body.length < BODY_LEN) {
    for (const byte of randomBytes()) {
      if (body.length >= BODY_LEN) break;
      // rejection sampling keeps the distribution uniform
      if (byte < 248) body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return formatCode(body, checksum(body));
}

function formatCode(body: string, check: string): string {
  const groups = [body.slice(0, 4), body.slice(4, 8), body.slice(8, 12), check];
  return `TT-${groups.join("-")}`;
}

/** Normalize user input (lowercase, spacing variants, missing dashes) to canonical form — or null if invalid. */
export function verifyAccessCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^TT/, "");
  const stripped = [...cleaned].filter((c) => CODE_ALPHABET.includes(c)).join("");
  if (stripped.length !== BODY_LEN + CHECK_LEN) return null;
  const body = stripped.slice(0, BODY_LEN);
  const check = stripped.slice(BODY_LEN);
  const expected = checksum(body);
  const a = Buffer.from(check);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return formatCode(body, check);
}

/** HMAC-SHA256 hex of an access code — codes are stored hashed, never plaintext. */
export function hashCode(code: string): string {
  return crypto.createHmac("sha256", licenseHmacKey()).update(`hash:${verifyAccessCode(code) ?? code}`).digest("hex");
}

export function newOrderId(): string {
  return crypto.randomBytes(12).toString("hex");
}

export function newInternalId(orderId: string): string {
  return `tt-${orderId}`;
}

/** Extract the order id embedded in a ZBD internalId (`tt-<orderId>`). */
export function orderIdFromInternalId(internalId: string | null | undefined): string | null {
  if (!internalId?.startsWith("tt-")) return null;
  const id = internalId.slice(3);
  return /^[0-9a-f]{24}$/.test(id) ? id : null;
}
