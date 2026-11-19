import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deliver,
  enqueueAutomationEvent,
  MAX_DELIVERY_ATTEMPTS,
  prepareDelivery,
  RECIPIENT_ROLE,
  recordDeliveryFailure,
  retryDelayMs,
} from "../convex/automation";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import { verify } from "../convex/signing";
import { fakeDb, handlerOf } from "./helpers";

const SECRET = "test-only-convex-to-n8n-secret";

function seed(eventType = "request.approved", extra: Record<string, unknown> = {}) {
  return fakeDb({
    users: [
      { _id: "lender_1", name: "Alex Rivera", email: "alex@example.com" },
      { _id: "borrower_1", name: "Sam Lee", email: "sam@example.com" },
    ],
    tools: [{ _id: "tool_1", name: "Cordless drill" }],
    borrowRequests: [{
      _id: "req_1", toolId: "tool_1", lenderId: "lender_1", borrowerId: "borrower_1",
      startDate: "2026-11-20", endDate: "2026-11-24", dueDate: "2026-11-24", declineReason: "Needed it that week", ...extra,
    }],
    automationEvents: [{
      _id: "evt_1", borrowRequestId: "req_1", type: eventType, status: "pending", attempts: 0,
      createdAt: Date.parse("2026-11-19T10:00:00Z"),
    }],
  });
}

describe("who each event notifies", () => {
  it("tells the lender about new and cancelled requests, and the borrower about everything else", () => {
    expect(RECIPIENT_ROLE).toEqual({
      "request.created": "lender",
      "request.cancelled": "lender",
      "request.approved": "borrower",
      "request.declined": "borrower",
      "loan.borrowed": "borrower",
      "loan.returned": "borrower",
    });
  });
});

describe("delivery payload", () => {
  it("carries only the recipient's first name and email, never the other person's details", async () => {
    const { db } = seed("request.approved");
    const prepared = await handlerOf(prepareDelivery)({ db }, { eventId: "evt_1" });
    expect(prepared).toEqual({
      kind: "send",
      payload: expect.objectContaining({
        eventId: "evt_1",
        type: "request.approved",
        occurredAt: "2026-11-19T10:00:00.000Z",
        requestId: "req_1",
        recipient: { role: "borrower", name: "Sam", email: "sam@example.com" },
        tool: { name: "Cordless drill" },
        loan: { startDate: "2026-11-20", endDate: "2026-11-24", dueDate: "2026-11-24" },
      }),
    });
    const text = JSON.stringify(prepared);
    expect(text).not.toContain("alex@example.com");
    expect(text).not.toContain("Rivera");
    expect(text).not.toContain("Needed it that week");
  });

  it("includes the decline reason only for declined requests", async () => {
    const { db } = seed("request.declined");
    const prepared = (await handlerOf(prepareDelivery)({ db }, { eventId: "evt_1" })) as { payload: { loan: object } };
    expect(prepared.payload.loan).toMatchObject({ declineReason: "Needed it that week" });
  });

  it("returns nothing once the event is no longer pending", async () => {
    const { db } = seed();
    await db.patch("automationEvents", "evt_1", { status: "delivered" });
    expect(await handlerOf(prepareDelivery)({ db }, { eventId: "evt_1" })).toBeNull();
  });
});

describe("outbox", () => {
  it("records a pending event and schedules its delivery in the same transaction", async () => {
    const { db, rows } = fakeDb();
    const scheduler = { runAfter: vi.fn() };
    await enqueueAutomationEvent({ db, scheduler } as unknown as MutationCtx, "req_1" as Id<"borrowRequests">, "request.created");
    const [event] = rows("automationEvents");
    expect(event).toMatchObject({ borrowRequestId: "req_1", type: "request.created", status: "pending", attempts: 0 });
    expect(scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { eventId: event._id });
  });
});

describe("retries", () => {
  it("backs off 30 s, 2 min, 8 min and 30 min, then gives up after the fifth attempt", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([30_000, 120_000, 480_000, 1_800_000, null]);
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
  });

  it("reschedules each failure and marks the event failed after the last attempt", async () => {
    const { db, rows } = seed();
    const scheduler = { runAfter: vi.fn() };
    for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
      await handlerOf(recordDeliveryFailure)({ db, scheduler }, { eventId: "evt_1", error: "n8n responded with HTTP 503" });
    }
    expect(scheduler.runAfter.mock.calls.map(([delay]) => delay)).toEqual([30_000, 120_000, 480_000, 1_800_000]);
    expect(rows("automationEvents")[0]).toMatchObject({ status: "failed", attempts: 5, lastError: "n8n responded with HTTP 503" });

    await handlerOf(recordDeliveryFailure)({ db, scheduler }, { eventId: "evt_1", error: "late" });
    expect(rows("automationEvents")[0]).toMatchObject({ attempts: 5, lastError: "n8n responded with HTTP 503" });
  });
});

describe("deliver", () => {
  const payload = { eventId: "evt_1", type: "request.created" };
  const runQuery = vi.fn(async () => ({ kind: "send", payload }));
  const runMutation = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.test/webhook/lendloop-borrow-webhook");
    vi.stubEnv("CONVEX_TO_N8N_SECRET", SECRET);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("POSTs the payload signed with CONVEX_TO_N8N_SECRET and marks it delivered", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await handlerOf(deliver)({ runQuery, runMutation }, { eventId: "evt_1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://n8n.test/webhook/lendloop-borrow-webhook");
    expect(init.body).toBe(JSON.stringify(payload));
    const result = await verify({
      secret: SECRET,
      timestamp: init.headers["X-LendLoop-Timestamp"],
      signature: init.headers["X-LendLoop-Signature"],
      body: init.body as string,
    });
    expect(result).toEqual({ valid: true });
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), { eventId: "evt_1" });
  });

  it("records an HTTP error or a network failure for a retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await handlerOf(deliver)({ runQuery, runMutation }, { eventId: "evt_1" });
    expect(runMutation).toHaveBeenLastCalledWith(expect.anything(), { eventId: "evt_1", error: "n8n responded with HTTP 500" });

    fetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND n8n.test"));
    await handlerOf(deliver)({ runQuery, runMutation }, { eventId: "evt_1" });
    expect(runMutation).toHaveBeenLastCalledWith(expect.anything(), { eventId: "evt_1", error: "getaddrinfo ENOTFOUND n8n.test" });
  });

  it("marks the event skipped, without calling out, when n8n isn't configured", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    await handlerOf(deliver)({ runQuery, runMutation }, { eventId: "evt_1" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      eventId: "evt_1",
      reason: expect.stringContaining("N8N_WEBHOOK_URL"),
    });
  });

  it("does nothing for an event that was already handled", async () => {
    runQuery.mockResolvedValueOnce(null as never);
    await handlerOf(deliver)({ runQuery, runMutation }, { eventId: "evt_1" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });
});
