import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const CATEGORIES = [
  "power_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "automotive",
  "woodworking",
  "plumbing",
  "electrical",
  "other",
] as const;

export const CONDITIONS = [
  "like_new",
  "good",
  "fair",
  "well_used",
] as const;

export const BORROW_STATUSES = [
  "pending",
  "approved",
  "declined",
  "borrowed",
  "returned",
  "overdue",
] as const;

export const ROLES = ["member", "admin"] as const;

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("member"), v.literal("admin")),
    isTrustedLender: v.boolean(),
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
    isAvailable: v.boolean(),
    isRemoved: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"])
    .searchIndex("search_name", { searchField: "name" }),

  borrowRequests: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    status: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    dueDate: v.string(),
    returnedAt: v.optional(v.number()),
    declineReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_tool", ["toolId"])
    .index("by_status", ["status"]),

  automationLogs: defineTable({
    borrowRequestId: v.id("borrowRequests"),
    type: v.string(),
    message: v.string(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_borrowRequest", ["borrowRequestId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),
});
