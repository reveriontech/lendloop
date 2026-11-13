/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as borrowRequests from "../borrowRequests.js";
import type * as http from "../http.js";
import type * as tools from "../tools.js";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  borrowRequests: typeof borrowRequests;
  http: typeof http;
  tools: typeof tools;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
