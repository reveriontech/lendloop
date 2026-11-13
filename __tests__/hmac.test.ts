import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signPayload, verifySignature } from "@/lib/hmac";

const TEST_SECRET = "test-secret-key-32-bytes-minimum";

describe("HMAC Signing and Verification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs and verifies a valid payload", () => {
    const body = JSON.stringify({ event: "test", data: "hello" });
    const { signature, timestamp } = signPayload(body, TEST_SECRET);

    const result = verifySignature(body, signature, timestamp, TEST_SECRET);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ event: "test" });
    const { signature, timestamp } = signPayload(body, TEST_SECRET);

    const tampered = JSON.stringify({ event: "tampered" });
    const result = verifySignature(tampered, signature, timestamp, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("rejects a wrong secret", () => {
    const body = JSON.stringify({ event: "test" });
    const { signature, timestamp } = signPayload(body, TEST_SECRET);

    const result = verifySignature(body, signature, timestamp, "wrong-secret");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("rejects an expired timestamp (replay protection)", () => {
    const body = JSON.stringify({ event: "test" });
    const { signature } = signPayload(body, TEST_SECRET);

    // Advance time by 6 minutes (past the 5-minute window)
    vi.advanceTimersByTime(6 * 60 * 1000);

    const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString();
    const result = verifySignature(body, signature, oldTimestamp, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Request expired (replay protection)");
  });

  it("accepts a request within the replay window", () => {
    const body = JSON.stringify({ event: "test" });
    const { signature, timestamp } = signPayload(body, TEST_SECRET);

    // Advance time by 4 minutes (within the 5-minute window)
    vi.advanceTimersByTime(4 * 60 * 1000);

    const result = verifySignature(body, signature, timestamp, TEST_SECRET);
    expect(result.valid).toBe(true);
  });

  it("rejects an invalid timestamp", () => {
    const body = JSON.stringify({ event: "test" });
    const { signature } = signPayload(body, TEST_SECRET);

    const result = verifySignature(body, signature, "not-a-number", TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid timestamp");
  });

  it("rejects an invalid hex signature", () => {
    const body = JSON.stringify({ event: "test" });
    const { timestamp } = signPayload(body, TEST_SECRET);

    const result = verifySignature(body, "zzzz", timestamp, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Signature length mismatch");
  });

  it("produces deterministic signatures for the same input", () => {
    const body = JSON.stringify({ event: "test" });
    const result1 = signPayload(body, TEST_SECRET);
    const result2 = signPayload(body, TEST_SECRET);
    expect(result1.signature).toBe(result2.signature);
    expect(result1.timestamp).toBe(result2.timestamp);
  });
});
