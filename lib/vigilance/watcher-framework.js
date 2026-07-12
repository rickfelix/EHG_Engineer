/**
 * Source-agnostic observed-source watcher framework — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F FR-2/TR-3.
 *
 * Mirrors lib/creative/generate-asset.js's provider-abstraction pattern (Child D): an
 * ADAPTER_ROUTES table keyed by source kind is the ONE seam adapters register against — the
 * decision of which source to use lives HERE, never inlined at callers. manual_brief is the
 * one concrete, ungated implementation shipped now (Phase-0 doc option c). Future automated
 * sources (web research, dormant store pollers) register a new key without framework rework —
 * both are still gated on the chairman's open Section-3 decision, so they are NOT registered here.
 *
 * Writes go through lib/org/evidence-fabric.mjs::writeEvidence (the fabric Child B purpose-built
 * for this satellite — see lib/vigilance/errors.js/provenance.js headers) — NOT a hand-rolled
 * insert, and NOT a new table. FR-3's write-time guard (reject writes with neither FETCHED nor
 * ATTESTED provenance) is enforced HERE, before the fabric write, so it applies uniformly to
 * every current and future adapter.
 */
import { writeEvidence } from '../org/evidence-fabric.mjs';
import { validateObservationProvenance, toEvidenceFabricProvenance } from './provenance.js';
import { AdapterNotConfiguredError, ObservationRejectedError } from './errors.js';
import { manualBriefAdapter } from './adapters/manual-brief-adapter.js';

const EVIDENCE_KIND = 'vigilance_observation';

/**
 * Adapter route table: { sourceKind: { isConfigured(), submit(input) } }.
 * `submit(input)` returns a normalized observation: { subjectType, subjectId, thesis, summary,
 * payload, provenanceKind, capturedAt, url?, method?, attestedBy? } — see manual-brief-adapter.js
 * for the concrete shape. Frozen so a caller cannot mutate the route table at runtime.
 */
export const ADAPTER_ROUTES = Object.freeze({
  manual_brief: manualBriefAdapter,
  // web_research: NOT REGISTERED — chairman Section-3 decision still open (Phase-0 doc).
  // store_poller: NOT REGISTERED — dormant pollers are sanctioned-alive but not wired here
  //   (lib/eva/stage-zero/data-pollers/* is explicitly out of scope, FR-3).
});

export { EVIDENCE_KIND };

/**
 * Run one watcher sweep: dispatch to the adapter for `sourceKind`, validate the resulting
 * observation's provenance (FR-3 guard — reject neither FETCHED nor ATTESTED), and write it to
 * portfolio_evidence via evidence-fabric. Throws AdapterNotConfiguredError /
 * ObservationRejectedError on failure — never a silent no-op success.
 *
 * @param {string} sourceKind - key into ADAPTER_ROUTES (e.g. 'manual_brief')
 * @param {object} input - adapter-specific submission payload
 * @param {{ supabase: object }} deps - injected service-role client (house convention — never constructed internally)
 * @returns {Promise<object>} the written portfolio_evidence row
 */
export async function runWatcherSweep(sourceKind, input, deps) {
  const adapter = ADAPTER_ROUTES[sourceKind];
  if (!adapter) throw new AdapterNotConfiguredError(sourceKind);
  if (adapter.isConfigured && !adapter.isConfigured()) throw new AdapterNotConfiguredError(sourceKind);

  const observation = await adapter.submit(input);

  const check = validateObservationProvenance(observation);
  if (!check.valid) throw new ObservationRejectedError(check.reason, { sourceKind, observation });

  const provenance = toEvidenceFabricProvenance(observation.provenanceKind);

  return writeEvidence(deps.supabase, {
    evidenceKind: EVIDENCE_KIND,
    provenance,
    ventureId: observation.ventureId ?? null,
    sourceModule: 'vigilance_loop',
    subjectType: observation.subjectType ?? null,
    subjectId: observation.subjectId ?? null,
    observedAt: observation.capturedAt,
    // extraPayload spreads FIRST so the canonical, provenance-guard-validated fields below
    // ALWAYS win on a key collision — a caller-supplied extra field can only ADD data, never
    // spoof the audit trail (e.g. claim FETCHED provenance / substitute the validated summary).
    // Mirrors lib/sourcing-engine/escalator.js::buildQueueRow's own extraContext-spreads-first
    // convention (adversarial review 2026-07-12: this file originally had the order reversed).
    payload: {
      ...(observation.payload && typeof observation.payload === 'object' ? observation.payload : {}),
      source_kind: sourceKind,
      observation_provenance_kind: observation.provenanceKind,
      thesis: observation.thesis ?? null,
      summary: observation.summary ?? null,
      url: observation.url ?? null,
      method: observation.method ?? null,
      attested_by: observation.attestedBy ?? null,
    },
  });
}
