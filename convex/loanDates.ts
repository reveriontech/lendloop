import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const activeStatuses = ["approved", "borrowed", "overdue"];

export async function getCurrentDueDate(ctx: QueryCtx, toolId: Id<"tools">): Promise<string | null> {
  const loans = await Promise.all(activeStatuses.map((status) =>
    ctx.db.query("borrowRequests")
      .withIndex("by_tool_status_dueDate", (q) => q.eq("toolId", toolId).eq("status", status))
      .order("desc")
      .first()
  ));

  return loans.reduce<string | null>((latest, loan) =>
    loan && (!latest || loan.dueDate > latest) ? loan.dueDate : latest, null);
}
