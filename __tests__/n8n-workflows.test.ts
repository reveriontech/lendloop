import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliver } from "../convex/automation";
import { signatureHeaders } from "../convex/signing";
import { callRoute, evaluateExpression, handlerOf, loadWorkflow, runCodeNode, type Workflow } from "./helpers";

/*
 * Checks the exported n8n workflows without an n8n server: their structure, and
 * their Code nodes run against the real Convex signing code and HTTP routes, in
 * both directions.
 */

const CONVEX_TO_N8N = "test-only-convex-to-n8n-secret";
const N8N_TO_CONVEX = "test-only-n8n-to-convex-secret";
const env = { CONVEX_TO_N8N_SECRET: CONVEX_TO_N8N, N8N_TO_CONVEX_SECRET: N8N_TO_CONVEX, CONVEX_SITE_URL: "https://test.convex.site" };

const notification = loadWorkflow("borrow-request-notification.json");
const overdue = loadWorkflow("overdue-reminder.json");
const errors = loadWorkflow("error-workflow.json");

const runQuery = vi.fn();
const runMutation = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("N8N_TO_CONVEX_SECRET", N8N_TO_CONVEX);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Sends a signed body built by a "Sign …" Code node to a Convex route, as the HTTP Request node does. */
function sendToConvex(path: string, signed: Record<string, unknown>) {
  return callRoute({ runQuery, runMutation }, path, "POST", {
    body: signed.body as string,
    headers: { "X-LendLoop-Timestamp": String(signed.timestamp), "X-LendLoop-Signature": String(signed.signature) },
  });
}

describe.each([
  ["request notification", notification],
  ["overdue reminders", overdue],
  ["error handler", errors],
] as [string, Workflow][])("%s export", (_label, workflow) => {
  it("has unique node names and ids, and every connection points at a real node", () => {
    const names = workflow.nodes.map((node) => node.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(workflow.nodes.map((node) => node.id)).size).toBe(names.length);
    for (const [from, { main }] of Object.entries(workflow.connections)) {
      expect(names).toContain(from);
      for (const target of main.flat()) expect(names).toContain(target.node);
    }
  });

  it("reads only the documented environment variables and holds no secrets", () => {
    // Sticky notes are documentation; everything else is checked.
    const working = workflow.nodes.filter((node) => node.type !== "n8n-nodes-base.stickyNote");
    const text = JSON.stringify(working);
    for (const name of text.match(/\$env\.[A-Z0-9_]+/g) ?? []) {
      expect(["$env.CONVEX_SITE_URL", "$env.CONVEX_TO_N8N_SECRET", "$env.N8N_TO_CONVEX_SECRET", "$env.LENDLOOP_EMAIL_FROM"]).toContain(name);
    }
    expect(text).not.toMatch(/[0-9a-f]{40,}/i);
    expect(text).not.toMatch(/Bearer /);
    expect(text).not.toMatch(/\bre_[A-Za-z0-9]{8,}/);
    for (const node of working) expect(node, node.name).not.toHaveProperty("credentials");
    expect(workflow.settings.errorWorkflow).toBeUndefined();
  });

  it("retries every HTTP request", () => {
    for (const node of workflow.nodes.filter((candidate) => candidate.type === "n8n-nodes-base.httpRequest")) {
      expect(node.retryOnFail, node.name).toBe(true);
      expect(node.maxTries, node.name).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("request notification workflow", () => {
  const payload = {
    eventId: "evt_1",
    type: "request.approved",
    occurredAt: "2026-11-19T10:00:00.000Z",
    requestId: "req_1",
    recipient: { role: "borrower", name: "Sam", email: "sam@example.com" },
    tool: { name: "Cordless drill" },
    loan: { startDate: "2026-11-20", endDate: "2026-11-24", dueDate: "2026-11-24" },
  };

  /** What the Webhook node hands the next node: lower-cased headers and the parsed body. */
  function receive(body: string, headers: Record<string, string>) {
    const lowerCased = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
    return runCodeNode(notification, "Verify signature", [{ headers: lowerCased, body: JSON.parse(body) }], env)[0];
  }

  it("accepts an event exactly as Convex's deliver action sends it", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.test/webhook/lendloop-borrow-webhook");
    vi.stubEnv("CONVEX_TO_N8N_SECRET", CONVEX_TO_N8N);
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await handlerOf(deliver)({ runQuery: vi.fn(async () => ({ kind: "send", payload })), runMutation }, { eventId: "evt_1" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(receive(init.body, init.headers)).toEqual({ valid: true, ...payload });
  });

  it("rejects tampered, stale and wrongly signed events", async () => {
    const body = JSON.stringify(payload);
    const tampered = JSON.stringify({ ...payload, recipient: { ...payload.recipient, email: "attacker@example.com" } });
    expect(receive(tampered, await signatureHeaders(CONVEX_TO_N8N, body))).toEqual({ valid: false, reason: "signature mismatch" });
    expect(receive(body, await signatureHeaders(N8N_TO_CONVEX, body))).toEqual({ valid: false, reason: "signature mismatch" });
    expect(receive(body, await signatureHeaders(CONVEX_TO_N8N, body, Date.now() - 6 * 60_000))).toMatchObject({ valid: false });
    expect(receive(body, {})).toEqual({ valid: false, reason: "missing timestamp" });
  });

  it("answers Convex from a Respond node on both branches, before notifying", () => {
    const webhook = notification.nodes.find((node) => node.type === "n8n-nodes-base.webhook");
    expect(webhook?.parameters).toMatchObject({ httpMethod: "POST", path: "lendloop-borrow-webhook", responseMode: "responseNode" });
    const [valid, invalid] = notification.connections["Signature valid?"].main;
    expect(valid.map((target) => target.node)).toEqual(["Accept (202)"]);
    expect(invalid.map((target) => target.node)).toEqual(["Reject (401)"]);
    expect(notification.connections["Accept (202)"].main[0][0].node).toBe("Skip already-handled events");
    expect(notification.nodes.find((node) => node.name === "Skip already-handled events")?.parameters).toMatchObject({
      operation: "removeItemsSeenInPreviousExecutions",
      dedupeValue: "={{ $json.eventId }}",
    });
  });

  it("writes a message for every event type, addressed only to the recipient", () => {
    const types = ["request.created", "request.cancelled", "request.approved", "request.declined", "loan.borrowed", "loan.returned"];
    for (const type of types) {
      const [message] = runCodeNode(notification, "Compose message", [{ ...payload, type }], env);
      expect(message.to).toBe("sam@example.com");
      expect(String(message.subject)).toContain("Cordless drill");
      expect(`${message.subject} ${message.text} ${message.activity}`).not.toMatch(/undefined|null/);
    }
    const declined = { ...payload, type: "request.declined", loan: { ...payload.loan, declineReason: "Away that week" } };
    expect(runCodeNode(notification, "Compose message", [declined], env)[0].text).toContain("Reason: Away that week");
    expect(() => runCodeNode(notification, "Compose message", [{ ...payload, type: "loan.lost" }], env)).toThrow(/Unknown/);
  });

  it("logs the notification in LendLoop with a signed, idempotent write-back", async () => {
    const [message] = runCodeNode(notification, "Compose message", [payload], env);
    // After the Resend node, $json is Resend's response; the Code node reads the message by node name.
    const [signed] = runCodeNode(notification, "Sign activity log", [{ id: "resend-email-id" }], env, { "Compose message": message });

    runMutation.mockResolvedValueOnce("log_1");
    expect((await sendToConvex("/api/automation-log", signed)).status).toBe(200);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: "notify:evt_1",
      borrowRequestId: "req_1",
      type: "notification",
      status: "sent",
      message: "Borrower notified of the approval",
    });
  });
});

describe("overdue reminders workflow", () => {
  const loan = {
    requestId: "req_1",
    idempotencyKey: "overdue:req_1:2026-11-19",
    borrower: { name: "Sam", email: "sam@example.com" },
    toolName: "Cordless drill",
    dueDate: "2026-11-17",
    daysOverdue: 2,
  };

  it("fetches overdue loans with a request Convex accepts, then reminds and reports each one", async () => {
    const [signedGet] = runCodeNode(overdue, "Sign request", [{}], env);
    runQuery.mockResolvedValueOnce([loan]);
    const response = await callRoute({ runQuery, runMutation }, "/api/overdue-loans", "GET", {
      headers: { "X-LendLoop-Timestamp": String(signedGet.timestamp), "X-LendLoop-Signature": String(signedGet.signature) },
    });
    expect(response.status).toBe(200);

    const items = runCodeNode(overdue, "One item per loan", [await response.json()], env);
    expect(items).toEqual([loan]);
    const [reminder] = runCodeNode(overdue, "Compose reminder", items, env);
    expect(reminder).toMatchObject({ to: "sam@example.com", activity: "Overdue reminder sent to the borrower (2 days late)" });
    expect(reminder.text).toContain("2 days ago");

    const [signed] = runCodeNode(overdue, "Sign status update", [{ id: "resend-email-id" }], env, { "Compose reminder": reminder });
    runMutation.mockResolvedValueOnce("log_1");
    expect((await sendToConvex("/api/automation-log", signed)).status).toBe(200);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: "overdue:req_1:2026-11-19",
      borrowRequestId: "req_1",
      type: "overdue_reminder",
      status: "sent",
      message: "Overdue reminder sent to the borrower (2 days late)",
    });
  });

  it("reports a reminder that failed to send as failed, and keeps going", () => {
    const send = overdue.nodes.find((node) => node.name === "Send reminder email (Resend)");
    expect(send).toMatchObject({ retryOnFail: true, onError: "continueRegularOutput" });
    const [reminder] = runCodeNode(overdue, "Compose reminder", [loan], env);
    const [signed] = runCodeNode(overdue, "Sign status update", [{ error: "SMTP timeout" }], env, { "Compose reminder": reminder });
    expect(JSON.parse(String(signed.body))).toMatchObject({ status: "failed", idempotencyKey: loan.idempotencyKey });
  });

  it("ends quietly when nothing is overdue, and says '1 day' for a single day", () => {
    expect(runCodeNode(overdue, "One item per loan", [{ date: "2026-11-19", loans: [] }], env)).toEqual([]);
    const [reminder] = runCodeNode(overdue, "Compose reminder", [{ ...loan, daysOverdue: 1 }], env);
    expect(reminder.text).toContain("(1 day ago)");
  });
});

type ResendParameters = {
  method: string;
  url: string;
  jsonBody: string;
  headerParameters: { parameters: { name: string; value: string }[] };
};

describe.each([
  ["request notification", notification, "Send email (Resend)", { eventId: "evt_1" }, "notify-evt_1"],
  ["overdue reminders", overdue, "Send reminder email (Resend)", { idempotencyKey: "overdue:req_1:2026-11-19" }, "overdue:req_1:2026-11-19"],
] as [string, Workflow, string, Record<string, string>, string][])("%s email via Resend", (_label, workflow, nodeName, ids, expectedKey) => {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName)!;
  const parameters = node.parameters as ResendParameters;
  const email = { ...ids, to: "sam@example.com", subject: "Approved: Cordless drill", text: "Hi Sam, your request was approved." };

  it("posts to Resend with the API key from an n8n credential, never from the file", () => {
    expect(parameters).toMatchObject({
      method: "POST",
      url: "https://api.resend.com/emails",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    });
    expect(node).not.toHaveProperty("credentials");
    expect(node).toMatchObject({ retryOnFail: true });
  });

  it("sends only the recipient, subject and text, from the default or the configured sender", () => {
    const body = (fromEnv: Record<string, string>) => JSON.parse(String(evaluateExpression(parameters.jsonBody, email, fromEnv)));
    expect(body({})).toEqual({ from: "LendLoop <onboarding@resend.dev>", to: ["sam@example.com"], subject: email.subject, text: email.text });
    expect(body({ LENDLOOP_EMAIL_FROM: "LendLoop <hello@lendloop.example>" }).from).toBe("LendLoop <hello@lendloop.example>");
  });

  it("sends an Idempotency-Key, so Resend drops a repeat of the same email", () => {
    const header = parameters.headerParameters.parameters.find((candidate) => candidate.name === "Idempotency-Key");
    expect(evaluateExpression(header!.value, email, {})).toBe(expectedKey);
  });
});

describe("error handler workflow", () => {
  it("turns an Error Trigger payload into a failure report Convex stores", async () => {
    const trigger = {
      execution: {
        id: "231",
        url: "https://n8n.test/workflow/7/executions/231",
        error: { message: "Request failed with status code 401" },
        lastNodeExecuted: "Fetch overdue loans",
        mode: "trigger",
      },
      workflow: { id: "7", name: "LendLoop - Overdue reminders" },
    };
    const [signed] = runCodeNode(errors, "Build failure report", [trigger], env);
    runMutation.mockResolvedValueOnce("failure_1");
    expect((await sendToConvex("/api/automation-failure", signed)).status).toBe(200);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: "n8n-error:7:231",
      workflowName: "LendLoop - Overdue reminders",
      message: "Request failed with status code 401",
      nodeName: "Fetch overdue loans",
      executionId: "231",
      executionUrl: "https://n8n.test/workflow/7/executions/231",
    });
  });

  it("still reports a failure that happened in the trigger node", () => {
    const [signed] = runCodeNode(errors, "Build failure report", [{
      trigger: { error: { message: "Schedule could not start" } },
      workflow: { id: "7", name: "LendLoop - Overdue reminders" },
    }], env);
    expect(JSON.parse(String(signed.body))).toMatchObject({ workflowName: "LendLoop - Overdue reminders", message: "Schedule could not start" });
  });
});
