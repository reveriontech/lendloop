/**
 * HMAC-SHA256 request signing shared by both directions of the n8n integration.
 *
 * The signature covers `${timestamp}.${body}`, so the timestamp can't be swapped
 * onto another body. Each direction uses its own secret: Convex → n8n uses
 * CONVEX_TO_N8N_SECRET, n8n → Convex uses N8N_TO_CONVEX_SECRET. A leaked secret
 * can then forge requests in one direction only.
 *
 * Uses Web Crypto only, so it runs in Convex's default runtime without "use node".
 */

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";

/** Requests older (or newer) than this are rejected, which limits replays. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Returns the hex HMAC-SHA256 of `${timestamp}.${body}`. */
export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return toHex(new Uint8Array(mac));
}

/** The two headers to send with `body`. */
export async function signatureHeaders(secret: string, body: string, now = Date.now()): Promise<Record<string, string>> {
  const timestamp = String(now);
  return { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: await sign(secret, timestamp, body) };
}

export type VerifyResult = { valid: true } | { valid: false; reason: string };

/**
 * Checks a signed request. Fails closed when the secret isn't configured.
 * `crypto.subtle.verify` compares in constant time.
 */
export async function verify(args: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
}): Promise<VerifyResult> {
  if (!args.secret) return { valid: false, reason: "signing secret is not configured" };
  if (!args.timestamp || !/^\d{1,16}$/.test(args.timestamp)) {
    return { valid: false, reason: "missing or malformed timestamp" };
  }
  if (Math.abs((args.now ?? Date.now()) - Number(args.timestamp)) > MAX_CLOCK_SKEW_MS) {
    return { valid: false, reason: "timestamp is outside the 5-minute window" };
  }
  if (!args.signature || !/^[0-9a-f]{64}$/i.test(args.signature)) {
    return { valid: false, reason: "missing or malformed signature" };
  }
  const key = await importKey(args.secret, "verify");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(args.signature),
    encoder.encode(`${args.timestamp}.${args.body}`),
  );
  return valid ? { valid: true } : { valid: false, reason: "signature mismatch" };
}
