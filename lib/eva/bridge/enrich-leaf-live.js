/**
 * Live leaf-enrichment orchestrator
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-4 (+ composes FR-1/FR-2/FR-3)
 *
 * Wraps the pure panel orchestrator (enrichLeafViaPanel) with the two production
 * SIDE EFFECTS that make the dormant venture-leaf gate non-dormant (premise C1):
 *   1. FR-4: write FRESH PASSING VENTURE_STACK evidence to sub_agent_execution_results
 *      via the canonical writer — this is the real producer->consumer seam, because
 *      evaluateLeafReadinessLive reads sub_agent_execution_results ROWS, not the
 *      enriched text. Without this write, an enrolled leaf blocks SUBAGENT_EVIDENCE_MISSING.
 *   2. FR-2: persist the panel's capabilities to sd_capabilities (idempotent mapper).
 * On HOLD, NEITHER side effect runs (no evidence, no capabilities) — fail-closed.
 *
 * The evidence writer is INJECTABLE: the composition/ordering/HOLD-skip logic is
 * unit-tested here against the REAL evaluateLeafReadinessLive (TS-1b); the canonical
 * storeSubAgentResults wiring is exercised by the FR-7 PLAN-VERIFY integration smoke.
 *
 * @module lib/eva/bridge/enrich-leaf-live
 */

import { enrichLeafViaPanel } from './leaf-panel-enrichment.js';
import { writeLeafCapabilities } from './capability-writer.js';
import { storeSubAgentResults } from '../../sub-agent-executor/index.js';

/**
 * Default VENTURE_STACK evidence writer (the LIVE path — covered by FR-7, not unit tests).
 * Routes through the canonical storeSubAgentResults so dedup/freshness (R6) hold.
 */
export async function defaultVentureStackEvidenceWriter({ code, sdId, sdKey, verdict, sections }) {
  return storeSubAgentResults(code, sdId, { code }, {
    verdict,
    summary: `Live panel enrichment produced ${sections?.length || 0} section(s) for ${sdKey}`,
    execution_time_ms: 0,
  }, { sdKey });
}

/**
 * Run the live panel over a leaf, then (on enrichment) write VENTURE_STACK evidence
 * and persist capabilities.
 * @param {object} params
 * @param {object} params.leaf - leaf SD row ({ id, sd_key, title, ... })
 * @param {string[]} [params.artifactTypes]
 * @param {object} [params.criteriaOpts]
 * @param {{runAgent:Function}} params.driver - session-hosted panel driver (makePanelDriver)
 * @param {object} [params.supabase] - client for the capability UPSERT (omit to skip caps)
 * @param {string} [params.ventureId]
 * @param {Array} [params.existing] - prior capabilities for reuse lookup
 * @param {object} [params.options] - enrichLeafViaPanel options
 * @param {Function} [params.writeEvidence] - injectable; defaults to the canonical writer
 * @param {Function} [params.writeCapabilities] - injectable; defaults to writeLeafCapabilities
 * @returns {Promise<object>} the enrich result + { evidenceWritten, capabilitiesWritten }
 */
export async function enrichLeafLive({
  leaf, artifactTypes, criteriaOpts, driver, supabase, ventureId,
  existing = [], options = {},
  writeEvidence = defaultVentureStackEvidenceWriter,
  writeCapabilities = writeLeafCapabilities,
} = {}) {
  if (!leaf || typeof leaf !== 'object') throw new Error('enrichLeafLive: `leaf` is required');
  const result = await enrichLeafViaPanel({ leaf, artifactTypes, criteriaOpts, driver, options });

  // HOLD => fail-closed: NO evidence, NO capabilities. The caller (bridge) surfaces the HOLD.
  if (result.status !== 'enriched') {
    return { ...result, evidenceWritten: false, capabilitiesWritten: 0 };
  }

  // FR-4: fresh PASSING VENTURE_STACK evidence so the gate reads it (C1 seam).
  await writeEvidence({ code: 'VENTURE_STACK', sdId: leaf.id || leaf.sd_uuid || leaf.sd_key, sdKey: leaf.sd_key, verdict: 'PASS', sections: result.sections });

  // FR-2: persist capabilities (only when a client is provided).
  let capabilitiesWritten = 0;
  if (supabase) {
    const cap = await writeCapabilities(supabase, result.sections, existing, { sdId: leaf.sd_key, sdUuid: leaf.id, ventureId });
    capabilitiesWritten = cap.written;
  }

  return { ...result, evidenceWritten: true, capabilitiesWritten };
}

export default { enrichLeafLive, defaultVentureStackEvidenceWriter };
