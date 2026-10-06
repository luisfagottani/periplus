# Contributing to Periplus

Thanks for helping! Issues and pull requests are welcome. Please follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Before you start

- **Bugs:** open an issue with the bug template (version, Node, command, `periplus check` output and a minimal reproduction).
- **Features or bigger changes:** open a feature request or a discussion first, so we can agree on the approach before you write code.
- **Security issues:** never open a public issue; see [SECURITY.md](./SECURITY.md).

## Development setup

Requirements: Node.js 24 (see `.nvmrc`) and pnpm (the version is pinned in `package.json` through `packageManager`; `corepack enable` picks it up).

```bash
git clone https://github.com/luisfagottani/periplus.git
cd periplus
pnpm install
```

| Command | What it does |
| --- | --- |
| `pnpm cli <command>` | Runs the CLI from source (`tsx src/cli.ts`) |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Ultracite (Biome) + publint |
| `pnpm format` | Ultracite fix (formatting and safe lint fixes) |
| `pnpm build` | Bundles `dist/cli.mjs` with tsdown |
| `pnpm smoke` | Runs the built CLI end to end in an empty project |
| `node scripts/verify-site.mjs [--keep]` | Scaffolds a project with the built CLI, then runs `astro check` and `astro build` on the site |

The published CLI targets Node 20+, while development and CI run on Node 24. Avoid runtime APIs newer than Node 20 in `src/`; CI runs the smoke test on Node 20. The site template needs Node 22.12+ (Astro); the `site` CI job runs `verify-site.mjs` on Node 22.

The repository ships VS Code/Cursor settings that format and fix on save with Biome. Install the recommended extensions when prompted.

## Project layout

- `src/` — the CLI (commands, discovery, graph, codegen).
- `templates/starlight/` — the Astro + Starlight site copied by `periplus init`. It is linted here and type-checked/built in a real project by `scripts/verify-site.mjs`. Its `package-lock.json` pins the site dependencies for CI; it is excluded from the npm tarball and never copied by `init`.
- `skills/periplus-docs/` — the agent skill installed by `periplus skill`.
- `test/` — Vitest suites that build temporary projects.

## Pull requests

1. Fork the repository and create a branch from `main` (or from `next` for work that targets the next pre-release line).
2. Keep the change focused and add or update tests.
3. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` locally.
4. **Add a changeset** if the change affects the published package (see below).
5. Open the PR using the template. Use a [Conventional Commits](https://www.conventionalcommits.org/) style title (`fix: …`, `feat: …`, `docs: …`); PRs are squash-merged with that title.

`main` and `next` are protected: every PR needs green CI and an approval from the code owner (@luisfagottani). Workflows from first-time contributors' forks run after a maintainer approves them.

## Changesets

Releases are driven by [Changesets](https://github.com/changesets/changesets). Every PR that changes the behavior of the published package (CLI, templates, skill, `package.json`) needs a changeset:

```bash
pnpm changeset
```

Pick the bump and write a user-facing summary:

- `patch` — bug fixes and internal improvements;
- `minor` — new features (and, while we are below `1.0.0`, breaking changes, flagged with **BREAKING** in the summary);
- `major` — breaking changes after `1.0.0`.

Docs-only, CI-only or test-only PRs do not need one. CI warns when the package changes without a changeset.

## How releases work

1. Merging PRs with changesets into `main` makes the release workflow open (or update) a **"Version Packages"** PR that bumps `package.json` and writes `CHANGELOG.md`.
2. When that PR is merged, the release workflow publishes to npm with the `latest` dist-tag, pushes the git tag and creates the GitHub release. Publishing waits for the maintainer's approval in the `npm-publish` environment.

## Alpha snapshots

Want to try a PR in a real project before it is merged? A maintainer adds the **`release:alpha`** label to the PR (branches of this repository only; forks cannot publish). After the maintainer approves the `npm-publish` environment, a snapshot such as `periplus@0.0.2-alpha-20261003120000` is published under the `alpha` dist-tag and the version is commented on the PR:

```bash
pnpm add -D periplus@alpha
```

The PR needs at least one changeset, since the snapshot version is calculated from it. Remove and re-add the label to publish a new snapshot. Maintainers can also run the **alpha snapshot** workflow manually for any ref.

## The `next` branch (pre-releases)

Larger features that need a longer testing period go to the `next` branch, which stays in Changesets pre mode:

```bash
# once, when opening a new pre-release line
git switch -c next main
pnpm changeset pre enter next
git commit -am "chore: enter pre mode" && git push -u origin next
```

PRs into `next` work like PRs into `main`: the release workflow opens a "Version Packages (next)" PR, and merging it publishes `x.y.z-next.N` under the `next` dist-tag (`pnpm add -D periplus@next`).

To ship the line as stable:

```bash
git switch next
pnpm changeset pre exit
git commit -am "chore: exit pre mode"
```

Then open a PR from `next` into `main`. Once merged, the regular "Version Packages" PR releases it under `latest`.

## Maintainers: repository setup

`scripts/setup-repo.sh` applies the repository settings, rulesets (`.github/rulesets/`), labels and the `npm-publish` environment through `gh`. The rest is manual:

1. Create a GitHub App (e.g. `periplus-release-bot`) with **Contents** and **Pull requests** read/write permissions, install it on this repository, then save its Client ID as the `RELEASE_APP_CLIENT_ID` variable and its private key as the `RELEASE_APP_PRIVATE_KEY` secret. Re-run the setup script with `RELEASE_APP_ID=<app id>` so the App can push release tags.
2. Configure **Trusted Publishing** on npmjs.com (package `periplus` → repository `luisfagottani/periplus`, workflows `release.yml` and `alpha-snapshot.yml`, environment `npm-publish`). Release and alpha workflows authenticate with OIDC only (`registry-url` + `id-token: write`); do not store an `NPM_TOKEN` secret.
3. **First publish only:** if the package does not exist on npm yet, use a granular token with bypass 2FA (or classic Automation) in `NPM_TOKEN` once, then remove it after Trusted Publishing is active.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
