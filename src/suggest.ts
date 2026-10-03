import fs from "node:fs";
import path from "node:path";

import micromatch from "micromatch";

import { type Ctx, fromRepoPath, toRepoPath } from "./context.ts";
import { codeFilesFor } from "./fingerprint.ts";
import { walkFiles } from "./fsutil.ts";
import type { FlowManifest } from "./manifest.ts";
import { type ApiEffect, screenDocSchema } from "./schema.ts";
import { toTsLiteral } from "./tsdoc.ts";

interface Evidence {
  file: string;
  line: number;
  text: string;
}

export type ApiCandidate = Evidence & {
  fn: string;
  endpoint: string;
  effect: ApiEffect;
};
export type NavCandidate = Evidence & { route: string; nodeIds: string[] };
export type ErrorCandidate = Evidence & {
  kind: "toast" | "goBack" | "throw" | "reset";
};

export interface Suggestions {
  folder: string;
  files: string[];
  apis: ApiCandidate[];
  navigations: NavCandidate[];
  errors: ErrorCandidate[];
}

const METHOD_EFFECT: Record<string, ApiEffect> = {
  GET: "read",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "write",
};

const TS_FILE = /\.tsx?$/;
const GENERATED_FN_DECL =
  /^export const ((?:get|post|put|patch|delete)[A-Z]\w*) = \(/;
const URL_FIELD = /url:\s*`([^`]+)`/;
const METHOD_FIELD = /method:\s*'(GET|POST|PUT|PATCH|DELETE)'/;
const TEMPLATE_PARAM = /\$\{(\w+)\}/g;
const IMPORT_FROM = /from\s+['"]([^'"]+)['"]/g;
const UPPERCASE = /[A-Z]/g;
const SCREEN_SUFFIX = /screen$/;
const IMPORT_START = /^\s*import\b/;
const FROM_CLAUSE = /\bfrom\s+['"]/;
const IMPORT_END = /^\s*\}\s*from\s+['"]/;
const API_CALL = /\b(?:use)?((?:get|post|put|patch|delete)[A-Z]\w*)\b/gi;
const ERROR_SIGNALS: [RegExp, ErrorCandidate["kind"]][] = [
  [/Toast\.show\(/, "toast"],
  [/\bgoBack\(/, "goBack"],
  [/throw new \w*Error\(/, "throw"],
  [/NavigationService\.reset|StackActions\.reset/, "reset"],
];

export const DEFAULT_NAVIGATION_CALLS = String.raw`(?:navigate|reset|push|replace)\(\s*['"](\w+)['"]|route(?:Name)?:\s*['"](\w+)['"]`;

/** Generated client function (e.g. Orval) → endpoint, read from the files in `suggest.apiServices`. */
export function loadEndpointMap(
  ctx: Ctx
): Map<string, { method: string; url: string }> {
  const map = new Map<string, { method: string; url: string }>();
  const glob = ctx.config.suggest.apiServices;
  const servicesDir = fromRepoPath(ctx, micromatch.scan(glob).base || ".");
  const accept = (file: string) => {
    const repoPath = toRepoPath(ctx, file);
    return (
      TS_FILE.test(file) &&
      !repoPath.includes("__tests__") &&
      micromatch.isMatch(repoPath, glob, { dot: true })
    );
  };

  for (const file of walkFiles(servicesDir, accept)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const decl = GENERATED_FN_DECL.exec(line);
      if (!decl) {
        return;
      }
      const window = lines.slice(i, i + 20).join("\n");
      const url = URL_FIELD.exec(window);
      const method = METHOD_FIELD.exec(window);
      if (url && method) {
        map.set(decl[1], {
          method: method[1],
          url: url[1].replace(TEMPLATE_PARAM, "{$1}"),
        });
      }
    });
  }

  return map;
}

function resolveImport(
  ctx: Ctx,
  fromFile: string,
  spec: string
): string | undefined {
  const candidates: string[] = [];
  if (spec.startsWith(".")) {
    candidates.push(
      path.resolve(path.dirname(fromRepoPath(ctx, fromFile)), spec)
    );
  } else {
    // Module aliases relative to scanRoots (e.g. `features/x` -> `src/features/x`).
    candidates.push(
      ...ctx.config.scanRoots.map((root) =>
        fromRepoPath(ctx, `${root}/${spec}`)
      )
    );
  }

  for (const base of candidates) {
    for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const absolute = `${base}${suffix}`;
      if (fs.existsSync(absolute)) {
        return toRepoPath(ctx, absolute);
      }
    }
  }
  return undefined;
}

const IMPORT_HOPS = 2;

/** Folder files + imports (up to 2 hops) that stay inside `moduleRoot`. */
function collectFiles(
  ctx: Ctx,
  folder: string,
  moduleRoot: string | undefined
): string[] {
  const emptyDoc = screenDocSchema.parse({
    flowId: "x",
    branches: [{ branchId: "default", label: "x" }],
  });
  const own = codeFilesFor(ctx, { folder, data: emptyDoc });
  const all = new Set(own);
  let frontier = own;

  for (let hop = 0; hop < IMPORT_HOPS; hop += 1) {
    const next: string[] = [];
    for (const file of frontier) {
      const source = fs.readFileSync(fromRepoPath(ctx, file), "utf8");
      for (const match of source.matchAll(IMPORT_FROM)) {
        const resolved = resolveImport(ctx, file, match[1]);
        if (!resolved || resolved.includes("__tests__") || all.has(resolved)) {
          continue;
        }
        if (moduleRoot && !resolved.startsWith(`${moduleRoot}/`)) {
          continue;
        }
        all.add(resolved);
        next.push(resolved);
      }
    }
    frontier = next;
  }

  return [...all].sort();
}

function routeToNodes(
  ctx: Ctx,
  route: string,
  manifest: FlowManifest | undefined
): string[] {
  const snake = route.replace(UPPERCASE, (char) => `_${char.toLowerCase()}`);
  const external = [route, snake].find((id) => id in ctx.config.externalFlows);
  if (external) {
    return [`flow:${external}`];
  }
  if (!manifest) {
    return [];
  }
  const lower = route.toLowerCase();
  return manifest.nodes
    .filter((node) => node.kind === "screen" && node.screenRef)
    .filter((node) => {
      const ref = (node.screenRef as string).toLowerCase();
      return (
        ref === lower ||
        ref.includes(lower) ||
        lower.includes(ref.replace(SCREEN_SUFFIX, ""))
      );
    })
    .map((node) => node.id);
}

function apiCandidates(
  evidence: Evidence,
  endpoints: Map<string, { method: string; url: string }>,
  seen: Set<string>
): ApiCandidate[] {
  const found: ApiCandidate[] = [];
  for (const [, raw] of evidence.text.matchAll(API_CALL)) {
    const fn = raw[0].toLowerCase() + raw.slice(1);
    const endpoint = endpoints.get(fn);
    const key = `${evidence.file}:${fn}`;
    if (endpoint && !seen.has(key)) {
      seen.add(key);
      found.push({
        ...evidence,
        fn,
        endpoint: `${endpoint.method} ${endpoint.url}`,
        effect: METHOD_EFFECT[endpoint.method],
      });
    }
  }
  return found;
}

export function extractSuggestions(
  ctx: Ctx,
  folder: string,
  manifest: FlowManifest | undefined
): Suggestions {
  const endpoints = loadEndpointMap(ctx);
  const files = collectFiles(ctx, folder, manifest?.flow.moduleRoot);
  const apis: ApiCandidate[] = [];
  const navigations: NavCandidate[] = [];
  const errors: ErrorCandidate[] = [];
  const seenApi = new Set<string>();
  const navigationCalls = new RegExp(
    ctx.config.suggest.navigationCalls ?? DEFAULT_NAVIGATION_CALLS,
    "g"
  );

  for (const file of files) {
    const lines = fs.readFileSync(fromRepoPath(ctx, file), "utf8").split("\n");
    let inImport = false;

    lines.forEach((text, i) => {
      const line = i + 1;
      const evidence = { file, line, text: text.trim() };

      const isImportLine =
        inImport || IMPORT_START.test(text) || IMPORT_END.test(text);
      if (IMPORT_START.test(text)) {
        inImport = !FROM_CLAUSE.test(text);
      } else if (inImport && FROM_CLAUSE.test(text)) {
        inImport = false;
      }
      if (isImportLine) {
        return;
      }

      apis.push(...apiCandidates(evidence, endpoints, seenApi));
      for (const match of text.matchAll(navigationCalls)) {
        const route = match.slice(1).find(Boolean);
        if (route) {
          navigations.push({
            ...evidence,
            route,
            nodeIds: routeToNodes(ctx, route, manifest),
          });
        }
      }
      errors.push(
        ...ERROR_SIGNALS.filter(([signal]) => signal.test(text)).map(
          ([, kind]) => ({ ...evidence, kind })
        )
      );
    });
  }

  return { folder, files, apis, navigations, errors };
}

export function renderSuggestions(
  s: Suggestions,
  manifest: FlowManifest | undefined,
  docPath: string
): string {
  const validTargets = manifest
    ? manifest.nodes.filter((n) => n.kind === "screen").map((n) => n.id)
    : [];
  const lines: string[] = [];

  lines.push(`# Suggestions for \`${docPath}\``);
  lines.push("");
  lines.push(
    "> Generated by `periplus suggest`. **This is not documentation**: these are candidates extracted from the code, each with `file:line`."
  );
  lines.push(
    "> Only copy into the doc what you have confirmed. Add `*.periplus.suggest.md` to your .gitignore."
  );
  lines.push("");
  lines.push(
    `Files read (screen folder + imports up to 2 hops inside the module): ${s.files.length}`
  );
  for (const file of s.files) {
    lines.push(`- \`${file}\``);
  }
  lines.push("");

  lines.push("## APIs found");
  lines.push("");
  if (s.apis.length) {
    lines.push("```ts");
    lines.push(
      `apis: ${toTsLiteral(
        s.apis.map((api) => ({
          endpoint: api.endpoint,
          when: "TODO: when/under which condition the call happens",
          effect: api.effect,
          where: [{ file: api.file, line: api.line, symbol: api.fn }],
        }))
      )},`
    );
    lines.push("```");
  } else {
    lines.push("No calls to generated services found.");
  }
  lines.push("");

  lines.push("## Candidate navigations (possible `outgoing`)");
  lines.push("");
  if (!s.navigations.length) {
    lines.push("No literal navigation calls found.");
  }
  for (const nav of s.navigations) {
    const mapped = nav.nodeIds.length
      ? `→ possible nodes: ${nav.nodeIds.map((id) => `\`${id}\``).join(", ")}`
      : "→ no documented node (maybe `flow:<id>` or a node not created yet)";
    lines.push(
      `- route \`${nav.route}\` at \`${nav.file}:${nav.line}\` ${mapped}`
    );
  }
  lines.push("");

  lines.push("## Error / flow-exit signals (possible `outcome`)");
  lines.push("");
  if (!s.errors.length) {
    lines.push("No signals found.");
  }
  for (const err of s.errors) {
    lines.push(
      `- ${err.kind} at \`${err.file}:${err.line}\` — \`${err.text.slice(0, 120)}\``
    );
  }
  lines.push("");

  lines.push("## Prompt for your coding agent");
  lines.push("");
  lines.push("```text");
  lines.push(
    `Fill in the \`export default\` object of ${docPath} (typed by \`ScreenDoc\`; product text goes in the sibling .periplus.mdx).`
  );
  lines.push("Mandatory rules:");
  lines.push(
    "- Read ONLY the files listed above. Every rule, API or exit must cite the file and line that prove it."
  );
  lines.push(
    "- `to`/`from` may only use these targets (or `flow:entry`, `flow:<flowId>` from the catalog):"
  );
  lines.push(
    `  ${validTargets.length ? validTargets.join(", ") : "(no documented nodes yet; leave a TODO)"}`
  );
  lines.push(
    "- If the evidence points to an undocumented screen, do NOT invent the id: write a TODO in the .periplus.mdx."
  );
  lines.push(
    "- `reason` describes the business condition (params, state, API response), not the function name."
  );
  lines.push(
    "- Errors without a screen (toast/goBack) become `outcome: error` with `ux`."
  );
  lines.push(
    "- Do not change `codeFingerprint` or `lastReviewed`; the developer runs `periplus stamp` after reviewing."
  );
  lines.push("```");

  return `${lines.join("\n")}\n`;
}
