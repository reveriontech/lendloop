import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    // n8n automation. All optional so the app deploys and runs without n8n;
    // undelivered events are then marked "skipped" and shown on the Admin page.
    // Set with: npx convex env set <NAME> <value>
    N8N_WEBHOOK_URL: v.optional(v.string()),
    // Convex signs events it sends to n8n with this secret.
    CONVEX_TO_N8N_SECRET: v.optional(v.string()),
    // n8n signs every request it sends to Convex with this secret.
    N8N_TO_CONVEX_SECRET: v.optional(v.string()),
  },
});

export default app;
