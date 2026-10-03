import { z } from "zod";

export const SCREEN_TYPES = [
  "screen",
  "loading",
  "error",
  "empty",
  "modal",
  "decision",
] as const;
export const OUTCOMES = ["error", "end"] as const;
export const API_EFFECTS = ["read", "write"] as const;

export const FLOW_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
export const DOMAIN_PATTERN = /^[a-z][a-z0-9-]*$/;
export const SCREEN_REF_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const BRANCH_ID_PATTERN = /^[a-z][A-Za-z0-9_]*$/;
/** `Screen`, `Screen:branch`, `flow:entry` or `flow:<flowId>`. */
export const LINK_REF_PATTERN =
  /^(flow:[a-z][a-z0-9_]*|[A-Za-z][A-Za-z0-9_]*(:[a-z][A-Za-z0-9_]*)?)$/;

const flowId = z
  .string()
  .regex(FLOW_ID_PATTERN, "flowId must be snake_case (e.g. checkout_cart)");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const reason = z
  .string()
  .trim()
  .min(1, "`reason` is required: explain the business condition");
const linkRef = z
  .string()
  .regex(
    LINK_REF_PATTERN,
    "use `Screen`, `Screen:branch`, `flow:entry` or `flow:<flowId>`"
  );

export const codeRefSchema = z
  .object({
    file: z.string().min(1),
    symbol: z.string().optional(),
    line: z.number().int().positive().optional(),
  })
  .strict();

export const ruleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, "rule id must be snake_case"),
    summary: z.string().min(1),
    when: z.string().optional(),
    // biome-ignore lint/suspicious/noThenProperty: `then` is the rule outcome in the doc format, never awaited
    then: z.string().optional(),
    where: z.array(codeRefSchema).default([]),
    verify: z.array(z.object({ test: z.string().min(1) }).strict()).default([]),
  })
  .strict();

export const apiSchema = z
  .object({
    endpoint: z
      .string()
      .regex(
        /^(GET|POST|PUT|PATCH|DELETE) \/\S*$/,
        'format "METHOD /path" (e.g. GET /orders/{orderId})'
      ),
    when: z.string().min(1),
    effect: z.enum(API_EFFECTS),
    where: z.array(codeRefSchema).default([]),
  })
  .strict();

export const incomingSchema = z
  .object({
    from: linkRef,
    reason,
  })
  .strict();

export const outgoingSchema = z
  .object({
    to: linkRef.optional(),
    outcome: z.enum(OUTCOMES).optional(),
    reason,
    ux: z.string().optional(),
  })
  .strict()
  .refine((s) => Boolean(s.to) !== Boolean(s.outcome), {
    message:
      "each exit needs exactly one of `to` (navigates) or `outcome` (error/end without navigating)",
  });

export const branchSchema = z
  .object({
    branchId: z
      .string()
      .regex(
        BRANCH_ID_PATTERN,
        "branchId must be camelCase (e.g. default, start, quoteFlow)"
      ),
    label: z.string().min(1),
    type: z.enum(SCREEN_TYPES).optional(),
    summary: z.string().optional(),
    wip: z.boolean().optional(),
    /** The customer journey ends here (e.g. success, denial), even if closing the screen leads to another flow. */
    final: z.boolean().optional(),
    incoming: z.array(incomingSchema).default([]),
    outgoing: z.array(outgoingSchema).default([]),
    rules: z.array(ruleSchema).default([]),
    apis: z.array(apiSchema).default([]),
    notes: z.array(z.string()).default([]),
  })
  .strict();

export const screenDocSchema = z
  .object({
    flowId,
    screenRef: z.string().regex(SCREEN_REF_PATTERN).optional(),
    title: z.string().optional(),
    type: z.enum(SCREEN_TYPES).default("screen"),
    lastReviewed: isoDate.optional(),
    codeFingerprint: z.string().optional(),
    codePaths: z.array(z.string()).default([]),
    branches: z
      .array(branchSchema)
      .min(1, "at least one branch (use `default` for regular screens)"),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.branches.forEach((branch, index) => {
      if (seen.has(branch.branchId)) {
        ctx.addIssue({
          code: "custom",
          path: ["branches", index, "branchId"],
          message: `duplicate branchId "${branch.branchId}"`,
        });
      }
      seen.add(branch.branchId);
    });
  });

export const flowIndexSchema = z
  .object({
    flowId,
    title: z.string().min(1),
    domain: z
      .string()
      .regex(
        DOMAIN_PATTERN,
        "domain must be kebab-case and declared in `domains` of periplus.config.json"
      ),
    moduleRoot: z.string().min(1),
    include: z.array(z.string()).default([]),
    status: z.enum(["active", "wip", "deprecated"]).default("active"),
    lastReviewed: isoDate.optional(),
    owners: z.array(z.string()).default([]),
    watchPaths: z.array(z.string()).default([]),
    entry: z
      .object({
        summary: z.string().min(1),
        productSummary: z.string().optional(),
        triggers: z.array(codeRefSchema).default([]),
      })
      .strict(),
  })
  .strict();

export const configSchema = z.object({
  $comment: z.string().optional(),
  project: z.string().min(1),
  flowsDir: z.string().default("flows"),
  scanRoots: z.array(z.string()).default(["src"]),
  repoUrl: z.string().default(""),
  hubDir: z.string().optional(),
  /** Domains accepted in `flows/<slug>/index.mdx` (id -> label shown on the site). Empty accepts any id. */
  domains: z
    .record(z.string().regex(DOMAIN_PATTERN), z.string().min(1))
    .default({}),
  /** Identity of the site installed by `periplus init`. */
  site: z
    .object({
      title: z.string().min(1).default("Periplus"),
      description: z.string().default(""),
      githubUrl: z.url().optional(),
    })
    .prefault({}),
  suggest: z
    .object({
      /** API service files (glob relative to the root) scanned by `suggest`. */
      apiServices: z.string().default("src/api/services/**"),
      /** Regex (as a string) matching navigation calls; the first capture group is the route name. */
      navigationCalls: z.string().optional(),
    })
    .prefault({}),
  fingerprint: z
    .object({
      include: z.array(z.string()).default(["**/*.{ts,tsx,js,jsx}"]),
      exclude: z.array(z.string()).default(["**/__tests__/**", "**/*.test.*"]),
    })
    .prefault({}),
  check: z
    .object({
      symmetry: z.enum(["off", "warn", "error"]).default("warn"),
    })
    .prefault({}),
  externalFlows: z
    .record(
      z.string().regex(FLOW_ID_PATTERN),
      z.object({
        title: z.string(),
        project: z.string().optional(),
        note: z.string().optional(),
        /** Flow documentation outside periplus (Notion, Confluence, another hub); rendered as a link on the map. */
        docUrl: z.url().optional(),
      })
    )
    .default({}),
});

export type ScreenType = (typeof SCREEN_TYPES)[number];
export type Outcome = (typeof OUTCOMES)[number];
export type ApiEffect = (typeof API_EFFECTS)[number];
export type CodeRef = z.infer<typeof codeRefSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Api = z.infer<typeof apiSchema>;
export type Incoming = z.infer<typeof incomingSchema>;
export type Outgoing = z.infer<typeof outgoingSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type ScreenDoc = z.infer<typeof screenDocSchema>;
export type FlowIndex = z.infer<typeof flowIndexSchema>;
export type Config = z.infer<typeof configSchema>;

/** `Screen` becomes `Screen:default`; `flow:*` and `Screen:branch` are kept as is. */
export function normalizeLinkRef(ref: string): string {
  if (ref.startsWith("flow:") || ref.includes(":")) {
    return ref;
  }
  return `${ref}:default`;
}

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length ? issue.path.join(".") : "(root)";
    return `${where}: ${issue.message}`;
  });
}
