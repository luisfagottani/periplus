---
"periplus": minor
---

Upgrade the site template to Astro 7, Starlight 0.42, `@astrojs/react` 7 and React 19 (with `@xyflow/react` 12.12).

**BREAKING:** the site scaffolded by `periplus init` now needs Node.js 22.12 or newer (Astro requirement). The CLI still runs on Node 20+. Existing sites can pick up the new theme with `periplus init <dir> --force`, then reinstall their dependencies.
