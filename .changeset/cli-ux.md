---
"periplus": minor
---

Friendlier CLI: colored output, spinners for `init`, `build` and `check`, and prompts for missing arguments in a terminal (`init` wizard, `new` slug/module root, `node` flow picker, `stamp` mode). Typos get a "Did you mean…?" suggestion and `periplus <command> --help` shows per-command help.

Prompts and spinners are skipped with `--yes`/`-y`, `CI=true` or when output is piped; `NO_COLOR` and `FORCE_COLOR` are honored. `check --format json|markdown` and `--output` stay free of color codes.

Requires Node.js 20.12 or newer.
