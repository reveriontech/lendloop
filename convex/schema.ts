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
  "cancelled",
  "borrowed",
  "returned",
  "overdue",
] as const;

export const ROLES = ["member", "admin"] as const;

/** Borrow request events sent to n8n. */
export const automationEventType = v.union(
  v.literal("request.created"),
  v.literal("request.cancelled"),
  v.literal("request.approved"),
  v.literal("request.declined"),
  v.literal("loan.borrowed"),
  v.literal("loan.returned"),
);

/** Delivery state of an outbox row. "skipped" = n8n isn't configured, or the request is gone. */
export const deliveryStatus = v.union(
  v.literal("pending"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const automationLogType = v.union(v.literal("notification"), v.literal("overdue_reminder"));
export const automationLogStatus = v.union(v.literal("sent"), v.literal("failed"));

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
    photoId: v.optional(v.id("_storage")),
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
    note: v.optional(v.string()),
    declineReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_tool", ["toolId"])
    .index("by_tool_status_dueDate", ["toolId", "status", "dueDate"])
    .index("by_status", ["status"])
    .index("by_status_dueDate", ["status", "dueDate"]),

  // Transactional outbox. Each borrow request status change inserts one row in the
  // same mutation, so an event can't be lost; automation.deliver sends it to n8n.
  automationEvents: defineTable({
    borrowRequestId: v.id("borrowRequests"),
    type: automationEventType,
    status: deliveryStatus,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  // What n8n reports back per loan ("Reminder sent 2 days ago"). The idempotency
  // key makes retried write-backs update one row instead of adding another.
  automationLogs: defineTable({
    borrowRequestId: v.id("borrowRequests"),
    type: automationLogType,
    status: automationLogStatus,
    message: v.string(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_borrowRequest", ["borrowRequestId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  // Failed n8n executions, reported by the error workflow.
  automationFailures: defineTable({
    workflowName: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
    executionId: v.optional(v.string()),
    executionUrl: v.optional(v.string()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  }).index("by_idempotencyKey", ["idempotencyKey"]),
});
