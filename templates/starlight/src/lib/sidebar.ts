import { type CatalogFlow, flowHref, loadCatalog, screenHref } from "./catalog";

interface SidebarLink {
  label: string;
  link: string;
  badge?: { text: string; variant: "caution" | "note" };
}
interface SidebarAutogenerate {
  autogenerate: { directory: string };
}
interface SidebarGroup {
  label: string;
  collapsed?: boolean;
  items: Array<SidebarLink | SidebarGroup | SidebarAutogenerate>;
}
type SidebarItem = SidebarLink | SidebarGroup;

function flowGroup(flow: CatalogFlow): SidebarGroup {
  return {
    label: flow.title,
    collapsed: true,
    items: [
      {
        label: "Overview",
        link: flowHref(flow),
        ...(flow.status === "wip"
          ? { badge: { text: "wip", variant: "caution" as const } }
          : {}),
      },
      ...flow.screens.map((screen) => ({
        label: screen.title,
        link: screenHref(flow, screen.pageSlug),
      })),
    ],
  };
}

/** Sidebar built from `flows/generated/flows.catalog.json` (screens in flow order). */
export function buildStarlightSidebar(): SidebarItem[] {
  const { flows, domains } = loadCatalog();

  const domainGroups = domains
    .map((domain) => ({
      label: domain.label,
      items: flows
        .filter((flow) => flow.domain === domain.id)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(flowGroup),
    }))
    .filter((group) => group.items.length > 0);

  return [
    { label: "Guide", items: [{ autogenerate: { directory: "guide" } }] },
    { label: "Overview map", link: "/overview/" },
    ...domainGroups,
  ];
}
