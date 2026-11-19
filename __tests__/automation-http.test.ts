import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signatureHeaders } from "../convex/signing";
import { callRoute } from "./helpers";

const N8N_TO_CONVEX = "test-only-n8n-to-convex-secret";
const CONVEX_TO_N8N = "test-only-convex-to-n8n-secret";
const runQuery = vi.fn();
const runMutation = vi.fn();
const ctx = { runQuery, runMutation };

async function get(path: string, secret = N8N_TO_CONVEX, now = Date.now()) {
  return callRoute(ctx, path, "GET", { headers: await signatureHeaders(secret, "", now) });
}

async function post(path: string, body: unknown, secret = N8N_TO_CONVEX) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return callRoute(ctx, path, "POST", { body: text, headers: await signatureHeaders(secret, text) });
}

beforeEach(() => {
  vi.stubEnv("N8N_TO_CONVEX_SECRET", N8N_TO_CONVEX);
  vi.clearAllMocks();
});

afterEach(() => vi.unstubAllEnvs());

const log = {
  idempotencyKey: "overdue:req_1:2026-11-19",
  borrowRequestId: "req_1",
  type: "overdue_reminder",
  status: "sent",
  message: "Overdue reminder sent to the borrower (2 days late)",
};

describe("Convex automation endpoints", () => {
  it("rejects unsigned, stale, tampered and wrongly signed requests before touching data", async () => {
    expect((await callRoute(ctx, "/api/overdue-loans", "GET")).status).toBe(401);
    expect((await get("/api/overdue-loans", N8N_TO_CONVEX, Date.now() - 6 * 60_000)).status).toBe(401);
    // A secret from the other direction can't sign requests to Convex.
    expect((await get("/api/overdue-loans", CONVEX_TO_N8N)).status).toBe(401);
    expect((await post("/api/automation-log", log, CONVEX_TO_N8N)).status).toBe(401);

    const headers = await signatureHeaders(N8N_TO_CONVEX, JSON.stringify(log));
    const tampered = JSON.stringify({ ...log, status: "failed" });
    expect((await callRoute(ctx, "/api/automation-log", "POST", { headers, body: tampered })).status).toBe(401);

    expect(runQuery).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("fails closed when N8N_TO_CONVEX_SECRET isn't set on the deployment", async () => {
    vi.stubEnv("N8N_TO_CONVEX_SECRET", "");
    expect((await get("/api/overdue-loans")).status).toBe(401);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it("returns today's overdue loans to a signed request", async () => {
    runQuery.mockResolvedValueOnce([]);
    const response = await get("/api/overdue-loans");
    expect(response.status).toBe(200);
    const today = new Date().toISOString().slice(0, 10);
    expect(await response.json()).toEqual({ date: today, loans: [] });
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), { today });
  });

  it("validates a signed activity log before writing it", async () => {
    expect((await post("/api/automation-log", "{")).status).toBe(400);
    expect((await post("/api/automation-log", { ...log, type: "sms" })).status).toBe(400);
    expect((await post("/api/automation-log", { ...log, status: "maybe" })).status).toBe(400);
    expect((await post("/api/automation-log", { ...log, message: "x".repeat(501) })).status).toBe(400);
    expect(runMutation).not.toHaveBeenCalled();

    runMutation.mockResolvedValueOnce("log_1");
    expect((await post("/api/automation-log", log)).status).toBe(200);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), log);
  });

  it("answers 400 for an unknown borrow request", async () => {
    runMutation.mockResolvedValueOnce(null);
    expect((await post("/api/automation-log", log)).status).toBe(400);
  });

  it("records a signed workflow failure, dropping links that aren't http(s)", async () => {
    const failure = {
      idempotencyKey: "n8n-error:7:231",
      workflowName: "LendLoop - Overdue reminders",
      message: "Request failed with status code 401",
      nodeName: "Fetch overdue loans",
      executionId: "231",
      executionUrl: "javascript:alert(1)",
    };
    expect((await post("/api/automation-failure", { workflowName: "x" })).status).toBe(400);
    runMutation.mockResolvedValueOnce("failure_1");
    expect((await post("/api/automation-failure", failure)).status).toBe(200);
    const { executionUrl, ...stored } = failure;
    expect(executionUrl).toBeDefined();
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), stored);
  });
});
