import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_CLOCK_SKEW_MS, sign, signatureHeaders, verify } from "../convex/signing";

const SECRET = "test-only-signing-secret";
const NOW = Date.parse("2026-11-19T09:00:00Z");
const BODY = JSON.stringify({ eventId: "evt_1", type: "request.created" });

async function check(overrides: Partial<Parameters<typeof verify>[0]> = {}) {
  const timestamp = String(NOW);
  return verify({ secret: SECRET, timestamp, signature: await sign(SECRET, timestamp, BODY), body: BODY, now: NOW, ...overrides });
}

describe("HMAC request signing", () => {
  it("accepts a correctly signed body", async () => {
    expect(await check()).toEqual({ valid: true });
  });

  it("produces the same signature as Node's crypto, which the n8n Code nodes use", async () => {
    const expected = createHmac("sha256", SECRET).update(`${NOW}.${BODY}`).digest("hex");
    expect(await sign(SECRET, String(NOW), BODY)).toBe(expected);
  });

  it("puts the timestamp and signature in the X-LendLoop headers", async () => {
    const headers = await signatureHeaders(SECRET, BODY, NOW);
    expect(headers["X-LendLoop-Timestamp"]).toBe(String(NOW));
    expect(headers["X-LendLoop-Signature"]).toBe(await sign(SECRET, String(NOW), BODY));
  });

  it("rejects a changed body", async () => {
    expect(await check({ body: BODY.replace("created", "approved") })).toEqual({ valid: false, reason: "signature mismatch" });
  });

  it("rejects a signature made with another secret", async () => {
    const timestamp = String(NOW);
    const forged = await sign("the-other-direction-secret", timestamp, BODY);
    expect((await check({ signature: forged })).valid).toBe(false);
  });

  it("rejects a timestamp moved onto another signature", async () => {
    expect((await check({ timestamp: String(NOW - 1000) })).valid).toBe(false);
  });

  it("rejects requests outside the 5-minute window, in either direction", async () => {
    for (const offset of [MAX_CLOCK_SKEW_MS + 1, -(MAX_CLOCK_SKEW_MS + 1)]) {
      const timestamp = String(NOW + offset);
      const result = await verify({ secret: SECRET, timestamp, signature: await sign(SECRET, timestamp, BODY), body: BODY, now: NOW });
      expect(result).toEqual({ valid: false, reason: "timestamp is outside the 5-minute window" });
    }
  });

  it("rejects missing or malformed headers", async () => {
    expect((await check({ timestamp: null })).valid).toBe(false);
    expect((await check({ timestamp: "yesterday" })).valid).toBe(false);
    expect((await check({ signature: null })).valid).toBe(false);
    expect((await check({ signature: "abc123" })).valid).toBe(false);
  });

  it("fails closed when the secret isn't configured", async () => {
    expect(await check({ secret: undefined })).toEqual({ valid: false, reason: "signing secret is not configured" });
    expect((await check({ secret: "" })).valid).toBe(false);
  });
});
