import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentDueDate } from "./loanDates";
import { type Doc } from "./_generated/dataModel";
import { requireUser, requireAdmin } from "./auth";
import { enqueueAutomationEvent } from "./automation";
import schema from "./schema";

export const create = mutation({
  args: {
    clerkId: v.string(),
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.id("borrowRequests"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemoved) throw new Error("Tool not found.");
    if (tool.ownerId === user._id) throw new Error("You cannot borrow your own tool.");

    const today = new Date().toISOString().slice(0, 10);
    if (!isDate(args.startDate) || !isDate(args.endDate) || args.startDate < today || args.endDate < args.startDate) {
      throw new Error("Choose valid dates starting today or later.");
    }
    if (!tool.isAvailable) {
      const dueDate = await getCurrentDueDate(ctx, tool._id);
      if (!dueDate || args.startDate <= dueDate) {
        throw new Error("Choose a start date after the current loan?s due date.");
      }
    }
    const note = args.note?.trim();
    if (note && note.length > 500) throw new Error("Keep your note to 500 characters.");

    const now = Date.now();
    const requestId = await ctx.db.insert("borrowRequests", {
      toolId: args.toolId,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      status: "pending",
      startDate: args.startDate,
      endDate: args.endDate,
      dueDate: args.endDate,
      ...(note ? { note } : {}),
      createdAt: now,
      updatedAt: now,
    });
    await enqueueAutomationEvent(ctx, requestId, "request.created");
    return requestId;
  },
});

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const cancel = mutation({
  args: { clerkId: v.string(), requestId: v.id("borrowRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.borrowerId !== user._id || request.status !== "pending") {
      throw new Error("Only your pending requests can be cancelled.");
    }
    await ctx.db.patch(args.requestId, { status: "cancelled", updatedAt: Date.now() });
    await enqueueAutomationEvent(ctx, args.requestId, "request.cancelled");
    return null;
  },
});

export const approve = mutation({
  args: { clerkId: v.string(), requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found.");
    if (request.lenderId !== user._id && user.role !== "admin") {
      throw new Error("Only the tool owner can approve requests.");
    }
    if (request.status !== "pending") throw new Error("Request is not pending.");
    const tool = await ctx.db.get(request.toolId);
    if (!tool || tool.isRemoved || !tool.isAvailable) throw new Error("This tool is unavailable.");
    await ctx.db.patch(args.requestId, { status: "approved", updatedAt: Date.now() });
    await ctx.db.patch(request.toolId, { isAvailable: false });
    await enqueueAutomationEvent(ctx, args.requestId, "request.approved");
  },
});

export const decline = mutation({
  args: {
    clerkId: v.string(),
    requestId: v.id("borrowRequests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found.");
    if (request.lenderId !== user._id && user.role !== "admin") {
      throw new Error("Only the tool owner can decline requests.");
    }
    if (request.status !== "pending") throw new Error("Request is not pending.");
    await ctx.db.patch(args.requestId, {
      status: "declined",
      declineReason: args.reason,
      updatedAt: Date.now(),
    });
    await enqueueAutomationEvent(ctx, args.requestId, "request.declined");
  },
});

export const markBorrowed = mutation({
  args: { clerkId: v.string(), requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found.");
    if (request.lenderId !== user._id && user.role !== "admin") {
      throw new Error("Only the tool owner can mark as borrowed.");
    }
    if (request.status !== "approved") throw new Error("Request must be approved first.");
    await ctx.db.patch(args.requestId, { status: "borrowed", updatedAt: Date.now() });
    await enqueueAutomationEvent(ctx, args.requestId, "loan.borrowed");
  },
});

export const markReturned = mutation({
  args: { clerkId: v.string(), requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found.");
    if (request.lenderId !== user._id && user.role !== "admin") {
      throw new Error("Only the tool owner can mark as returned.");
    }
    if (request.status !== "borrowed" && request.status !== "overdue") {
      throw new Error("Tool must be currently borrowed or overdue.");
    }
    await ctx.db.patch(args.requestId, {
      status: "returned",
      returnedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(request.toolId, { isAvailable: true });
    await enqueueAutomationEvent(ctx, args.requestId, "loan.returned");
  },
});

export const listByBorrower = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const requests = await ctx.db
      .query("borrowRequests")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .collect();
    return enrichRequests(ctx, requests, user._id);
  },
});

export const listByLender = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const requests = await ctx.db
      .query("borrowRequests")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .collect();
    return enrichRequests(ctx, requests, user._id);
  },
});

export const listAll = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.clerkId);
    const requests = await ctx.db.query("borrowRequests").collect();
    return enrichRequests(ctx, requests, user._id);
  },
});

/** Latest automation activity on one loan, newest first, for its borrower, its lender or an admin. */
export const getAutomationLogs = query({
  args: { requestId: v.id("borrowRequests") },
  returns: v.array(schema.doc("automationLogs")),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const viewer = await requireUser(ctx, identity.subject);
    const request = await ctx.db.get(args.requestId);
    if (!request || (viewer._id !== request.borrowerId && viewer._id !== request.lenderId && viewer.role !== "admin")) return [];
    return ctx.db
      .query("automationLogs")
      .withIndex("by_borrowRequest", (q) => q.eq("borrowRequestId", args.requestId))
      .order("desc")
      .take(5);
  },
});

async function enrichRequests(ctx: QueryCtx, requests: Doc<"borrowRequests">[], viewerId?: Doc<"users">["_id"]) {
  return Promise.all(
    requests.map(async (r) => {
      const tool = await ctx.db.get(r.toolId);
      const borrower = await ctx.db.get(r.borrowerId);
      const lender = await ctx.db.get(r.lenderId);
      const ongoing = ["approved", "borrowed", "overdue"].includes(r.status);
      const contactEmail = ongoing ? (viewerId === r.borrowerId ? lender?.email : viewerId === r.lenderId ? borrower?.email : undefined) : undefined;
      return {
        ...r,
        ...(contactEmail ? { contactEmail } : {}),
        toolName: tool?.name ?? "Deleted",
        borrowerName: borrower?.name ?? "Unknown",
        lenderName: lender?.name ?? "Unknown",
      };
    })
  );
}
