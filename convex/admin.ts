import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdmin } from "./auth";
import schema, { automationEventType } from "./schema";

export const setTrustedLender = mutation({
  args: { clerkId: v.string(), userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    await ctx.db.patch(args.userId, { isTrustedLender: args.trusted });
  },
});

export const setRole = mutation({
  args: {
    clerkId: v.string(),
    userId: v.id("users"),
    role: v.union(v.literal("member"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    await ctx.db.patch(args.userId, { role: args.role });
  },
});

export const listUsers = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    return ctx.db.query("users").collect();
  },
});

export const listAllLoans = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    const requests = await ctx.db.query("borrowRequests").collect();
    return Promise.all(
      requests.map(async (r) => {
        const tool = await ctx.db.get(r.toolId);
        const borrower = await ctx.db.get(r.borrowerId);
        const lender = await ctx.db.get(r.lenderId);
        return {
          ...r,
          toolName: tool?.name ?? "Deleted",
          borrowerName: borrower?.name ?? "Unknown",
          lenderName: lender?.name ?? "Unknown",
        };
      })
    );
  },
});

export const listAutomationActivity = query({
  args: { clerkId: v.string() },
  returns: v.array(schema.doc("automationLogs")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    return ctx.db.query("automationLogs").order("desc").take(50);
  },
});

/** Events n8n never received, and n8n executions that failed, newest first. */
export const automationHealth = query({
  args: { clerkId: v.string() },
  returns: v.object({
    undelivered: v.array(v.object({
      _id: v.id("automationEvents"),
      type: automationEventType,
      status: v.union(v.literal("failed"), v.literal("skipped")),
      attempts: v.number(),
      lastError: v.optional(v.string()),
      toolName: v.string(),
      updatedAt: v.number(),
    })),
    workflowFailures: v.array(schema.doc("automationFailures")),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    const [failed, skipped, workflowFailures] = await Promise.all([
      ctx.db.query("automationEvents").withIndex("by_status", (q) => q.eq("status", "failed")).order("desc").take(20),
      ctx.db.query("automationEvents").withIndex("by_status", (q) => q.eq("status", "skipped")).order("desc").take(20),
      ctx.db.query("automationFailures").order("desc").take(20),
    ]);
    const undelivered = await Promise.all(
      [...failed, ...skipped]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(async (event) => {
          const request = await ctx.db.get("borrowRequests", event.borrowRequestId);
          const tool = request ? await ctx.db.get("tools", request.toolId) : null;
          return {
            _id: event._id,
            type: event.type,
            status: event.status as "failed" | "skipped",
            attempts: event.attempts,
            ...(event.lastError ? { lastError: event.lastError } : {}),
            toolName: tool?.name ?? "Deleted",
            updatedAt: event.updatedAt,
          };
        }),
    );
    return { undelivered, workflowFailures };
  },
});

/** Sends a failed or skipped event to n8n again, starting a fresh round of retries. */
export const retryAutomationEvent = mutation({
  args: { clerkId: v.string(), eventId: v.id("automationEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    const event = await ctx.db.get("automationEvents", args.eventId);
    if (!event || (event.status !== "failed" && event.status !== "skipped")) {
      throw new Error("Only failed or skipped events can be retried.");
    }
    await ctx.db.patch("automationEvents", args.eventId, {
      status: "pending",
      attempts: 0,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId: args.eventId });
    return null;
  },
});
