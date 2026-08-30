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
 * WOULD label a source_type='manual' row as e2e_fixture. Uses 'ai_generated' (matches the
 * existing real_idea convention reseed-queue.mjs's own comment names) since that is the
 * semantically correct label. CORRECTED (EXEC-phase TESTING, evidence ec2b314c, finding D1;
 * closed by PLAN_VERIFICATION VALIDATION, evidence cf18a4ae): source_type/classify() alone
 * do NOT protect a row from archival -- reseed-queue.mjs archived EVERY is_active=true row
 * unconditionally, and that label has no reader anywhere. Fixed at the actual point of risk
 * instead: reseed-queue.mjs now excludes any row with metadata.calibration_read_at set
 * (isCalibrationProtected()), which these 3 rows carry once stamped (see FR-4 below).
 *
 * TESTING finding T-3/T-4: writes via the REAL call chain -- saveBlueprintsToDatabase()
 * (which internally calls buildBlueprintRow()/evaluateIntakeBar()), not buildBlueprintRow()
 * called directly as a full-row writer.
 *
 * TESTING finding T-5: every blueprint preserves its source venture's kill_reason so a
 * reconsidered idea is never silently resurrected without its prior failure context.
 * CAVEAT (EXEC-phase TESTING, finding D2): all 3 selected ventures' kill_reason mentions
 * "testing"/administrative cancellation, not a market-signal kill -- this cohort calibrates
 * blueprint SHAPE, not real kill-signal ground truth. kill_reason is preserved verbatim in
 * metadata so this is visible, not concealed.
 *
 * NOTE (EXEC-phase TESTING, finding D4): this script has no re-run guard -- a second
 * `--apply` inserts 3 more rows (plain .insert(), no idempotency check). Safe today (no
 * duplicates exist), but re-running would pollute the calibration cohort. Do not re-run.
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
  // Consumed by evaluateIntakeBar() (buildBlueprintRow's evaluateBar param reads top-level
  // fields per intake-bar.js's `idea?.kill_assumption || idea?.metadata?.kill_assumption`).
  const killAssumption = `If ${v.name}'s original blocker (${(v.kill_reason || 'unspecified').slice(0, 120)}) cannot be resolved this time, this reconsideration should be re-killed on the same grounds.`;
  const spofAssumption = `Single point of failure: whatever caused the original cancellation (${(v.kill_reason || 'unspecified').slice(0, 80)}) recurs unaddressed.`;
  const customerEvidence = `Prior venture attempt (id=${v.id}) reached cancellation; original problem_statement and target_market carried forward as sourcing evidence.`;

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
    customer_evidence: customerEvidence,
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
    kill_assumption: killAssumption,
    spof_assumption: spofAssumption,
    metadata: {
      source_venture_id: v.id,
      source_kill_reason: v.kill_reason || null,
      competitive_baseline_ids: baselineIds,
      seeded_by: 'SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001',
      seeded_at: nowIso,
      // EXEC-phase TESTING finding S-2 (evidence 473afd4f): saveBlueprintsToDatabase()'s
      // insert() allowlist does not include kill_assumption/spof_assumption/customer_evidence
      // as top-level columns -- they were consumed transiently by evaluateIntakeBar() for
      // SCORING and then silently discarded, contradicting FR-1's "documents" acceptance
      // criterion. Duplicated here so they persist durably in metadata (which IS inserted,
      // via buildBlueprintRow's `...(blueprint.metadata || {})` spread), without modifying
      // buildBlueprintRow()/saveBlueprintsToDatabase() themselves (TR-1).
      kill_assumption: killAssumption,
      spof_assumption: spofAssumption,
      customer_evidence: customerEvidence,
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

  // REGRESSION finding (evidence 4a293bdc): saveBlueprintsToDatabase()'s insert() allowlist
  // does not include problem_statement/solution_concept/venture_id -- real opportunity_blueprints
  // columns that lib/eva/stage-zero/paths/blueprint-browse.js actually selects and can
  // auto-pick as blueprints[0] once is_active rows exist. Without this, the seeded rows read
  // problem_statement=NULL there, producing an empty suggested_problem/suggested_solution on a
  // now-reachable path. Patched via a follow-up UPDATE (TR-1 still holds -- no modification to
  // saveBlueprintsToDatabase()/buildBlueprintRow() themselves).
  for (const b of blueprints) {
    const { error: patchErr } = await db
      .from('opportunity_blueprints')
      .update({ problem_statement: b.problem_statement, solution_concept: b.solution_concept, venture_id: b.venture_id })
      .eq('title', b.title)
      .eq('source_type', 'ai_generated')
      .contains('tags', ['seed-opportunity-blueprints-001']);
    if (patchErr) console.error(`  patch failed for "${b.title}":`, patchErr.message);
  }

  console.log('\nDone.');
}

// ESM entrypoint guard -- importing this module for buildBlueprintFromVenture/resolveBaselineIds
// (e.g. from a unit test) must not trigger a live DB run. pathToFileURL (not a raw
// file://+argv[1] concat) is required for a correct comparison on Windows, where argv[1] is a
// backslash path with no scheme.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
