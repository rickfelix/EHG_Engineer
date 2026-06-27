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
    metadata: {
      seeded_from_venture_id: source.id,
      reseed: true,
      source_archetype: source.archetype || null,
    },
  });
}
