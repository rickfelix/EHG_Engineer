#!/usr/bin/env node
/**
 * PRD corrections for SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A per the LEAD-TO-PLAN
 * VALIDATION sub-agent review (validation-lead-gate-003a, evidence row
 * 02f4788a-421d-4933-a069-1c11a7dbc030, verdict CONCERNS). Closes/documents:
 *   - monotonicity argument (missing from PRD, VALIDATION's strongest safety property)
 *   - F1: shadow re-score row now recorded (feedback id 55eda49a-0e4f-4bec-a5f5-19897448d04d)
 *   - F3: OIV-path latency decision (documented as known-latent, no code guard -- zero
 *     production callers, zero non-null OIV rows across 5,370 EXEC-TO-PLAN handoffs)
 *   - F5: TS-2's vacuous-by-construction nature made explicit (was implicitly true, PRD
 *     should not read as claiming it exercises the passed===true conjunct)
 *   - F6: TS-4 scoping fixture corrected from 'infrastructure' (real threshold 75, never
 *     reaches the block) to 'bugfix' (real threshold 85, an honest negative)
 *   - F7: "24 pre-existing tests" corrected to the actual count, 20
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const risks = [
  {
    risk: "A future gate-verdict-cache change could silently drop the cache_hit flag from a reused GATE2 verdict, reopening the stale-reuse acceptance the TS-3 fixture guards against",
    severity: "low",
    mitigation: "TS-3 is a committed regression test, not a one-time manual check -- it re-runs on every future change to ValidationOrchestrator.js or gate-verdict-cache.js via the normal test suite"
  },
  {
    risk: "Blast radius: SD_TYPE_THRESHOLD is evaluated on every EXEC-TO-PLAN handoff fleet-wide, not just feature-type SDs",
    severity: "medium",
    mitigation: "The accept branch is additively nested inside the pre-existing below-threshold check and gated on sdType==='feature' AND a specific GATE2 shape -- every other sd_type, and every feature SD whose GATE2 did not pass YELLOW, takes the exact pre-existing code path unchanged. 20 pre-existing tests confirm no behavioral drift (validation-orchestrator-parallel/wait-ceiling/zero-weight-threshold = 18 across 3 files + sd-type-threshold-canonical.test.js = 2)."
  },
  {
    risk: "MONOTONICITY (VALIDATION's strongest safety property, added post-review): does this change ever cause a handoff that would otherwise have PASSED to newly FAIL?",
    severity: "informational",
    mitigation: "No, structurally. The accept branch lives entirely inside the pre-existing `if (results.normalizedScore < threshold)` block, and its only writes are `results.yellowZoneAccept` plus a console.log line. No code path introduced by this change can newly set `results.passed = false` -- the change can only convert a REJECT into an ACCEPT. This is a structural proof (verified by reading the diff's control flow), not a test-derived observation, so zero-pass-to-fail-flips holds even for band cells with no historical samples. See the FR-9 shadow re-score (feedback row 55eda49a-0e4f-4bec-a5f5-19897448d04d, category=gate_threshold_shadow) for the corresponding fail-to-pass count."
  },
  {
    risk: "F3 (VALIDATION, LOW/MEDIUM): validateGatesWithOIV() at ValidationOrchestrator.js:577 calls this.validateGates() and returns that same object, so yellowZoneAccept -- and the passed:true it enables -- propagates into the OIV combined-score path, changing the early-return at line 584 from 'return standard-fail results' to 'continue into 0.85*normalizedScore + 0.15*oiv'. This is a DIFFERENT rescue mechanism than the one this SD's ruling covers.",
    severity: "low",
    mitigation: "DECIDED: documented as known-latent, no code guard added. validateGatesWithOIV has zero production callers today (BaseExecutor.js:538 calls validateGates directly, not the OIV variant), and across all 5,370 historical EXEC-TO-PLAN handoffs, oiv_score/combined_score/oivResult have 0 non-null rows -- the OIV path has never executed in production. Adding a guard against a dead code path would be speculative scope creep on a single-reversible-commit change; if/when OIV is activated, this interaction must be re-reviewed before that activation ships (tracked here so it is not rediscovered from scratch)."
  }
];

const acceptance_criteria = [
  "SD_TYPE_THRESHOLD accepts ONLY when GATE2_IMPLEMENTATION_FIDELITY PASSED in its yellow zone over the SAME reduced gate set in the same run (FR-9's exact bound, verified by the cache_hit exclusion and the shared gateResults map)",
  "The acceptance is stamped yellow_zone_accept in handoff metadata with the two scores",
  "Per-type review: feature first; other sd_types are not silently included",
  "One reversible commit (three files changed together: ValidationOrchestrator.js, HandoffRecorder.js, and BaseExecutor.js -- the third found necessary by Explore review since it was silently dropping yellowZoneAccept from its return-object allowlist; no schema/migration)",
  "7 new unit tests pass; 20 pre-existing ValidationOrchestrator/SD_TYPE_THRESHOLD tests remain green",
  "Monotonicity: the change can only convert a REJECT into an ACCEPT -- zero pass-to-fail risk to any currently-passing handoff, structurally guaranteed (see risks[].MONOTONICITY)",
  "Shadow re-score recorded pre-EXEC per VALIDATION F1/F2: feedback row 55eda49a-0e4f-4bec-a5f5-19897448d04d (category=gate_threshold_shadow) documents n=8 historical rejection attempts across 4 distinct feature SDs in the 80-84.99% band, 1 realistically newly-accepted (the specimen), 0 pass-to-fail flips (structural)"
];

const test_scenarios = [
  {
    id: "TS-1", type: "unit",
    expected: "results.passed===true, results.yellowZoneAccept stamped with both scores, results.failedGate is not SD_TYPE_THRESHOLD",
    scenario: "Positive: feature SD below threshold, GATE2 PASSED in-run YELLOW over the same gate set"
  },
  {
    id: "TS-2", type: "unit",
    expected: "handoff still blocks (on the required-gate failure itself), results.yellowZoneAccept is never set",
    scenario: "Negative: GATE2 genuinely FAILED (RED zone). NOTE (F5, validation-lead-gate-003a): this fixture is vacuous by construction -- GATE2_IMPLEMENTATION_FIDELITY is a required gate, so its failure sets results.passed=false BEFORE the SD_TYPE_THRESHOLD block (guarded by `if (results.passed && ...)`) is ever reached. It documents the guard boundary, not an independently-exercised negative of the gate2Result?.passed===true conjunct."
  },
  {
    id: "TS-3", type: "unit",
    expected: "SD_TYPE_THRESHOLD still blocks, never trusts a cached verdict for the accept",
    scenario: "Negative: GATE2 result carries cache_hit:true (potential different-reduced-set reuse). NOTE (F4, validation-lead-gate-003a): the fixture injects cache_hit from the validator's own return value; in production cache_hit is set by the orchestrator's gate-verdict-cache probe (a path that never calls the validator). The branch logic is exercised correctly, but not via the real cache path -- an integration-shaped follow-up test via context._verdictCache (pattern: gate-verdict-cache.test.js:281-309) would close this gap."
  },
  {
    id: "TS-4", type: "unit",
    expected: "no accept granted -- feature-type-only per the coordinator's per-type review requirement",
    scenario: "Scoping: a bugfix-type SD in the identical YELLOW-zone shape (corrected per F6, validation-lead-gate-003a: THRESHOLD_PROFILES.bugfix.gateThreshold is also 85, matching feature's threshold, so this is an honest negative -- the original 'infrastructure' choice has a real threshold of 75 and never reaches the SD_TYPE_THRESHOLD block at all, making that fixture pass for the wrong reason)"
  },
  {
    id: "TS-5", type: "unit",
    expected: "a real pass on its own merits, results.yellowZoneAccept never set (nothing to accept)",
    scenario: "Control: GATE2 PASSED in GREEN (not YELLOW)"
  },
  {
    id: "TS-6", type: "unit",
    expected: "inserted sd_phase_handoffs row's metadata.yellow_zone_accept exactly equals the accept object",
    scenario: "HandoffRecorder stamps metadata.yellow_zone_accept when present"
  },
  {
    id: "TS-7", type: "unit",
    expected: "metadata.yellow_zone_accept is absent (undefined), not a null placeholder",
    scenario: "HandoffRecorder omits the stamp when no accept was granted"
  }
];

const { data: before, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('id')
  .eq('directive_id', 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A')
  .maybeSingle();
if (readErr || !before) { console.error('READ ERROR', readErr); process.exit(1); }

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({ risks, acceptance_criteria, test_scenarios })
  .eq('id', before.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }

console.log('PRD updated with VALIDATION follow-up corrections (monotonicity, F1/F3/F5/F6/F7).');
