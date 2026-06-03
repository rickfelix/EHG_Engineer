/**
 * Agent Panel Manifest + DAG ordering
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-003 dynamic manifest, FR-004 panel internal DAG)
 *
 * The "GENERATE" stage of the pre-build product-definition rail assembles a
 * per-venture panel of internal EHG governance/enrichment agents (NOT customer
 * personas) and runs them in dependency order to enrich each leaf SD/PRD from
 * the venture's own prior-stage artifacts — replacing the static
 * ARCHITECTURE_LAYERS template in lifecycle-sd-bridge.js.
 *
 * This module is PURE LOGIC (no DB, no live-agent runtime) so it is headlessly
 * unit-testable. The live session supplies the agent-running driver separately
 * (mirrors the venture-build-consumer driveLeaf seam). The verify / sequencing /
 * synthesis stages are separate units (U3/U4) and are NOT part of this per-leaf
 * GENERATE manifest.
 *
 * @module lib/eva/bridge/agent-panel-manifest
 */

/**
 * Layer dependency graph for the GENERATE panel. Each layer lists the layers
 * that MUST be enriched before it (so the schema agent sees the architecture,
 * the test/acceptance agent sees schema+ui, etc.). Cross-cutting concerns
 * (security, venture-stack compliance) depend only on architecture so they run
 * early and inform everything downstream.
 */
export const LAYER_DEPENDENCIES = Object.freeze({
  architecture: [],
  compliance: ['architecture'],
  security: ['architecture'],
  schema: ['architecture'],
  business: ['architecture'],
  growth: ['architecture'],
  algorithm: ['architecture', 'schema'],
  ui: ['architecture', 'schema'],
  tests: ['architecture', 'schema', 'ui'],
});

/**
 * The catalog of product-definition panel agents. Each dimension maps to an
 * existing leo_sub_agents `code` (or a new one for VENTURE_STACK), the DAG
 * `layer` it occupies, whether it is cross-cutting, and a `condition` predicate
 * evaluated against the venture context to decide dynamic inclusion (FR-003).
 *
 * Conditions read ONLY from the resolved venture criteria object (see
 * resolveVentureCriteria) so selection is deterministic and auditable.
 */
export const PANEL_AGENTS = Object.freeze([
  { dimension: 'technical-architecture', code: 'API', layer: 'architecture', crossCutting: false, condition: () => true },
  { dimension: 'data-schema', code: 'DATABASE', layer: 'schema', crossCutting: false, condition: (c) => c.touchesData },
  { dimension: 'venture-stack-compliance', code: 'VENTURE_STACK', layer: 'compliance', crossCutting: true, condition: () => true },
  { dimension: 'risk-security-compliance', code: 'SECURITY', layer: 'security', crossCutting: true, condition: (c) => c.dataSensitive },
  { dimension: 'product-ux-design', code: 'DESIGN', layer: 'ui', crossCutting: false, condition: (c) => c.hasUI },
  { dimension: 'data-algorithm', code: 'PERFORMANCE', layer: 'algorithm', crossCutting: false, condition: (c) => c.archetype === 'algorithm-core' },
  { dimension: 'business-model-monetization', code: 'PRICING', layer: 'business', crossCutting: false, condition: (c) => c.monetizationRelevant },
  { dimension: 'marketing-growth-gtm', code: 'MARKETING', layer: 'growth', crossCutting: false, condition: (c) => c.growthRelevant },
  { dimension: 'acceptance-stories', code: 'STORIES', layer: 'tests', crossCutting: false, condition: () => true },
]);

/**
 * Normalize a venture context (registry row + prior-stage artifact signals)
 * into the boolean/enum criteria the panel conditions read. Unknown inputs
 * default to the inclusive/safe choice so a sparse venture still gets a
 * reasonable panel (architecture + schema + stack + stories always run).
 *
 * @param {object} ctx
 * @param {boolean} [ctx.dataSensitive]   touches sensitive/external data (S6 risk / security persona)
 * @param {boolean} [ctx.touchesData]     has a data model (S14 data_model present)
 * @param {boolean} [ctx.hasUI]           ships a user-facing surface
 * @param {string}  [ctx.archetype]       product archetype, e.g. 'algorithm-core' | 'crud' | 'content'
 * @param {boolean} [ctx.monetizationRelevant]
 * @param {boolean} [ctx.growthRelevant]
 * @returns {{dataSensitive:boolean,touchesData:boolean,hasUI:boolean,archetype:string,monetizationRelevant:boolean,growthRelevant:boolean}}
 */
export function resolveVentureCriteria(ctx = {}) {
  return {
    dataSensitive: ctx.dataSensitive === true,
    touchesData: ctx.touchesData !== false, // default true: most ventures have a data model
    hasUI: ctx.hasUI !== false, // default true
    archetype: ctx.archetype || 'crud',
    monetizationRelevant: ctx.monetizationRelevant === true,
    growthRelevant: ctx.growthRelevant === true,
  };
}

/**
 * FR-003: select the applicable panel agents for a venture from its criteria.
 * @param {object} ventureContext - raw context (passed through resolveVentureCriteria)
 * @returns {Array<object>} the subset of PANEL_AGENTS whose condition holds
 */
export function selectAgentManifest(ventureContext = {}) {
  const criteria = resolveVentureCriteria(ventureContext);
  return PANEL_AGENTS.filter((agent) => agent.condition(criteria));
}

/**
 * FR-004: order a set of panel agents by the layer dependency DAG so each agent
 * runs after the layers it consumes. Stable within a layer. Throws on an
 * unsatisfiable graph (cycle or unknown layer) rather than silently mis-ordering.
 *
 * @param {Array<object>} agents - agents (each with a `layer` in `layerDeps`)
 * @param {object} [layerDeps=LAYER_DEPENDENCIES] - layer dependency graph (injectable for testing)
 * @returns {Array<object>} agents in a valid topological order
 * @throws {Error} CYCLE / UNKNOWN_LAYER
 */
export function orderPanelDAG(agents, layerDeps = LAYER_DEPENDENCIES) {
  const layers = layerDeps;
  for (const a of agents) {
    if (!(a.layer in layers)) {
      const e = new Error(`UNKNOWN_LAYER: panel agent "${a.dimension}" has layer "${a.layer}" not in LAYER_DEPENDENCIES`);
      e.code = 'UNKNOWN_LAYER';
      throw e;
    }
  }
  // Kahn-style topological sort over the layers PRESENT in this manifest.
  const present = new Set(agents.map((a) => a.layer));
  const rank = new Map();
  const visiting = new Set();
  const computeRank = (layer, trail) => {
    if (rank.has(layer)) return rank.get(layer);
    if (visiting.has(layer)) {
      const e = new Error(`CYCLE: layer dependency cycle at "${layer}" (${[...trail, layer].join(' -> ')})`);
      e.code = 'CYCLE';
      throw e;
    }
    visiting.add(layer);
    let r = 0;
    for (const dep of layers[layer] || []) {
      // only count deps that are actually present so a sparse manifest still orders cleanly
      if (present.has(dep)) r = Math.max(r, computeRank(dep, [...trail, layer]) + 1);
    }
    visiting.delete(layer);
    rank.set(layer, r);
    return r;
  };
  for (const layer of present) computeRank(layer, []);
  // Stable sort: by rank, then original index. Cross-cutting agents keep their
  // (early) layer rank so they run before the work they inform.
  return agents
    .map((a, i) => ({ a, i, r: rank.get(a.layer) }))
    .sort((x, y) => (x.r - y.r) || (x.i - y.i))
    .map((x) => x.a);
}

/**
 * Convenience: select + order in one call. Returns the ordered manifest the
 * GENERATE stage will drive per leaf.
 * @param {object} ventureContext
 * @returns {Array<object>} ordered, selected panel agents
 */
export function buildOrderedManifest(ventureContext = {}) {
  return orderPanelDAG(selectAgentManifest(ventureContext));
}
