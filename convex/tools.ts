import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireAdmin, requireToolOwner } from "./auth";

export const list = query({
  args: { category: v.optional(v.string()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let tools;
    if (args.search) {
      tools = await ctx.db
        .query("tools")
        .withSearchIndex("search_name", (q) => q.search("name", args.search!))
        .collect();
    } else if (args.category) {
      tools = await ctx.db
        .query("tools")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      tools = await ctx.db.query("tools").collect();
    }
    return tools.filter((t) => !t.isRemoved);
  },
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").collect();
    return tools
      .filter((t) => !t.isRemoved && t.isAvailable)
      .map((t) => ({ _id: t._id, name: t.name, category: t.category }));
  },
});

export const listByOwner = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    return tools.filter((t) => !t.isRemoved);
  },
});

export const getById = query({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemoved) return null;
    const owner = await ctx.db.get(tool.ownerId);
    return { ...tool, ownerName: owner?.name ?? "Unknown" };
  },
});

export const create = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    return ctx.db.insert("tools", {
      ownerId: user._id,
      name: args.name,
      category: args.category,
      condition: args.condition,
      description: args.description,
      isAvailable: true,
      isRemoved: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    clerkId: v.string(),
    toolId: v.id("tools"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    condition: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireToolOwner(ctx, args.clerkId, args.toolId);
    const { clerkId: _clerkId, toolId, ...updates } = args;
    void _clerkId;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(toolId, filtered);
    }
  },
});

export const remove = mutation({
  args: { clerkId: v.string(), toolId: v.id("tools") },
  handler: async (ctx, args) => {
    await requireToolOwner(ctx, args.clerkId, args.toolId);
    await ctx.db.patch(args.toolId, { isRemoved: true, isAvailable: false });
  },
});

export const adminRemove = mutation({
  args: { clerkId: v.string(), toolId: v.id("tools") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    await ctx.db.patch(args.toolId, { isRemoved: true, isAvailable: false });
  },
});
