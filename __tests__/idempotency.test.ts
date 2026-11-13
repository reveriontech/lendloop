import { describe, it, expect } from "vitest";

/*
 * Idempotency tests for the automation log write-back pattern.
 *
 * The Convex writeAutomationLog mutation uses an idempotency key index to
 * prevent duplicate records. These tests verify the key generation logic
 * and deduplication behavior.
 */

function generateIdempotencyKey(
  type: string,
  borrowRequestId: string,
  date: string
): string {
  return `${type}-${borrowRequestId}-${date}`;
}

// Simulates the Convex idempotency check
class IdempotencyStore {
  private keys = new Set<string>();

  insert(key: string): { inserted: boolean } {
    if (this.keys.has(key)) {
      return { inserted: false };
    }
    this.keys.add(key);
    return { inserted: true };
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }
}

describe("Idempotency Key Generation", () => {
  it("generates consistent keys for the same inputs", () => {
    const key1 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");
    const key2 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");
    expect(key1).toBe(key2);
  });

  it("generates different keys for different dates", () => {
    const key1 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");
    const key2 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-16");
    expect(key1).not.toBe(key2);
  });

  it("generates different keys for different request IDs", () => {
    const key1 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");
    const key2 = generateIdempotencyKey("overdue_reminder", "req_456", "2026-06-15");
    expect(key1).not.toBe(key2);
  });

  it("generates different keys for different types", () => {
    const key1 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");
    const key2 = generateIdempotencyKey("status_change", "req_123", "2026-06-15");
    expect(key1).not.toBe(key2);
  });
});

describe("Idempotency Store (simulating Convex behavior)", () => {
  it("accepts the first write", () => {
    const store = new IdempotencyStore();
    const key = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");
    const result = store.insert(key);
    expect(result.inserted).toBe(true);
  });

  it("rejects duplicate writes with the same key", () => {
    const store = new IdempotencyStore();
    const key = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");

    const first = store.insert(key);
    const second = store.insert(key);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
  });

  it("allows same request on different days (new key)", () => {
    const store = new IdempotencyStore();
    const key1 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");
    const key2 = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-16");

    expect(store.insert(key1).inserted).toBe(true);
    expect(store.insert(key2).inserted).toBe(true);
  });

  it("handles multiple retries gracefully", () => {
    const store = new IdempotencyStore();
    const key = generateIdempotencyKey("overdue_reminder", "req_123", "2026-06-15");

    expect(store.insert(key).inserted).toBe(true);
    expect(store.insert(key).inserted).toBe(false);
    expect(store.insert(key).inserted).toBe(false);
    expect(store.insert(key).inserted).toBe(false);
  });
});
