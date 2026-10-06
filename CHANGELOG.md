# periplus

## 0.1.0

### Minor Changes

- [#13](https://github.com/luisfagottani/periplus/pull/13) [`be59a39`](https://github.com/luisfagottani/periplus/commit/be59a39a944809037dbed9afab1b72a9cd1aedc1) Thanks [@luisfagottani](https://github.com/luisfagottani)! - Upgrade the site template to Astro 7, Starlight 0.42, `@astrojs/react` 7 and React 19 (with `@xyflow/react` 12.12).
  
  **BREAKING:** the site scaffolded by `periplus init` now needs Node.js 22.12 or newer (Astro requirement). The CLI still runs on Node 20+. Existing sites can pick up the new theme with `periplus init <dir> --force`, then reinstall their dependencies.

### Patch Changes

- [#8](https://github.com/luisfagottani/periplus/pull/8) [`22bb828`](https://github.com/luisfagottani/periplus/commit/22bb828a00c01b78855594de36a3d182e9a23a3a) Thanks [@luisfagottani](https://github.com/luisfagottani)! - Release and alpha CI publish via npm Trusted Publishing (OIDC); no stored NPM_TOKEN.

## 0.0.1

### Patch Changes

- [`06c5646`](https://github.com/luisfagottani/periplus/commit/06c5646a916a7e6888895966b8ba7987dbd38d38) Thanks [@luisfagottani](https://github.com/luisfagottani)! - Initial public release: typed screen docs (`*.periplus.ts`), `init`/`skill`/`new`/`node`/`suggest`/`stamp`/`check`/`build`/`dev` commands, generated types, manifests and AI context, and the Astro + Starlight site template.
