/**
 * Session-hosted panel driver + leaf-enrichment introspection
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-1
 *
 * Two pieces:
 *  - introspectLeafEnrichment(): PURE — resolves the ordered agent manifest + the
 *    required codes for a leaf from its venture-criteria signals, with ZERO driver
 *    dispatch and ZERO DB writes. This is the deterministic, testable contract the
 *    `--enrich-leaf --dry-run` CLI prints (TS-5a).
 *  - makePanelDriver(): builds the `driver.runAgent` the enrichment orchestrator
 *    (leaf-panel-enrichment.enrichLeafViaPanel) expects, by composing the headless
 *    author (panel-author.authorSection, FR-3). In a live session this authors each
 *    section via the LLM client-factory cascade; in tests the client is injected.
 *
 * The LIVE drive (real LLM dispatch over a real leaf) is session-hosted and NOT
 * headlessly unit-testable — it is covered by the FR-7 PLAN-VERIFY integration smoke.
 *
 * @module lib/eva/bridge/panel-driver
 */

import { buildOrderedManifest } from './agent-panel-manifest.js';
import { deriveVentureCriteria } from './venture-criteria-resolver.js';
import { defaultRequiredCodes } from './leaf-panel-enrichment.js';
import { authorSection } from './panel-author.js';

/**
 * Resolve what the panel WOULD run for a leaf — no side effects (TS-5a).
 * @param {object} params
 * @param {string[]} [params.artifactTypes] - venture artifact_type signals (stages 0-18)
 * @param {object} [params.criteriaOpts] - { dataSensitive, archetype }
 * @returns {{criteria:object, manifest:Array<{code,dimension,layer}>, requiredCodes:string[], wouldRunAgents:string[]}}
 */
export function introspectLeafEnrichment({ artifactTypes, criteriaOpts } = {}) {
  const criteria = deriveVentureCriteria(artifactTypes, criteriaOpts);
  const manifest = buildOrderedManifest(criteria);
  const requiredCodes = defaultRequiredCodes(manifest, criteria);
  return {
    criteria,
    manifest: manifest.map((a) => ({ code: a.code, dimension: a.dimension, layer: a.layer })),
    requiredCodes,
    wouldRunAgents: manifest.map((a) => a.code),
  };
}

/**
 * Build the session-hosted panel driver. Its runAgent authors ONE section headlessly
 * (FR-3 fail-closed contract), returning the {ok, section} the orchestrator expects.
 * @param {object} [params]
 * @param {object} [params.client] - injectable LLM client (defaults inside authorSection to getLLMClient)
 * @returns {{runAgent: Function}}
 */
export function makePanelDriver({ client } = {}) {
  return {
    async runAgent({ agent, leaf, priorSections }) {
      return authorSection({ agent, leaf, priorSections, client });
    },
  };
}

export default { introspectLeafEnrichment, makePanelDriver };
