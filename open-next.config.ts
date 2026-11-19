import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Builds the Next.js app for Cloudflare Workers. LendLoop keeps its data in
// Convex and uses no Next.js incremental cache (ISR), so the defaults are enough.
export default defineCloudflareConfig();
