import { createHmac, timingSafeEqual } from "crypto";

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export interface SignedPayload {
  signature: string;
  timestamp: string;
  body: string;
}

export function signPayload(body: string, secret: string): SignedPayload {
  const timestamp = Date.now().toString();
  const data = `${timestamp}.${body}`;
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  return { signature, timestamp, body };
}

export function verifySignature(
  body: string,
  signature: string,
  timestamp: string,
  secret: string
): { valid: boolean; error?: string } {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return { valid: false, error: "Invalid timestamp" };

  const age = Math.abs(Date.now() - ts);
  if (age > REPLAY_WINDOW_MS) {
    return { valid: false, error: "Request expired (replay protection)" };
  }

  const data = `${timestamp}.${body}`;
  const expected = createHmac("sha256", secret).update(data).digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  if (sigBuf.length !== expectedBuf.length) {
    return { valid: false, error: "Signature length mismatch" };
  }

  if (!timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: "Invalid signature" };
  }

  return { valid: true };
}
