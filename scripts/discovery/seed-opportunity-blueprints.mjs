#!/usr/bin/env node
/**
 * Seed the opportunity_blueprints active queue from cancelled-venture history.
 * SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001 (FR-1/FR-2/FR-3)
 *
 * TESTING finding T-1 (evidence 341b6080): this is an AUTHORING task, not a mining task --
 * ventures.unique_value_proposition is 0/157 populated, and the only 20 non-fixture ventures
 * are ALL status=cancelled. Sources problem/market context from cancelled ventures'
 * problem_statement/target_market, then AUTHORS the buildable-first shape, kill_assumption,
 * spof_assumption fields evaluateIntakeBar() actually reads (none exist as ventures columns).
 *
 * TESTING finding T-2: source_type must NOT be 'manual' -- reseed-queue.mjs's classify()
 * archives any row with source_type==='manual' as e2e_fixture on the next reseed run,
 * silently re-zeroing the gauge this SD exists to flip. Uses 'ai_generated' (matches the
 * existing real_idea convention reseed-queue.mjs's own comment names).
 *
 * TESTING finding T-3/T-4: writes via the REAL call chain -- saveBlueprintsToDatabase()
 * (which internally calls buildBlueprintRow()/evaluateIntakeBar()), not buildBlueprintRow()
 * called directly as a full-row writer.
 *
 * TESTING finding T-5: every blueprint preserves its source venture's kill_reason so a
 * reconsidered idea is never silently resurrected without its prior failure context.
 *
 * Usage: node scripts/discovery/seed-opportunity-blueprints.mjs [--apply]
 * (dry-run by default; --apply writes to opportunity_blueprints)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import OpportunityDiscoveryService from '../../lib/discovery/opportunity-discovery-service.js';

const APPLY = process.argv.includes('--apply');

// TESTING finding: only 20 non-fixture/non-demo/non-scaffolding ventures exist, all
// status=cancelled. Selected 3 with the richest, most genuine problem_statement content
// (excluding literal test-named rows like "State-Test-*" and explicitly flagged
// pilot/test-fixture rows like CronGenius, per its own kill_reason citing
// SD-LEO-INFRA-PILOT-VENTURE-GUARD-001). Two (Canvas AI, CronLinter) already carry their own
// competitive_baselines row; Market Modeling SaaS cites Canvas AI's STATUS_QUO baseline as a
// documented, topically-justified reuse (both operate in real-estate-adjacent markets --
// not an unrelated-market reuse, per FR-3's risk mitigation).
const SELECTED_VENTURE_IDS = [
  '4f71b3bd-8a1e-462e-a8b2-76efb8607206', // Canvas AI
  '0e6449d9-aaa1-4de5-8aba-c81fe0238b98', // CronLinter
  '849cd2bd-cd6e-4a5e-870d-e21a47b71393', // Market Modeling SaaS
];

/**
 * Pure: author a blueprint object from a cancelled venture + its (optional) resolved
 * competitive_baselines citation. No IO -- unit-testable with frozen fixtures.
 * @param {object} v - a ventures row {id,name,problem_statement,target_market,category,kill_reason,solution_approach,unique_value_proposition}
 * @param {string[]} baselineIds - competitive_baselines ids to cite (may be empty)
 * @param {string} [nowIso] - injected clock for deterministic tests
 * @returns {object} a blueprint row shaped for OpportunityDiscoveryService.saveBlueprintsToDatabase()
 */
export function buildBlueprintFromVenture(v, baselineIds, nowIso = new Date().toISOString()) {
  return {
    title: `Reconsider: ${v.name}`,
    summary: `Sourced from cancelled venture "${v.name}" -- reconsideration candidate for the opportunity-blueprints cohort.`,
    problem: v.problem_statement,
    problem_statement: v.problem_statement,
    target_market: v.target_market || 'unspecified',
    category: v.category || 'venture-reconsideration',
    industry: v.category || null,
    solution: v.solution_approach || null,
    solution_concept: v.solution_approach || null,
    business_model: null,
    differentiation: v.unique_value_proposition || null,
    // TESTING intake-bar check 1 (external_demand_signal) reads customer_evidence directly.
    customer_evidence: `Prior venture attempt (id=${v.id}) reached cancellation; original problem_statement and target_market carried forward as sourcing evidence.`,
    competitive_gaps: null,
    source_type: 'ai_generated',
    opportunity_box: null,
    time_to_capture_days: null,
    confidence_score: 65,
    opportunity_score: 65,
    scan_id: null,
    gap_analysis: null,
    ai_metadata: null,
    success_metrics: null,
    tags: ['venture-reconsideration', 'seed-opportunity-blueprints-001'],
    difficulty_level: 'medium',
    estimated_timeline: null,
    chairman_status: 'pending_review',
    is_active: true,
    venture_id: v.id,
    // Fields consumed by evaluateIntakeBar() (buildBlueprintRow's evaluateBar param reads
    // top-level fields per intake-bar.js's `idea?.kill_assumption || idea?.metadata?.kill_assumption`).
    kill_assumption: `If ${v.name}'s original blocker (${(v.kill_reason || 'unspecified').slice(0, 120)}) cannot be resolved this time, this reconsideration should be re-killed on the same grounds.`,
    spof_assumption: `Single point of failure: whatever caused the original cancellation (${(v.kill_reason || 'unspecified').slice(0, 80)}) recurs unaddressed.`,
    metadata: {
      source_venture_id: v.id,
      source_kill_reason: v.kill_reason || null,
      competitive_baseline_ids: baselineIds,
      seeded_by: 'SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001',
      seeded_at: nowIso,
    },
  };
}

/**
 * Pure: resolve the competitive_baseline_ids for each venture, given a venture_id->baseline
 * map. Falls back to a documented reuse of the fallbackVentureId's own baseline (see
 * SELECTED_VENTURE_IDS' Canvas AI reuse rationale) when a venture has no baseline of its own.
 */
export function resolveBaselineIds(ventureId, baselineByVenture, fallbackVentureId) {
  const own = baselineByVenture.get(ventureId);
  if (own) return [own.id];
  const fallback = fallbackVentureId ? baselineByVenture.get(fallbackVentureId) : null;
  return fallback ? [fallback.id] : [];
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(1); }
  const db = createClient(url, key);

  const { data: ventures, error: vErr } = await db
    .from('ventures')
    .select('id, name, problem_statement, target_market, category, kill_reason, solution_approach, unique_value_proposition')
    .in('id', SELECTED_VENTURE_IDS)
    .limit(10);
  if (vErr) { console.error('ventures read failed:', vErr.message); process.exit(1); }
  if (!ventures || ventures.length !== SELECTED_VENTURE_IDS.length) {
    console.error(`Expected ${SELECTED_VENTURE_IDS.length} ventures, got ${ventures?.length || 0}`);
    process.exit(1);
  }

  const { data: baselines, error: bErr } = await db
    .from('competitive_baselines')
    .select('id, venture_id, competitor_name, epistemic_tag')
    .in('venture_id', SELECTED_VENTURE_IDS)
    .limit(10);
  if (bErr) { console.error('competitive_baselines read failed:', bErr.message); process.exit(1); }
  const baselineByVenture = new Map((baselines || []).map((b) => [b.venture_id, b]));

  const blueprints = ventures.map((v) =>
    buildBlueprintFromVenture(v, resolveBaselineIds(v.id, baselineByVenture, '4f71b3bd-8a1e-462e-a8b2-76efb8607206'))
  );

  console.log(`${APPLY ? 'WRITING' : 'DRY-RUN'}: ${blueprints.length} blueprint(s)`);
  for (const b of blueprints) {
    console.log(`  - ${b.title} (venture_id=${b.venture_id}, baseline_ids=${JSON.stringify(b.metadata.competitive_baseline_ids)})`);
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }

  const service = new OpportunityDiscoveryService();
  await service.saveBlueprintsToDatabase(blueprints);
  console.log('\nDone.');
}

// ESM entrypoint guard -- importing this module for buildBlueprintFromVenture/resolveBaselineIds
// (e.g. from a unit test) must not trigger a live DB run. pathToFileURL (not a raw
// file://+argv[1] concat) is required for a correct comparison on Windows, where argv[1] is a
// backslash path with no scheme.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
