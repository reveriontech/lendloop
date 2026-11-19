import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { automationEventType, automationLogStatus, automationLogType } from "./schema";
import { signatureHeaders } from "./signing";

/*
 * Convex ⇄ n8n automation.
 *
 * Request notifications: a borrow request mutation calls enqueueAutomationEvent,
 * which writes an outbox row and schedules `deliver` in the same transaction.
 * `deliver` signs the event and POSTs it to n8n, retrying with backoff. After
 * MAX_DELIVERY_ATTEMPTS failures the row is marked "failed" and shown on the
 * Admin page.
 *
 * Overdue reminders: n8n calls GET /api/overdue-loans (convex/http.ts), which
 * runs listOverdueForReminder, then reports each reminder through
 * POST /api/automation-log → recordAutomationLog.
 */

export type AutomationEventType = Infer<typeof automationEventType>;
type RecipientRole = "lender" | "borrower";

/** Who each event notifies. Only that person's first name and email are sent to n8n. */
export const RECIPIENT_ROLE: Record<AutomationEventType, RecipientRole> = {
  "request.created": "lender",
  "request.cancelled": "lender",
  "request.approved": "borrower",
  "request.declined": "borrower",
  "loan.borrowed": "borrower",
  "loan.returned": "borrower",
};

export const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 8 * 60_000, 30 * 60_000];

/** Wait before the next attempt after `failedAttempts` failures, or null to give up (about 40 minutes in all). */
export function retryDelayMs(failedAttempts: number): number | null {
  return failedAttempts < MAX_DELIVERY_ATTEMPTS ? RETRY_DELAYS_MS[failedAttempts - 1] : null;
}

/** One reminder per loan per UTC day: re-runs and retries reuse the same key. */
export function overdueReminderKey(requestId: string, today: string): string {
  return `overdue:${requestId}:${today}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

/** Upper bound on reminders per run, so one request stays within Convex read limits. */
export const MAX_OVERDUE_PER_RUN = 200;

/**
 * Records an event for n8n. Call it from the mutation that changes the request:
 * the outbox row and the scheduled delivery commit only if that mutation does.
 */
export async function enqueueAutomationEvent(
  ctx: MutationCtx,
  borrowRequestId: Id<"borrowRequests">,
  type: AutomationEventType,
): Promise<void> {
  const now = Date.now();
  const eventId = await ctx.db.insert("automationEvents", {
    borrowRequestId,
    type,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
}

const deliveryPayload = v.object({
  eventId: v.id("automationEvents"),
  type: automationEventType,
  occurredAt: v.string(),
  requestId: v.id("borrowRequests"),
  recipient: v.object({
    role: v.union(v.literal("lender"), v.literal("borrower")),
    name: v.string(),
    email: v.string(),
  }),
  tool: v.object({ name: v.string() }),
  loan: v.object({
    startDate: v.string(),
    endDate: v.string(),
    dueDate: v.string(),
    declineReason: v.optional(v.string()),
  }),
});

const preparedDelivery = v.union(
  v.object({ kind: v.literal("send"), payload: deliveryPayload }),
  v.object({ kind: v.literal("skip"), reason: v.string() }),
  v.null(),
);
type PreparedDelivery = Infer<typeof preparedDelivery>;

/** Builds the payload from current data. Returns null once the event is no longer pending. */
export const prepareDelivery = internalQuery({
  args: { eventId: v.id("automationEvents") },
  returns: preparedDelivery,
  handler: async (ctx, { eventId }): Promise<PreparedDelivery> => {
    const event = await ctx.db.get("automationEvents", eventId);
    if (!event || event.status !== "pending") return null;
    const request = await ctx.db.get("borrowRequests", event.borrowRequestId);
    if (!request) return { kind: "skip", reason: "The borrow request no longer exists." };

    const role = RECIPIENT_ROLE[event.type];
    const [recipient, tool] = await Promise.all([
      ctx.db.get("users", role === "lender" ? request.lenderId : request.borrowerId),
      ctx.db.get("tools", request.toolId),
    ]);
    if (!recipient) return { kind: "skip", reason: `The ${role} no longer exists.` };

    return {
      kind: "send",
      payload: {
        eventId,
        type: event.type,
        occurredAt: new Date(event.createdAt).toISOString(),
        requestId: request._id,
        recipient: { role, name: firstName(recipient.name), email: recipient.email },
        tool: { name: tool?.name ?? "the tool" },
        loan: {
          startDate: request.startDate,
          endDate: request.endDate,
          dueDate: request.dueDate,
          ...(event.type === "request.declined" && request.declineReason
            ? { declineReason: request.declineReason }
            : {}),
        },
      },
    };
  },
});

/** POSTs a signed body. Returns null on a 2xx response, otherwise what went wrong. */
async function post(url: string, body: string, headers: Record<string, string>): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      signal: controller.signal,
    });
    return response.ok ? null : `n8n responded with HTTP ${response.status}`;
  } catch (cause) {
    return cause instanceof Error ? cause.message : "Network error";
  } finally {
    clearTimeout(timer);
  }
}

export const deliver = internalAction({
  args: { eventId: v.id("automationEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const prepared: PreparedDelivery = await ctx.runQuery(internal.automation.prepareDelivery, { eventId });
    if (prepared === null) return null;
    if (prepared.kind === "skip") {
      await ctx.runMutation(internal.automation.markSkipped, { eventId, reason: prepared.reason });
      return null;
    }

    const url = env.N8N_WEBHOOK_URL;
    const secret = env.CONVEX_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.automation.markSkipped, {
        eventId,
        reason: "N8N_WEBHOOK_URL or CONVEX_TO_N8N_SECRET is not set on the Convex deployment.",
      });
      return null;
    }

    const body = JSON.stringify(prepared.payload);
    const error = await post(url, body, await signatureHeaders(secret, body));
    if (error === null) {
      await ctx.runMutation(internal.automation.markDelivered, { eventId });
    } else {
      await ctx.runMutation(internal.automation.recordDeliveryFailure, { eventId, error });
    }
    return null;
  },
});

export const markDelivered = internalMutation({
  args: { eventId: v.id("automationEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("automationEvents", eventId);
    if (!event || event.status !== "pending") return null;
    await ctx.db.patch("automationEvents", eventId, {
      status: "delivered",
      attempts: event.attempts + 1,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markSkipped = internalMutation({
  args: { eventId: v.id("automationEvents"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, reason }) => {
    const event = await ctx.db.get("automationEvents", eventId);
    if (!event || event.status !== "pending") return null;
    await ctx.db.patch("automationEvents", eventId, { status: "skipped", lastError: reason, updatedAt: Date.now() });
    return null;
  },
});

/** Schedules the next attempt with backoff, or marks the event failed after the last one. */
export const recordDeliveryFailure = internalMutation({
  args: { eventId: v.id("automationEvents"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, error }) => {
    const event = await ctx.db.get("automationEvents", eventId);
    if (!event || event.status !== "pending") return null;
    const attempts = event.attempts + 1;
    const delay = retryDelayMs(attempts);
    await ctx.db.patch("automationEvents", eventId, {
      status: delay === null ? "failed" : "pending",
      attempts,
      lastError: error.slice(0, 500),
      updatedAt: Date.now(),
    });
    if (delay !== null) await ctx.scheduler.runAfter(delay, internal.automation.deliver, { eventId });
    return null;
  },
});

const overdueLoan = v.object({
  requestId: v.id("borrowRequests"),
  idempotencyKey: v.string(),
  borrower: v.object({ name: v.string(), email: v.string() }),
  toolName: v.string(),
  dueDate: v.string(),
  daysOverdue: v.number(),
});

/**
 * Loans past their due date that haven't had a reminder sent today, with only
 * the fields the reminder needs. Skipping already-sent reminders means a re-run
 * of the n8n workflow never reminds the same borrower twice in one day.
 */
export const listOverdueForReminder = internalQuery({
  args: { today: v.string() },
  returns: v.array(overdueLoan),
  handler: async (ctx, { today }) => {
    const loans = [];
    for (const status of ["borrowed", "overdue"]) {
      loans.push(
        ...(await ctx.db
          .query("borrowRequests")
          .withIndex("by_status_dueDate", (q) => q.eq("status", status).lt("dueDate", today))
          .take(MAX_OVERDUE_PER_RUN)),
      );
    }

    const reminders: Infer<typeof overdueLoan>[] = [];
    for (const loan of loans.slice(0, MAX_OVERDUE_PER_RUN)) {
      const idempotencyKey = overdueReminderKey(loan._id, today);
      const previous = await ctx.db
        .query("automationLogs")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      if (previous?.status === "sent") continue;

      const [borrower, tool] = await Promise.all([
        ctx.db.get("users", loan.borrowerId),
        ctx.db.get("tools", loan.toolId),
      ]);
      if (!borrower) continue;
      reminders.push({
        requestId: loan._id,
        idempotencyKey,
        borrower: { name: firstName(borrower.name), email: borrower.email },
        toolName: tool?.name ?? "the tool",
        dueDate: loan.dueDate,
        daysOverdue: daysBetween(loan.dueDate, today),
      });
    }
    return reminders;
  },
});

/**
 * Idempotent write-back from n8n. The same key never creates a second row;
 * a later "sent" upgrades an earlier "failed", never the other way round.
 * Returns null when the borrow request id is unknown.
 */
export const recordAutomationLog = internalMutation({
  args: {
    idempotencyKey: v.string(),
    borrowRequestId: v.string(),
    type: automationLogType,
    status: automationLogStatus,
    message: v.string(),
  },
  returns: v.union(v.id("automationLogs"), v.null()),
  handler: async (ctx, args) => {
    const borrowRequestId = ctx.db.normalizeId("borrowRequests", args.borrowRequestId);
    if (!borrowRequestId || !(await ctx.db.get("borrowRequests", borrowRequestId))) return null;

    const existing = await ctx.db
      .query("automationLogs")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    const now = Date.now();
    if (existing) {
      if (existing.status === "failed" && args.status === "sent") {
        await ctx.db.patch("automationLogs", existing._id, { status: "sent", message: args.message, updatedAt: now });
      }
      return existing._id;
    }
    return ctx.db.insert("automationLogs", {
      borrowRequestId,
      type: args.type,
      status: args.status,
      message: args.message,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Called by the n8n error workflow. Idempotent per n8n execution. */
export const recordWorkflowFailure = internalMutation({
  args: {
    idempotencyKey: v.string(),
    workflowName: v.string(),
    message: v.string(),
    nodeName: v.optional(v.string()),
    executionId: v.optional(v.string()),
    executionUrl: v.optional(v.string()),
  },
  returns: v.id("automationFailures"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationFailures")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("automationFailures", { ...args, createdAt: Date.now() });
  },
});
