import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./signing";

/*
 * Endpoints called by n8n. Every request must carry a valid HMAC signature made
 * with N8N_TO_CONVEX_SECRET (see convex/signing.ts); anything else gets a 401
 * before any data is read or written.
 */

const http = httpRouter();

const LOG_TYPES = ["notification", "overdue_reminder"] as const;
const LOG_STATUSES = ["sent", "failed"] as const;

/** Returns a 401 response unless the request was signed by n8n. */
async function rejectUnsigned(request: Request, body: string): Promise<Response | null> {
  const result = await verify({
    secret: env.N8N_TO_CONVEX_SECRET,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
    body,
  });
  if (result.valid) return null;
  console.warn(`Rejected n8n request to ${new URL(request.url).pathname}: ${result.reason}`);
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function parseObject(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A non-empty string of at most `max` characters, or undefined. */
function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= max ? value : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find((option) => option === value);
}

const badRequest = (error: string) => Response.json({ error }, { status: 400 });

http.route({
  path: "/api/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const rejected = await rejectUnsigned(request, "");
    if (rejected) return rejected;
    const date = new Date().toISOString().slice(0, 10);
    const loans = await ctx.runQuery(internal.automation.listOverdueForReminder, { today: date });
    return Response.json({ date, loans });
  }),
});

http.route({
  path: "/api/automation-log",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const rejected = await rejectUnsigned(request, raw);
    if (rejected) return rejected;

    const body = parseObject(raw);
    const idempotencyKey = text(body?.idempotencyKey, 200);
    const borrowRequestId = text(body?.borrowRequestId, 100);
    const type = oneOf(body?.type, LOG_TYPES);
    const status = oneOf(body?.status, LOG_STATUSES);
    const message = text(body?.message, 500);
    if (!idempotencyKey || !borrowRequestId || !type || !status || !message) {
      return badRequest("Expected idempotencyKey, borrowRequestId, type, status and message.");
    }

    const id = await ctx.runMutation(internal.automation.recordAutomationLog, {
      idempotencyKey, borrowRequestId, type, status, message,
    });
    return id ? Response.json({ ok: true }) : badRequest("Unknown borrow request.");
  }),
});

http.route({
  path: "/api/automation-failure",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const rejected = await rejectUnsigned(request, raw);
    if (rejected) return rejected;

    const body = parseObject(raw);
    const idempotencyKey = text(body?.idempotencyKey, 200);
    const workflowName = text(body?.workflowName, 200);
    const message = text(body?.message, 500);
    if (!idempotencyKey || !workflowName || !message) {
      return badRequest("Expected idempotencyKey, workflowName and message.");
    }

    const nodeName = text(body?.nodeName, 200);
    const executionId = text(body?.executionId, 100);
    const url = text(body?.executionUrl, 500);
    const executionUrl = url && /^https?:\/\//i.test(url) ? url : undefined;
    await ctx.runMutation(internal.automation.recordWorkflowFailure, {
      idempotencyKey,
      workflowName,
      message,
      ...(nodeName ? { nodeName } : {}),
      ...(executionId ? { executionId } : {}),
      ...(executionUrl ? { executionUrl } : {}),
    });
    return Response.json({ ok: true });
  }),
});

export default http;
