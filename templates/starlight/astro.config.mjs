import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

import { loadProjectConfig } from "./src/lib/project.ts";
import { buildStarlightSidebar } from "./src/lib/sidebar.ts";

const { site = {} } = loadProjectConfig();

export default defineConfig({
  integrations: [
    react(),
    starlight({
      customCss: ["./src/styles/flow-starlight.css"],
      defaultLocale: "root",
      description: site.description ?? "",
      locales: {
        root: { label: "English", lang: "en" },
      },
      sidebar: buildStarlightSidebar(),
      social: site.githubUrl
        ? [{ href: site.githubUrl, icon: "github", label: "GitHub" }]
        : [],
      title: site.title ?? "Periplus",
    }),
  ],
  server: { port: 4322 },
});
