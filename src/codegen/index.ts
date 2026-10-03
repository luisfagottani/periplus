import type { Analysis } from "../analyze.ts";
import type { Ctx } from "../context.ts";
import type { FlowCatalog, FlowManifest } from "../manifest.ts";
import { renderContext } from "./context.ts";
import { renderIndexJsonSchema } from "./jsonSchema.ts";
import { renderMermaid } from "./mermaid.ts";
import {
  renderCatalogTypes,
  renderDocTypes,
  renderFlowTypes,
} from "./types.ts";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function flowGeneratedDir(ctx: Ctx, slug: string): string {
  return `${ctx.config.flowsDir}/${slug}/generated`;
}

export function globalGeneratedDir(ctx: Ctx): string {
  return `${ctx.config.flowsDir}/generated`;
}

export function buildCatalog(ctx: Ctx, manifests: FlowManifest[]): FlowCatalog {
  const crossLinks = new Map<
    string,
    { from: string; to: string; reasons: string[] }
  >();

  for (const manifest of manifests) {
    const from = manifest.flow.flowId;
    for (const edge of manifest.edges) {
      if (edge.kind !== "flow") {
        continue;
      }
      const outbound = edge.target.startsWith("flow:");
      const other = (outbound ? edge.target : edge.source).slice(
        "flow:".length
      );
      const key = outbound ? `${from}->${other}` : `${other}->${from}`;
      const link = crossLinks.get(key) ?? {
        from: outbound ? from : other,
        to: outbound ? other : from,
        reasons: [],
      };
      if (!link.reasons.includes(edge.reason)) {
        link.reasons.push(edge.reason);
      }
      crossLinks.set(key, link);
    }
  }

  const documented = new Set(manifests.map((m) => m.flow.flowId));
  const domains = new Map(Object.entries(ctx.config.domains));
  for (const manifest of manifests) {
    if (!domains.has(manifest.flow.domain)) {
      domains.set(manifest.flow.domain, manifest.flow.domain);
    }
  }

  return {
    version: 1,
    generatedBy: "periplus",
    project: ctx.config.project,
    domains: [...domains].map(([id, label]) => ({ id, label })),
    flows: manifests
      .map((manifest) => ({
        flowId: manifest.flow.flowId,
        slug: manifest.flow.slug,
        title: manifest.flow.title,
        domain: manifest.flow.domain,
        status: manifest.flow.status,
        moduleRoot: manifest.flow.moduleRoot,
        manifestPath: `${flowGeneratedDir(ctx, manifest.flow.slug)}/flow.manifest.json`,
        screens: manifest.screens.map((screen) => ({
          screenRef: screen.screenRef,
          title: screen.title,
          pageSlug: screen.pageSlug,
        })),
      }))
      .sort((a, b) => a.flowId.localeCompare(b.flowId)),
    externalFlows: Object.entries(ctx.config.externalFlows)
      .filter(([flowId]) => !documented.has(flowId))
      .map(([flowId, ext]) => ({ flowId, ...ext }))
      .sort((a, b) => a.flowId.localeCompare(b.flowId)),
    crossLinks: [...crossLinks.values()].sort((a, b) =>
      `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`)
    ),
  };
}

/** Every generated artifact, keyed by path relative to the repo root. */
export function generateArtifacts(
  ctx: Ctx,
  analysis: Analysis
): Map<string, string> {
  const files = new Map<string, string>();
  const manifests = analysis.models.map((model) => model.manifest);

  for (const manifest of manifests) {
    const dir = flowGeneratedDir(ctx, manifest.flow.slug);
    files.set(`${dir}/flow.manifest.json`, json(manifest));
    files.set(`${dir}/+flow.types.ts`, renderFlowTypes(manifest));
    files.set(`${dir}/flow.context.md`, renderContext(manifest));
    files.set(`${dir}/diagram.mmd`, renderMermaid(manifest));
  }

  const catalog = buildCatalog(ctx, manifests);
  const global = globalGeneratedDir(ctx);
  files.set(`${global}/flows.catalog.json`, json(catalog));
  files.set(`${global}/+flows.catalog.ts`, renderCatalogTypes(catalog));
  files.set(`${global}/+periplus.types.ts`, renderDocTypes());
  files.set(`${global}/flow-index.schema.json`, renderIndexJsonSchema());

  return files;
}
