import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

export async function getUserByClerkId(
  ctx: QueryCtx,
  clerkId: string
): Promise<Doc<"users"> | null> {
  return ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export async function requireUser(ctx: QueryCtx, clerkId: string): Promise<Doc<"users">> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) throw new Error("User not found. Please sign in.");
  return user;
}

export async function requireAdmin(ctx: QueryCtx, clerkId: string): Promise<Doc<"users">> {
  const user = await requireUser(ctx, clerkId);
  if (user.role !== "admin") throw new Error("Admin access required.");
  return user;
}

export async function requireToolOwner(
  ctx: QueryCtx,
  clerkId: string,
  toolId: Id<"tools">
): Promise<{ user: Doc<"users">; tool: Doc<"tools"> }> {
  const user = await requireUser(ctx, clerkId);
  const tool = await ctx.db.get(toolId);
  if (!tool) throw new Error("Tool not found.");
  if (tool.ownerId !== user._id && user.role !== "admin") {
    throw new Error("You can only manage your own tools.");
  }
  return { user, tool };
}

export const upsertUser = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getUserByClerkId(ctx, args.clerkId);
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, email: args.email });
      return existing._id;
    }
    return ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: args.name,
      email: args.email,
      role: "member",
      isTrustedLender: false,
      createdAt: Date.now(),
    });
  },
});

export const getMe = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return getUserByClerkId(ctx, args.clerkId);
  },
});
