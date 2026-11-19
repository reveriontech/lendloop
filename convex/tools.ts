import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { LISTING_PHOTO_MAX_BYTES, listingPhotoType } from "./listingPhoto";
import { getCurrentDueDate } from "./loanDates";
import { requireUser, requireAdmin, requireToolOwner } from "./auth";

export const list = query({
  args: { category: v.optional(v.string()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const viewer = await requireUser(ctx, identity.subject);
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
    return Promise.all(tools
      .filter((tool) => !tool.isRemoved && (!args.category || tool.category === args.category))
      .map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        const dueDate = tool.isAvailable ? null : await getCurrentDueDate(ctx, tool._id);
        return { ...await withPhotoUrl(ctx, tool), dueDate, ownerName: owner?.name ?? "Unknown", isTrustedLender: owner?.isTrustedLender ?? false, isOwn: tool.ownerId === viewer._id };
      }));
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
    return Promise.all(tools.filter((tool) => !tool.isRemoved).map((tool) => withPhotoUrl(ctx, tool)));
  },
});

export const getById = query({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemoved) return null;
    const owner = await ctx.db.get(tool.ownerId);
    return { ...await withPhotoUrl(ctx, tool), ownerName: owner?.name ?? "Unknown" };
  },
});

export const create = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
    photo: v.optional(v.bytes()),
  },
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const photoId = args.photo ? await storePhoto(ctx, args.photo) : undefined;
    return ctx.db.insert("tools", {
      ownerId: user._id,
      name: args.name,
      category: args.category,
      condition: args.condition,
      description: args.description,
      ...(photoId ? { photoId } : {}),
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
    photo: v.optional(v.union(v.bytes(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tool } = await requireToolOwner(ctx, args.clerkId, args.toolId);
    if (tool.isRemoved) throw new ConvexError("This listing has been removed.");

    const { name, category, condition, description, photo } = args;
    const updates = { name, category, condition, description };
    const fields = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));

    if (photo !== undefined) {
      const photoId = photo === null ? undefined : await storePhoto(ctx, photo);
      await ctx.db.patch(tool._id, { ...fields, photoId });
      if (tool.photoId) await ctx.storage.delete(tool.photoId);
    } else if (Object.keys(fields).length > 0) {
      await ctx.db.patch(tool._id, fields);
    }
    return null;
  },
});

export const remove = mutation({
  args: { clerkId: v.string(), toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const { tool } = await requireToolOwner(ctx, args.clerkId, args.toolId);
    await removeListing(ctx, tool);
  },
});

export const adminRemove = mutation({
  args: { clerkId: v.string(), toolId: v.id("tools") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.clerkId);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) throw new ConvexError("Listing not found.");
    await removeListing(ctx, tool);
  },
});

async function withPhotoUrl(ctx: QueryCtx, tool: Doc<"tools">) {
  const { photoId, ...listing } = tool;
  return { ...listing, photoUrl: photoId ? await ctx.storage.getUrl(photoId) : null };
}

async function storePhoto(ctx: MutationCtx, photo: ArrayBuffer) {
  if (photo.byteLength > LISTING_PHOTO_MAX_BYTES) {
    throw new ConvexError("Choose a photo that is 2 MB or smaller.");
  }
  const type = listingPhotoType(photo);
  if (!type) throw new ConvexError("Choose a JPEG, PNG, or WebP photo.");
  return ctx.storage.store(new Blob([photo], { type }));
}

async function removeListing(ctx: MutationCtx, tool: Doc<"tools">) {
  await ctx.db.patch(tool._id, { isRemoved: true, isAvailable: false, photoId: undefined });
  if (tool.photoId) await ctx.storage.delete(tool.photoId);
}
