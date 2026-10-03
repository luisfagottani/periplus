# Periplus

[![npm](https://img.shields.io/npm/v/periplus)](https://www.npmjs.com/package/periplus)
[![CI](https://github.com/luisfagottani/periplus/actions/workflows/ci.yml/badge.svg)](https://github.com/luisfagottani/periplus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Living documentation for product journeys. Developers write a typed doc (`.periplus.ts`) next to each screen; the CLI validates it, generates types, manifests and AI context, and feeds an Astro + Starlight site with an interactive map of every flow.

Nothing is inferred from navigation: your app's routes and stacks do not define the flows. Every link between screens is declared by hand, together with **why** it happens.

## Why "Periplus"

A *periplus* was the logbook of ancient navigators: the list of ports along a coast, in order, with what could be found in each one and how to sail to the next. That is what this tool does for an app: each screen is a port, each exit says where it goes and under which condition, and the site turns it all into a map.

## Requirements

- Node.js 20 or newer
- A TypeScript project (React Native, React, or anything with screen folders)

## Installation

```bash
npm install --save-dev periplus
# or
pnpm add -D periplus
```

Then scaffold the site and the config:

```bash
npx periplus init [dir]                                         # default: docs/periplus
npx periplus init --template gh:org/repo/templates/starlight    # theme from another repository (giget)
npx periplus init docs/periplus --force                         # overwrite existing files
```

`init`:

- copies the site template (Astro + Starlight + React Flow) bundled with the package, matching the CLI version, without network access; with `--template <source>` it downloads it through [giget](https://github.com/unjs/giget);
- creates `periplus.config.json` at the repository root if it does not exist, and writes `hubDir: <dir>` and `site.title` (your project name);
- never overwrites existing files unless you pass `--force`, and lists the ones it skipped.

Next: `npm install --prefix <dir>`, `npx periplus build` and `npm run dev --prefix <dir>` (with `npx periplus dev` in another terminal). For AI agents, `npx periplus skill` installs the doc maintenance skill (see [Agent skill](#agent-skill)).

### Updating the theme

The site belongs to your project (a versioned folder). To pull a newer theme, run `periplus init <dir> --force` and review the diff: components, `lib/` and styles come from the theme; pages in `src/content/docs/` are yours (revert whatever you don't want replaced).

## Configuration (`periplus.config.json`)

| Key | Purpose |
| --- | --- |
| `project` | Project name (shown in the catalog and in the AI context) |
| `flowsDir` / `scanRoots` | Where `flows/<slug>/index.mdx` lives and where to look for `*.periplus.ts` files |
| `hubDir` | Site folder; `build` writes pages to `<hubDir>/src/content/docs/flows` |
| `repoUrl` | Base for "view in code" links (e.g. `https://github.com/org/repo/blob/main/`). Links are omitted without it |
| `site` | Site `title`, `description` and `githubUrl` |
| `domains` | `id -> label` map of the domains accepted in `index.mdx` (they group the sidebar). Empty accepts any id |
| `suggest.apiServices` | Glob of the API service files read by `suggest` (default `src/api/services/**`) |
| `suggest.navigationCalls` | Regex for navigation calls (the first captured group is the route) |
| `fingerprint`, `check.symmetry`, `externalFlows` | See the sections below |

## Format decisions

| Topic | Decision |
| --- | --- |
| Flow root | `flows/<slug>/index.mdx` — goal, entry, product summary, `moduleRoot`, `watchPaths` |
| Nodes | `{Folder}.periplus.ts` **inside the screen folder** in `src/` (e.g. `CartLoading/CartLoading.periplus.ts`) |
| Format | TypeScript: `export default {…} satisfies ScreenDoc` (typed by the flow's `+flow.types.ts`, validated with Zod by the CLI) + optional body in `{Folder}.periplus.mdx` (scenarios, copy, notes; no frontmatter) |
| One doc per screen | Always. Multi-step forms have one `.periplus.ts` per step |
| `branches` | For when the same folder plays different roles in the flow (e.g. a loading screen with `phase=start` and `phase=quoteFlow`). A regular screen has a single `default` branch |
| Error without a screen (toast + go back) | `outgoing[].outcome: error` in the doc itself; the build draws a terminal node |
| Language | Doc keys and enums in English (`incoming`, `outgoing`, `reason`, `type: screen`…); free text (`label`, `summary`, `reason`, rules, body) in your team's language |
| Link to the flow root | `flowId` in the doc + file under the index's `moduleRoot` (or `include`) — no manual node list |
| `generated/` | **Committed**. CI runs `build --check` and fails when it is out of date |
| Source of truth for edges | Only the docs' `outgoing` / `incoming`. The `.periplus.mdx` body never becomes an edge |

## Commands

```bash
periplus init [dir] [--template <source>] [--force]
periplus skill [--dir <dir>] [--force]
periplus new <slug> --module-root <dir> [--id <flow_id>] [--domain <d>] [--title "Title"]
periplus node <flow> [--path <screen-dir>] [--branch <id>] [--type screen|loading|error|empty|modal|decision] [--suggest]
periplus suggest <screen-dir>
periplus stamp [files...] [--flow <flow>] [--stale]
periplus check [--fail-on error|stale|warning] [--format text|markdown|json] [--output <file>]
periplus build [--check] [--no-hub]
periplus dev
```

`<flow>` accepts the `flowId` (`checkout_cart`) or the folder slug (`checkout`). Without `--path`, `node` uses the current directory. Without `--domain`, `new` uses the configured domain that appears in the `--module-root` path (or the first configured one); when the config has no `domains`, `--domain` is required.

## Workflow

1. `periplus new checkout --id checkout_cart --module-root src/modules/checkout` creates the flow root.
2. Keep `periplus dev` running in a terminal: every save of a `.periplus.ts` / `.periplus.mdx` / `index.mdx` regenerates types and manifest — that is how new screens show up in the `to`/`from` autocomplete.
3. In each screen folder: `periplus node checkout` (or `--path <dir>`). It creates `Folder.periplus.ts` (with the flow's `import type`) and `Folder.periplus.mdx` (body); the new ID (`Folder:default`) is added to the `<Flow>NodeId` / `<Flow>LinkTarget` unions in `flows/<slug>/generated/+flow.types.ts`. With `--branch <id>` it appends a branch to the existing doc.
4. Optional: `periplus suggest <dir>` writes `<Folder>.periplus.suggest.md` (keep it out of git) with APIs, navigations and error signals, each with `file:line`.
5. Fill in `incoming`, `outgoing`, `rules`, `apis` (your editor completes and validates `to`/`from`) and the body. Once you have reviewed it against the code: `periplus stamp <file>` — it only rewrites `lastReviewed` and `codeFingerprint`, preserving comments and formatting.
6. Run `periplus check` before opening the PR. Commit the `generated/` folders too.

## Anatomy of a node

`CartLoading/CartLoading.periplus.ts`:

```ts
import type { ScreenDoc } from '../../../../flows/checkout/generated/+flow.types';

export default {
  flowId: 'checkout_cart',
  type: 'loading',
  branches: [
    {
      branchId: 'start',
      label: 'Loading the cart',
      incoming: [{ from: 'flow:entry', reason: 'user tapped "Checkout"' }],
      outgoing: [
        { to: 'AddressScreen', reason: 'valid cart and no saved address' }, // = AddressScreen:default
        { to: 'flow:payment', reason: 'address already saved, go straight to payment' },
        { outcome: 'error', reason: 'cart GET failed', ux: 'Generic toast + goBack' },
      ],
      apis: [{ endpoint: 'GET /carts/{cartId}', when: 'on mount', effect: 'read' }],
      rules: [
        {
          id: 'start_without_address',
          summary: 'Without a saved address the user goes to the address form',
          where: [{ file: 'src/.../resolveCheckoutRoute.ts', symbol: 'resolveRoute' }],
        },
      ],
    },
  ],
  lastReviewed: '2026-10-03',
  codeFingerprint: 'sha256:…',
} satisfies ScreenDoc;
```

`CartLoading/CartLoading.periplus.mdx` (optional): free-form markdown body — scenarios, copy, notes for product. It never becomes an edge.

- **Data only**: the CLI evaluates the file in isolation (transpiles and runs it without `require`), so only `import type` is accepted; runtime imports, functions or external variables produce `invalid-doc`.
- **Typing**: `ScreenDoc` comes from the flow's `+flow.types.ts`. `to`/`from` only accept screens with a `default` branch, `Screen:branch` IDs of the flow, `flow:entry` and known `flow:<flow_id>`; `outgoing` requires `to` **or** `outcome`. Run `tsc` (or trust your editor) to catch errors before `check`.
- **Node ID** = `screenRef:branchId`. `screenRef` is the folder name (can be overridden in the doc).
- **References** in `to` / `from`: `Screen` (branch `default`), `Screen:branch`, `flow:entry` or `flow:<other_flow_id>` (documented, or declared in `externalFlows` in `periplus.config.json`). In `externalFlows`, the optional `docUrl` becomes the "Open flow" link in the map for flows documented outside Periplus.
- **Symmetry**: declare each link on both sides — `outgoing[].to` at the source and `incoming[].from` at the target, each with its own `reason` (each screen page shows "comes from" and "goes to"). The build merges both into a single edge. If one side is missing the edge is still drawn, but `check` reports `symmetry` (level configurable through `check.symmetry`: `off`, `warn`, `error`). Links to `flow:*` and `outcome` only need this flow's side.

## What `check` validates

| Level | Code | When |
| --- | --- | --- |
| error | `invalid-doc`, `duplicate-flow`, `unknown-flow`, `unknown-domain`, `file-name`, `outside-module-root` | `.periplus.ts` cannot be evaluated (runtime import, syntax) or does not match the schema / invalid `index.mdx` frontmatter, two indexes with the same `flowId`, a `flowId` without an index, `domain` not in the config `domains`, file not named `<Folder>.periplus.ts`, doc outside `moduleRoot`/`include` |
| error | `unknown-target`, `unknown-source`, `unknown-external-flow` | link to an ID that does not exist (with a "did you mean") |
| error | `duplicate-node`, `duplicate-rule` | two docs producing the same node; repeated `rules[].id` in the flow |
| error | `missing-component`, `missing-file` | folder without code, `where`/`verify`/`triggers` pointing to a removed file |
| stale | `stale`, `missing-fingerprint`, `watchpaths-without-doc` | the screen code changed since the last `stamp`; the PR touches `watchPaths` without touching docs |
| warning | `symmetry`, `dead-end`, `orphan-node`, `missing-error-path`, `no-entry` | incomplete graph (e.g. a loading screen or a node with an API but no error path) |
| warning | `orphan-body` | `<Folder>.periplus.mdx` without its sibling `<Folder>.periplus.ts` |
| error | stale `generated/` | `build` was not run |

`--fail-on error` (default) fails only on errors and stale `generated/`; `stale` also includes stale docs; `warning` includes everything.

## Drift: fingerprint

`codeFingerprint` = sha256 of the files in the screen folder (ignoring tests, fixtures, `styles`, the `.periplus.ts` / `.periplus.mdx` files themselves, and subfolders that have their own doc) + extra `codePaths`. That is why `stamp` does not invalidate the hash it just wrote. `stamp` records the current value; `check` compares it.

- **Pros**: deterministic, independent of git history; catches changes to any file of the screen; no false negatives from commit renames.
- **Cons**: cosmetic changes (lint, variable renames) also mark the doc as stale — the developer reviews it and runs `stamp`; logic outside the folder (shared hooks/orchestration) must be listed in `codePaths` or in the index's `watchPaths`.

## Continuous integration

```yaml
# .github/workflows/periplus.yml
name: periplus
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npx periplus build --check
      - run: npx periplus check --fail-on error --format markdown --output periplus-report.md
```

With `--format markdown` the report can be posted as a PR comment (it starts with a stable marker, `<!-- periplus-check -->`, so a bot can update the same comment). Set `PERIPLUS_CHANGED` to the PR's changed files (JSON array or space-separated list) to enable the `watchpaths-without-doc` check.

## AI

AI **suggests, it does not decide**. `suggest` only reads code and writes a local file with `file:line` evidence; it never writes `to`. The included prompt lists the valid targets (from the manifest) and forbids inventing IDs. The generated `flow.context.md` is a deterministic summary of the whole flow for coding agents — no LLM is involved in producing it.

## Generated artifacts

| File | Purpose |
| --- | --- |
| `flows/<slug>/generated/flow.manifest.json` | Graph (nodes, edges, rules, APIs) consumed by the site |
| `flows/<slug>/generated/+flow.types.ts` | `FLOW_ID`, `<Flow>NodeId` union, `<Flow>LinkTarget`, `ScreenDoc` (type of the flow's docs), node map |
| `flows/<slug>/generated/flow.context.md` | Context for AI agents |
| `flows/<slug>/generated/diagram.mmd` | Mermaid (preview in PRs/GitHub) |
| `flows/generated/flows.catalog.json` / `+flows.catalog.ts` | Global catalog, external flows and links between flows |
| `flows/generated/+periplus.types.ts` | `PeriplusScreenDoc<Flow, Target>` and base types (`Rule`, `Api`, `Outgoing`…) used by every `ScreenDoc` |
| `flows/generated/flow-index.schema.json` | JSON Schema of the `index.mdx` frontmatter |

The `+` prefix keeps generated TS files at the top of the folder and makes it clear they are not edited by hand.

## Agent skill

The package ships the `periplus-docs` skill (`skills/periplus-docs/SKILL.md`), which teaches AI agents how to maintain the docs: the `.periplus.ts` format, when to update, and the `suggest` → review → `stamp` → `build`/`check` loop.

```bash
periplus skill                      # copies it to .cursor/skills/periplus-docs/SKILL.md
periplus skill --dir .agents/skills # another skills folder
periplus skill --force              # overwrites the local copy with the packaged version
```

Without `--force` the command never overwrites: if the local copy differs from the packaged version, it warns you. Run it again after upgrading `periplus`. Project-specific details (CI, scripts) belong in your site's README, not in the skill.

## Release channels

| dist-tag | Install | What it is |
| --- | --- | --- |
| `latest` | `npm i -D periplus` | Stable releases from `main` |
| `next` | `npm i -D periplus@next` | Pre-releases (`x.y.z-next.N`) from the `next` branch |
| `alpha` | `npm i -D periplus@alpha` | Throwaway snapshots of pull requests (`x.y.z-alpha-<timestamp>`) |

Versions below `1.0.0` may include breaking changes in minor releases; check the [changelog](./CHANGELOG.md) before upgrading.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the development setup, the release process (Changesets) and how alpha releases work.

## License

[MIT](./LICENSE) © Luis Felipe Agottani
