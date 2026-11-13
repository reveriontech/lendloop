import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./auth";

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
