import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/api/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const requests = await ctx.runQuery(api.borrowRequests.listOverdue);
    return new Response(JSON.stringify(requests), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/api/automation-log",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { borrowRequestId, type, message, idempotencyKey } = body;
    if (!borrowRequestId || !type || !message || !idempotencyKey) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    await ctx.runMutation(api.borrowRequests.writeAutomationLog, {
      borrowRequestId,
      type,
      message,
      idempotencyKey,
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
