import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireAdmin } from "./auth";

export const create = mutation({
  args: {
    clerkId: v.string(),
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemoved) throw new Error("Tool not found.");
    if (!tool.isAvailable) throw new Error("Tool is not available.");
    if (tool.ownerId === user._id) throw new Error("You cannot borrow your own tool.");

    const now = Date.now();
    const requestId = await ctx.db.insert("borrowRequests", {
      toolId: args.toolId,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      status: "pending",
      startDate: args.startDate,
      endDate: args.endDate,
      dueDate: args.endDate,
      createdAt: now,
      updatedAt: now,
    });
    return requestId;
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
    await ctx.db.patch(args.requestId, { status: "approved", updatedAt: Date.now() });
    await ctx.db.patch(request.toolId, { isAvailable: false });
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
    return enrichRequests(ctx, requests);
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
    return enrichRequests(ctx, requests);
  },
});

export const listAll = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    const requests = await ctx.db.query("borrowRequests").collect();
    return enrichRequests(ctx, requests);
  },
});

export const listOverdue = query({
  args: {},
  handler: async (ctx) => {
    const requests = await ctx.db
      .query("borrowRequests")
      .withIndex("by_status", (q) => q.eq("status", "borrowed"))
      .collect();
    const today = new Date().toISOString().split("T")[0];
    const overdue = requests.filter((r) => r.dueDate < today);
    return enrichRequests(ctx, overdue);
  },
});

export const getAutomationLogs = query({
  args: { requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("automationLogs")
      .withIndex("by_borrowRequest", (q) => q.eq("borrowRequestId", args.requestId))
      .collect();
  },
});

export const writeAutomationLog = mutation({
  args: {
    borrowRequestId: v.id("borrowRequests"),
    type: v.string(),
    message: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationLogs")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("automationLogs", {
      borrowRequestId: args.borrowRequestId,
      type: args.type,
      message: args.message,
      idempotencyKey: args.idempotencyKey,
      createdAt: Date.now(),
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichRequests(ctx: any, requests: any[]) {
  return Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requests.map(async (r: any) => {
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
}
