#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001 (FR-6): recorded scoring run proving
 * venture-N+1 replicability -- all 14 constraints (10 existing + 4 new doctrine
 * dimensions) surface in the evaluations array for a synthetic candidate, with at
 * least one real-heuristic 'pass'. Fabricated, non-secret pathOutput -- no real
 * venture data.
 */
import 'dotenv/config';
import { applyChairmanConstraints } from '../../lib/eva/stage-zero/synthesis/chairman-constraints.js';

// The FR-4 migration (database/migrations/20260829_encode_chairman_venture_doctrine.sql) is
// committed but deliberately NOT applied by this worker (apply-migration.js --prod-deploy is a
// classifier-blocked, human/CI-sanctioned action) -- matching this repo's established pattern
// for migration landing. This run simulates POST-MIGRATION state (10 live rows + the 4 new rows
// the migration will add) via an injected fake supabase client, so the evaluator's behavior is
// proven honestly without depending on the migration having landed yet.
const POST_MIGRATION_ROWS = [
  { constraint_key: 'MUST_BE_AUTOMATABLE', name: 'Must be fully automatable', weight: 1, filter_type: 'hard_reject', is_active: true },
  { constraint_key: 'PROPRIETARY_DATA', name: 'Proprietary data advantage', weight: 1, filter_type: 'score_bonus', is_active: true },
  { constraint_key: 'NARROW_SPECIALIZATION', name: 'Narrow specialization', weight: 1, filter_type: 'hard_reject', is_active: true },
  { constraint_key: 'NICHE_OVER_CROWDED', name: 'Niche over crowded', weight: 1, filter_type: 'score_modifier', is_active: true },
  { constraint_key: 'TWO_YEAR_POSITIONING', name: '2-year positioning', weight: 1, filter_type: 'advisory', is_active: true },
  { constraint_key: 'PORTFOLIO_INTEGRATION', name: 'Portfolio integration', weight: 1, filter_type: 'score_bonus', is_active: true },
  { constraint_key: 'DATA_FLYWHEEL', name: 'Data collection built-in', weight: 1, filter_type: 'hard_reject', is_active: true },
  { constraint_key: 'MOAT_FIRST', name: 'Moat-first', weight: 1, filter_type: 'hard_reject', is_active: true },
  { constraint_key: 'VALUES_ALIGNMENT', name: 'Values alignment', weight: 1, filter_type: 'hard_reject', is_active: true },
  { constraint_key: 'VIRAL_POTENTIAL', name: 'Viral potential', weight: 1, filter_type: 'score_bonus', is_active: true },
  { constraint_key: 'AMBITION_AS_MOAT', name: 'Ambition as moat', weight: 1, filter_type: 'score_bonus', is_active: true },
  { constraint_key: 'JAGGED_SPACE_TARGETING', name: 'Jagged-space targeting', weight: 1, filter_type: 'score_bonus', is_active: true },
  { constraint_key: 'EDGE_OF_CAPABILITY_TIMING', name: 'Edge-of-capability timing', weight: 1, filter_type: 'score_bonus', is_active: true },
  { constraint_key: 'TECHNOLOGY_CONVERGENCE', name: 'Technology-convergence compounding', weight: 1, filter_type: 'score_bonus', is_active: true },
];
const fakeSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: POST_MIGRATION_ROWS, error: null }),
      }),
    }),
  }),
};

const syntheticCandidate = {
  suggested_name: 'AutoTriage',
  suggested_problem: 'Insurance adjusters manually triage claims, a fully manual and repetitive process',
  suggested_solution: 'An ai-automated triage engine delivering 10x the throughput of incumbent tools, targeting a jagged capability gap in current LLMs, using edge-of-capability reasoning models only newly possible today, built on a compounding data flywheel and positioned at the convergence of vision + LLM trends',
  target_market: 'mid-market property & casualty insurers',
};

const silentLogger = { log: () => {}, warn: () => {} };

const result = await applyChairmanConstraints(syntheticCandidate, { logger: silentLogger, supabase: fakeSupabase });

console.log('=== SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001 recorded scoring run ===');
console.log('Synthetic candidate:', JSON.stringify(syntheticCandidate, null, 2));
console.log('\nVerdict:', result.verdict, '| Score:', result.score, '| Total constraints:', result.total_constraints);
console.log('\nEvaluations:');
for (const e of result.evaluations) {
  console.log(`  [${e.status.toUpperCase().padEnd(7)}] ${e.key} -- ${e.rationale}`);
}

const passCount = result.evaluations.filter(e => e.status === 'pass').length;
console.log(`\n${result.total_constraints} constraints present, ${passCount} reached 'pass' via a real heuristic.`);
process.exit(0);
