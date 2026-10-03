# Periplus site

Your project's journey site (**Astro Starlight** + **React Flow**), installed by `periplus init`. It has no source of its own: it renders what `periplus build` generates from `flows/<slug>/index.mdx` and from the `*.periplus.ts` files (+ `*.periplus.mdx` bodies) colocated with your screens.

## Commands

```bash
npm install            # first time, in this folder
npx periplus build     # at the project root: generates the catalog, manifests and pages in src/content/docs/flows/
npm run dev            # http://localhost:4322
npx periplus dev       # in another terminal: regenerates everything whenever a doc is saved
npm run build          # static site in dist/
```

The site finds the project root by walking up until it finds `periplus.config.json` (or via the `PERIPLUS_ROOT` env var). Title, description and GitHub link come from the `site` block of that config; code links use `repoUrl`.

## What is yours and what belongs to the theme

- **Yours:** `src/content/docs/` (except `flows/`, which is generated). Edit the home page, add guides, delete what you don't need.
- **Theme:** `src/components/`, `src/lib/`, `src/styles/`, `astro.config.mjs`. To update it, run `periplus init <folder> --force` and review the diff.
