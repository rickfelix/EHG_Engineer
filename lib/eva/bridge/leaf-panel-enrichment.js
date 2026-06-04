/**
 * Leaf panel enrichment orchestrator
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-001 enrichment rail core)
 *
 * Runs the ordered product-definition panel over a SINGLE venture-build leaf to
 * produce an enriched PRD, replacing the static ARCHITECTURE_LAYERS template
 * that the RCA (RCA-LEO-BRIDGE-DECOMP-001) found leo_bridge stamping.
 *
 * Separation of concerns (mirrors the venture-build-consumer driveLeaf seam):
 *  - THIS LIB owns the bounded, fail-closed loop + section assembly. Headlessly
 *    unit-testable because the agent execution is INJECTED via `driver`.
 *  - The DRIVER owns running an actual leo_sub_agent. In a live session it
 *    dispatches Task/TeamCreate; in tests it is a stub.
 *
 * Fail-closed contract: if a REQUIRED agent cannot deliver within the attempt
 * cap, the orchestrator returns { status: 'held' } with NO enriched content. The
 * caller MUST NOT fall back to the template stub — holding (not stubbing) is the
 * whole point of the fix. Optional agents that fail are simply skipped.
 *
 * @module lib/eva/bridge/leaf-panel-enrichment
 */

import { buildOrderedManifest } from './agent-panel-manifest.js';
import { deriveVentureCriteria } from './venture-criteria-resolver.js';

const DEFAULT_MAX_ATTEMPTS_PER_AGENT = 2;

/**
 * A driver result is only USABLE if the agent succeeded AND returned a non-empty
 * section. SD-LEO-INFRA-WIRE-PRE-BUILD-002 (TR-2): an `{ ok: true, section: '' }`
 * (or whitespace / missing section) for a REQUIRED agent must route to HOLD — never
 * stamp a near-empty section as enriched content. Treating empty-as-ok was the
 * regression hole the prospective testing-agent surfaced (TS-2b). Optional agents
 * with an empty section are skipped, exactly as a hard failure would be.
 */
export function isUsableResult(result) {
  return !!(result && result.ok === true && typeof result.section === 'string' && result.section.trim().length > 0);
}

/** Leaf-key extraction tolerant of the several shapes a leaf payload takes. */
function leafKeyOf(leaf) {
  return leaf.key || leaf.sd_key || leaf.sdKey || null;
}

/**
 * Required-agent set for fail-closed evaluation. Architecture and venture-stack
 * compliance are always required; the schema agent is required when the venture
 * touches data. Intersected with the manifest actually selected.
 */
export function defaultRequiredCodes(manifest, criteria) {
  const req = ['API', 'VENTURE_STACK'];
  if (criteria.touchesData) req.push('DATABASE');
  return req.filter((code) => manifest.some((a) => a.code === code));
}

/** Assemble the enriched leaf description from the collected agent sections. */
export function assembleEnrichedDescription(leaf, sections) {
  const header = `${leaf.title || 'Leaf'} — product-definition enriched (${sections.length} agent section(s))`;
  const body = sections.map((s) => `## ${s.dimension} [${s.code}]\n${s.section}`).join('\n\n');
  return `${header}\n\n${body}`;
}

/**
 * Run the panel over a single leaf.
 *
 * @param {object} params
 * @param {object} params.leaf - leaf SD payload ({ title, description, sd_key, ... })
 * @param {string[]} [params.artifactTypes] - venture artifact_type signals (stages 0-18)
 * @param {object} [params.criteriaOpts] - { dataSensitive, archetype } classification
 * @param {{runAgent: (arg:{agent:object,leaf:object,priorSections:Array})=>Promise<{ok:boolean,section?:string,error?:string}>}} params.driver
 * @param {object} [params.options] - { maxAttemptsPerAgent, requiredCodes }
 * @returns {Promise<{status:'enriched'|'held', leafKey:(string|null), manifest:string[], sections:Array, enrichedDescription:(string|null), heldOn:(string|null)}>}
 */
export async function enrichLeafViaPanel({ leaf, artifactTypes, criteriaOpts, driver, options } = {}) {
  if (!leaf || typeof leaf !== 'object') throw new Error('enrichLeafViaPanel: `leaf` is required');
  if (!driver || typeof driver.runAgent !== 'function') throw new Error('enrichLeafViaPanel: `driver.runAgent` is required');

  const maxAttempts = options?.maxAttemptsPerAgent ?? DEFAULT_MAX_ATTEMPTS_PER_AGENT;
  const criteria = deriveVentureCriteria(artifactTypes, criteriaOpts);
  const manifest = buildOrderedManifest(criteria);
  const requiredCodes = new Set(options?.requiredCodes ?? defaultRequiredCodes(manifest, criteria));

  const sections = [];
  for (const agent of manifest) {
    let result = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await driver.runAgent({ agent, leaf, priorSections: sections.slice() });
      } catch (err) {
        result = { ok: false, error: err?.message };
      }
      if (isUsableResult(result)) break;
    }

    if (isUsableResult(result)) {
      sections.push({ dimension: agent.dimension, code: agent.code, layer: agent.layer, section: result.section });
    } else if (requiredCodes.has(agent.code)) {
      // fail-closed: a required agent could not deliver — HOLD, do not stub.
      return {
        status: 'held',
        leafKey: leafKeyOf(leaf),
        manifest: manifest.map((a) => a.code),
        sections,
        enrichedDescription: null,
        heldOn: agent.code,
      };
    }
    // optional agent failed -> skip and continue
  }

  return {
    status: 'enriched',
    leafKey: leafKeyOf(leaf),
    manifest: manifest.map((a) => a.code),
    sections,
    enrichedDescription: assembleEnrichedDescription(leaf, sections),
    heldOn: null,
  };
}
