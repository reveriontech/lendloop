import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import router from "../convex/http";
import type { ActionCtx } from "../convex/_generated/server";

/** Calls a registered Convex HTTP route with a stand-in context. */
export function callRoute(
  ctx: Partial<ActionCtx>,
  path: string,
  method: "GET" | "POST",
  init: { headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  const route = router.lookup(path, method);
  if (!route) throw new Error("Route missing: " + path);
  // The runtime exposes the registered handler, so tests can pass a fake context.
  const action = route[0] as (typeof route)[0] & { _handler: (c: ActionCtx, r: Request) => Promise<Response> };
  return action._handler(ctx as ActionCtx, new Request("https://test.invalid" + path, { method, ...init }));
}

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

/** The handler of a registered Convex query, mutation or action. */
export function handlerOf(fn: unknown): Handler {
  return (fn as { _handler: Handler })._handler;
}

type Doc = Record<string, unknown> & { _id: string };
type Range = { eq(field: string, value: unknown): Range; lt(field: string, value: string): Range };

/**
 * An in-memory stand-in for ctx.db with just what the automation code uses:
 * get, insert, patch, normalizeId and index queries with eq/lt.
 */
export function fakeDb(seed: Record<string, Doc[]> = {}) {
  const tables = new Map<string, Map<string, Doc>>();
  let clock = 0;
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  for (const [name, docs] of Object.entries(seed)) {
    for (const doc of docs) table(name).set(doc._id, { _creationTime: ++clock, ...doc });
  }
  const findAnywhere = (id: string) => {
    for (const docs of tables.values()) if (docs.has(id)) return docs.get(id)!;
    return null;
  };

  const db = {
    get: async (tableOrId: string, id?: string) => (id === undefined ? findAnywhere(tableOrId) : table(tableOrId).get(id) ?? null),
    insert: async (name: string, doc: Record<string, unknown>) => {
      const _id = `${name}_${++clock}`;
      table(name).set(_id, { ...doc, _id, _creationTime: clock });
      return _id;
    },
    patch: async (name: string, id: string, fields: Record<string, unknown>) => {
      const doc = table(name).get(id);
      if (!doc) throw new Error(`No ${name} document ${id}`);
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) delete doc[key];
        else doc[key] = value;
      }
    },
    normalizeId: (name: string, id: string) => (table(name).has(id) ? id : null),
    query: (name: string) => {
      let rows = [...table(name).values()];
      const query = {
        withIndex: (_index: string, build?: (range: Range) => unknown) => {
          const tests: ((doc: Doc) => boolean)[] = [];
          const range: Range = {
            eq: (field, value) => (tests.push((doc) => doc[field] === value), range),
            lt: (field, value) => (tests.push((doc) => String(doc[field]) < value), range),
          };
          build?.(range);
          rows = rows.filter((doc) => tests.every((test) => test(doc)));
          return query;
        },
        order: (direction: "asc" | "desc") => {
          rows.sort((a, b) => (direction === "desc" ? -1 : 1) * (Number(a._creationTime) - Number(b._creationTime)));
          return query;
        },
        take: async (count: number) => rows.slice(0, count),
        unique: async () => {
          if (rows.length > 1) throw new Error("unique() matched more than one document");
          return rows[0] ?? null;
        },
      };
      return query;
    },
  };
  return { db, rows: (name: string) => [...table(name).values()] };
}

export type N8nNode = {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: number[];
  parameters: Record<string, unknown>;
  retryOnFail?: boolean;
  maxTries?: number;
  onError?: string;
};

export type Workflow = {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: { node: string; type: string; index: number }[][] }>;
  settings: Record<string, unknown>;
};

export function loadWorkflow(file: string): Workflow {
  return JSON.parse(readFileSync(new URL(`../n8n-workflows/${file}`, import.meta.url), "utf8"));
}

/** Evaluates an n8n `={{ … }}` parameter expression with $json and $env, as n8n does. */
export function evaluateExpression(expression: string, $json: unknown, $env: Record<string, string>): unknown {
  const match = /^=\{\{([\s\S]*)\}\}$/.exec(expression.trim());
  if (!match) throw new Error("Not an n8n expression: " + expression);
  return new Function("$json", "$env", `return (${match[1]});`)($json, $env);
}

const nodeRequire = createRequire(import.meta.url);
const quietConsole = { log: () => {}, error: () => {}, warn: () => {} };

/**
 * Runs a Code node's JavaScript the way n8n does, with stand-ins for $input, $json,
 * $env and $('Node').item. Returns the json of each output item.
 */
export function runCodeNode(
  workflow: Workflow,
  nodeName: string,
  items: unknown[],
  env: Record<string, string>,
  references: Record<string, unknown> = {},
): Record<string, unknown>[] {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  if (!node) throw new Error(`${workflow.name} has no node named ${nodeName}`);
  const { jsCode, mode } = node.parameters as { jsCode: string; mode?: string };
  const run = new Function("$input", "$json", "$env", "$", "require", "Buffer", "console", jsCode);
  const $ = (name: string) => ({ item: { json: references[name] } });
  const input = (list: unknown[]) => ({
    first: () => ({ json: list[0] }),
    all: () => list.map((json) => ({ json })),
  });

  if (mode === "runOnceForEachItem") {
    return items.map((json) => {
      const output = run({ ...input([json]), item: { json } }, json, env, $, nodeRequire, Buffer, quietConsole);
      return (output as { json: Record<string, unknown> }).json;
    });
  }
  const output = run(input(items), undefined, env, $, nodeRequire, Buffer, quietConsole);
  return (output as { json: Record<string, unknown> }[]).map((item) => item.json);
}
