/**
 * Path 4: Venture Reseeding (clean-clone seed-and-re-run)
 *
 * Seeds a NEW venture from an EXISTING venture's DURABLE validated thesis
 * (metadata.stage_zero + problem_statement/solution/target_market/archetype) and
 * returns a standard PathOutput so the new venture re-runs S0->S19 FRESH with
 * current grounding. It reads ONLY durable thesis inputs — never stage_N /
 * venture_stage_work rows — so the staleness of the source venture's prior run is
 * NOT re-imported (the whole point of a "clean" clone).
 *
 * Part of SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-A (FR-2)
 */

import { createPathOutput } from '../interfaces.js';
// SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 (CH-6): this path never invoked the
// traversability gate — a candidate entering here skipped the capability check entirely.
import { loadCapabilityEnvelope, checkTraversability, parkFailedCandidate } from '../traversability-gate.js';

/**
 * Execute the venture-reseeding path.
 *
 * @param {Object} params
 * @param {string} params.source_venture_id - The venture whose durable thesis is reused
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} PathOutput (origin_type='seeded_from_venture')
 */
export async function executeVentureReseeding({ source_venture_id }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }
  if (!source_venture_id) {
    throw new Error('source_venture_id is required to reseed a venture');
  }

  // Read ONLY the durable thesis columns + metadata.stage_zero — explicitly NOT
  // venture_stage_work / stage_N rows (no staleness re-import).
  const { data: source, error } = await supabase
    .from('ventures')
    .select('id, name, problem_statement, solution, target_market, archetype, raw_chairman_intent, moat_strategy, metadata')
    .eq('id', source_venture_id)
    .single();

  if (error || !source) {
    throw new Error(
      `source venture not found for reseed: ${source_venture_id}${error ? ` (${error.message})` : ''}`
    );
  }

  const sz = source.metadata?.stage_zero || {};
  const problem = source.problem_statement || '';
  const solution = source.solution || sz.solution || '';
  const target = source.target_market || '';

  // Fail loud rather than seed a blank venture from a source that has no thesis.
  if (!problem && !solution) {
    throw new Error(
      `source venture ${source_venture_id} has no durable thesis (problem/solution) to reseed`
    );
  }

  logger.log(
    `   Reseeding from venture ${source.name || source_venture_id} — durable thesis only (no stage rows copied)`
  );

  // SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 FR-2: carry forward the source
  // venture's own required_capabilities if its original Stage-0 run declared one —
  // best-effort propagation, not fabrication (the source may predate this field).
  const requiredCapabilities = sz.required_capabilities;

  // Step 3.5: TRAVERSABILITY GATE — hard, in the selection path, not advisory.
  // Mirrors discovery-mode.js's gate invocation (SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001,
  // spec R6). Single candidate, not a ranked array — wrap it in a 1-element array.
  // EnvelopeUnavailableError propagates unhandled: the run fails closed, never silently ungated.
  const gateCandidate = {
    name: source.name ? `${source.name} (clean clone)` : 'Reseeded venture',
    problem_statement: problem,
    solution,
    target_market: target,
    required_capabilities: requiredCapabilities,
  };
  const envelope = await loadCapabilityEnvelope({ supabase, logger });
  const gate = checkTraversability([gateCandidate], envelope);
  if (gate.failed.length > 0) {
    try {
      await parkFailedCandidate(gate.failed[0], { strategy: 'seeded_from_venture' }, { supabase, logger });
    } catch (parkErr) {
      logger.warn(`   Traversability gate: parking failed for '${gateCandidate.name}': ${parkErr.message}`);
    }
    return null;
  }

  return createPathOutput({
    origin_type: 'seeded_from_venture',
    raw_material: {
      source_venture_id: source.id,
      durable_thesis: {
        problem,
        solution,
        target_market: target,
        archetype: source.archetype || null,
        raw_chairman_intent: source.raw_chairman_intent || null,
        moat_strategy: source.moat_strategy || null,
      },
    },
    suggested_name: source.name ? `${source.name} (clean clone)` : 'Reseeded venture',
    suggested_problem: problem,
    suggested_solution: solution,
    target_market: target,
    ...(requiredCapabilities ? { required_capabilities: requiredCapabilities } : {}),
    metadata: {
      seeded_from_venture_id: source.id,
      reseed: true,
      source_archetype: source.archetype || null,
    },
  });
}
