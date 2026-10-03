---
name: periplus-docs
description: >-
  Maintains living flow documentation (Periplus): flows/<slug>/index.mdx and
  <Folder>.periplus.ts (+ <Folder>.periplus.mdx body) colocated with screens. Use when
  editing screens, navigation, actions or validations of documented flows, when
  `periplus check` complains on a PR, or when the user asks to document/update a flow.
---

# Periplus

Full guide: `node_modules/periplus/README.md`. Project configuration: `periplus.config.json` at the repository root. Project-specific details (CI, site scripts) live in the README of the site folder (`hubDir` in the config).

## Where things are

- Flow root: `<flowsDir>/<slug>/index.mdx` — frontmatter with `flowId`, `domain` (one of the config `domains`), `moduleRoot`, `watchPaths`, `entry`; markdown body with the product context.
- Nodes: inside the screen folder, one per screen (multi-step form: one per step):
  - `<Folder>.periplus.ts` — typed data: `export default { ... } satisfies ScreenDoc`.
  - `<Folder>.periplus.mdx` — optional, body only (markdown, no frontmatter).
- Generated (committed, do not edit): `<flowsDir>/<slug>/generated/` (`flow.manifest.json`, `+flow.types.ts`, `flow.context.md`, `diagram.mmd`) and `<flowsDir>/generated/` (`flows.catalog.json`, `+periplus.types.ts`, …).

## `.periplus.ts` format

```ts
import type { ScreenDoc } from '../../flows/<slug>/generated/+flow.types';

export default {
  flowId: 'my_flow',
  title: 'Screen title',
  codePaths: ['src/.../machine.ts'],
  branches: [
    {
      branchId: 'default',
      label: 'Short label',
      type: 'screen',
      summary: 'What the screen does for the user.',
      incoming: [{ from: 'OtherScreen', reason: 'Why the user arrives here' }],
      outgoing: [
        { to: 'NextScreen', reason: 'Valid data' },
        { outcome: 'error', reason: 'API failure' },
      ],
      rules: [{ id: 'rule_snake_case', summary: '...', when: '...', then: '...', where: [{ file: 'src/...', symbol: 'fn' }] }],
      apis: [{ endpoint: 'POST /v1/resource', when: '...', effect: 'write', where: [{ file: 'src/...' }] }],
    },
  ],
} satisfies ScreenDoc;
```

- Only `import type` is allowed (the CLI evaluates the file without resolving imports); no functions, external variables or spreads.
- Your editor completes and validates `from`/`to`: screens (`'OtherScreen'`), nodes (`'Screen:branch'`), `'flow:entry'` and other flows (`'flow:<flow_id>'`). A new screen only appears in autocomplete after `periplus build` (or while `periplus dev` is running).
- Node ID = `screenRef:branchId`. Only use several `branches` when the same screen plays different roles; otherwise a single `default`.
- Keys and enums are in English (`type`: `screen` | `loading` | `error` | `empty` | `modal` | `decision`; `outcome`: `error` | `end`; `effect`: `read` | `write`); texts (`label`, `summary`, `reason`, rules, body) are in the team's language.
- An `outgoing` item has `to` **or** `outcome`, never both. Use `final: true` when the journey ends on the screen.
- Links are declared on both sides (exit in A ↔ entry in B); otherwise check reports `symmetry`.
- `lastReviewed` and `codeFingerprint` are written by `periplus stamp` — do not edit them by hand.

## When to update

1. If the diff touches the `watchPaths` of an `index.mdx`, or the folder/`codePaths` of a `*.periplus.ts`, review the matching doc.
2. Update rules (`id` in snake_case, `summary`, `when`, `then`, `where` with `file`/`symbol`, `verify` with tests), `apis`, `outgoing`/`incoming`. Do **not** duplicate logic: point to the code.
3. To find candidates with `file:line` evidence: `npx periplus suggest <folder>` (writes `<Folder>.periplus.suggest.md`; keep it out of git). Suggestions are hints — confirm them in the code before writing.
4. Mark as reviewed: `npx periplus stamp <file>` (only updates `codeFingerprint` and `lastReviewed`, preserving the rest of the file).
5. Regenerate and validate: `npx periplus build && npx periplus check`.

## Commands

```bash
npx periplus new <slug> --module-root <dir>            # new flow
npx periplus node <flow> --path <folder>               # new node (.periplus.ts + .periplus.mdx)
npx periplus node <flow> --path <folder> --branch <id> # another role of the same screen
npx periplus suggest <folder>                          # candidates with file:line
npx periplus stamp <file> | --flow <flow> | --stale
npx periplus check                                     # schema, links, missing error paths, stale docs, generated/
npx periplus build                                     # regenerates generated/ and the site pages
npx periplus dev                                       # build + watch
```

## Check codes

- `invalid-doc`: the `.periplus.ts` could not be evaluated (runtime import, syntax) or does not match the schema.
- `unknown-target` / `unknown-source` / `missing-component` / `missing-file`: broken reference.
- `symmetry`, `orphan-node`, `dead-end`, `missing-error-path`: incomplete graph.
- `orphan-body`: `.periplus.mdx` without its sibling `.periplus.ts`.
- `stale` / `missing-fingerprint`: code changed since the last `stamp` (or it was never stamped).
- Stale `generated/`: run `npx periplus build` and commit.
