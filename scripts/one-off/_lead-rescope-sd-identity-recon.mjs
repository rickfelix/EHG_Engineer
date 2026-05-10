// One-off: LEAD rescope of SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001
// Driven by validation-agent (db7da07f) + risk-agent (5a499f93) findings.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdId = '5f2e9df3-02f4-449f-baa9-91b8f19b6f71';

const newDescription = `BACKEND HARNESS SD (EHG_Engineer only — NO frontend/UI scope).

[RESCOPED 2026-05-10 by LEAD-Opus-4.7 session 4582eae5 after VALIDATION + RISK sub-agent review.]
Validation-agent (db7da07f-615b-4fba-a7b2-36644cfb1737, PASS conf=90 + 5 warnings) discovered lib/session-identity-sot.js (522 LOC, PR #3256 from 2026-04-22) already implements ~95% of FR-1/FR-2 primitives — readAllSources, validateSourcesAgree, reconcileAtBoot, atomicWrite, acquireLock — but the entire path is gated OFF via SESSION_IDENTITY_SOT_ENABLED. It is wired into lib/claim-validity-gate.js:179-193 and scripts/sd-start.js:30,788-792 but NOT into scripts/hooks/session-start.cjs. Risk-agent (5a499f93-6a6f-4cd8-be17-5cd61411fe25, MEDIUM) confirmed staged 2-PR rollout is required to avoid bricking the 3 active CC sessions whose markers may not agree.

Rescope reduces from ~390 LOC new-build to ~60-110 LOC across 4 files (>70% scope reduction).

THIS SD ships PR-A only (plumbing + RCA fixes + escape hatch, flag OFF). The follow-up SD (to be filed) will flip SESSION_IDENTITY_SOT_ENABLED after a 24-48h burn-in with active-session precheck.

Closes 2 sibling feedback rows in the SESSION-IDENTITY harness backlog cluster:
- 3ac695bf-9798-4854-87a1-25901aadcc05 [high] — SessionStart upsertSessionRow race, 4th-witness reproduction
- 8e851497-2c0e-4e95-89f9-ac7603bbaf87 [high] — handoff.js claim-validity-gate refusing LEAD-TO-PLAN with 3 disagreeing identities

FUNCTIONAL REQUIREMENTS (rescoped):

FR-1. Wire reconcileAtBoot into SessionStart hook (scripts/hooks/session-start.cjs).
Calls lib/session-identity-sot.js::reconcileAtBoot after upsertSessionRow. Reuses existing module. Gated behind SESSION_IDENTITY_SOT_ENABLED (currently false; this PR does NOT flip it). Adds telemetry event reconcile.applied with marker-state-before/after for observability.

FR-2. Add IDENTITY_DRIFT_OVERRIDE escape hatch in lib/claim-validity-gate.js.
Path-drift fix: SD originally named scripts/modules/handoff/gates/claim-validity.js but actual gate is lib/claim-validity-gate.js. Add env-var escape IDENTITY_DRIFT_OVERRIDE=<reason> with audit_log write + 3-uses/day DB-side rate limit, parity with --bypass-validation. Closes the BLOCKING_IDENTITY_DRIFT permanent-stuck-class risk identified by risk-agent.

FR-3. stale-session-sweep.cjs (lines 438-445): replace last-segment-of-hyphen-split terminal_id parser with explicit handler for 3 formats: win-cc-PORT-PID, win-PID, and UUID. UUID-format MUST resolve PID via session-identity/pid-*.json (cc_pid field) lookup, NOT terminal_id parsing. Required because FR-4 deletes pid markers more aggressively, and sweep needs deterministic PID resolution from a stable secondary source.

FR-4. capture-session-id.cjs (lines 479-495): change dead.slice(3) → dead.slice(0). Stop retaining 3 dead pid markers; delete all dead markers immediately. The retained pid-14396.json marker (dead since 21:53:42) was the artifact that defeated identity-reconciliation in 824a4401.

DELIVERABLES:
1. scripts/hooks/session-start.cjs (modify) — call lib/session-identity-sot.js::reconcileAtBoot after upsertSessionRow.
2. lib/claim-validity-gate.js (modify) — IDENTITY_DRIFT_OVERRIDE branch with audit_log + 3/day rate limit.
3. scripts/stale-session-sweep.cjs (modify) — terminal_id parser switch.
4. scripts/hooks/capture-session-id.cjs (modify) — dead.slice(3)→slice(0).
5. Vitest: identity-drift-override audit-log + rate-limit + 3-format terminal_id parser + reconcileAtBoot wired-and-no-throw with flag OFF.

OUT-OF-SCOPE (deferred to follow-up SD):
- Flipping SESSION_IDENTITY_SOT_ENABLED=true (requires active-session precheck + 24-48h burn-in)
- Building a new lib/session-identity-reconcile.mjs (95% duplicate of session-identity-sot.js — superseded)
- Mid-session reconcileMidSession() helper (folded into FR-1; reconcileAtBoot is sufficient when called from SessionStart hook for the witnessed bug)
- 4c2b2e1a (sub-process node identity overwrite — investigation row 7, separate)

WITNESS: 4th-witness reproduction confirmed by validation-agent (3-marker drift live in this very worktree right now: env=4582eae5, current=2f6fc904, session-id.txt=7781f4dd). 17 feedback rows reference foreign_claim/session-identity drift cluster.

ESTIMATE (rescoped): ~60-110 src LOC + ~150 test LOC across 4 files. Tier-2 SD per user campaign instruction. Original estimate 140 src + 250 test LOC superseded.`;

const newKeyChanges = [
  { change: 'Wire lib/session-identity-sot.js::reconcileAtBoot into scripts/hooks/session-start.cjs after upsertSessionRow (gated behind SESSION_IDENTITY_SOT_ENABLED, currently OFF)', impact: 'Closes consumer-side gap: SOT module exists but was never wired into SessionStart. Reuses existing 522-LOC module rather than duplicating it.' },
  { change: 'Add IDENTITY_DRIFT_OVERRIDE env-var escape hatch in lib/claim-validity-gate.js with audit_log write + 3-uses/day DB rate-limit (parity with --bypass-validation)', impact: 'Closes BLOCKING_IDENTITY_DRIFT permanent-stuck-class risk surfaced by risk-agent. Without escape, structural drift bricks session with no mid-session recovery.' },
  { change: 'stale-session-sweep.cjs (lines 438-445): replace last-segment-of-hyphen-split terminal_id parser with explicit handler for 3 formats: win-cc-PORT-PID, win-PID, and UUID. UUID-format resolves PID via session-identity/pid-*.json cc_pid lookup.', impact: 'Closes sweep consumer-side blind spot for UUID-format terminal_id. Required because FR-4 deletes pid markers more aggressively; sweep needs deterministic PID source.' },
  { change: 'capture-session-id.cjs (lines 479-495): change dead.slice(3) → dead.slice(0). Stop retaining 3 dead pid markers; delete all dead markers immediately.', impact: 'Closes cleanup-side gap. The retained pid-14396.json marker (dead since 21:53:42) was the artifact that defeated identity-reconciliation in 824a4401.' },
  { change: 'Vitest tests: identity-drift-override audit-log + rate-limit + 3-format terminal_id parser + reconcileAtBoot-wired with flag OFF.', impact: 'Regression-pin coverage for all 4 FRs.' }
];

const newSuccessCriteria = [
  { criterion: 'SessionStart hook calls reconcileAtBoot from lib/session-identity-sot.js after upsertSessionRow when SESSION_IDENTITY_SOT_ENABLED=true; no-op (path executed but bypassed) when flag is OFF', measure: 'Vitest: hook invocation under both flag states verifies expected call/no-call pattern' },
  { criterion: 'IDENTITY_DRIFT_OVERRIDE env-var bypasses claim-validity gate with audit_log write and 3/day rate-limit enforced via DB query', measure: 'Vitest: 4 invocations within 24h — first 3 succeed with audit_log row, 4th fails with rate-limit error code' },
  { criterion: 'stale-session-sweep.cjs handles 3 terminal_id formats (win-cc-PORT-PID / win-PID / UUID) with UUID-format resolving via session-identity/pid-*.json cc_pid lookup', measure: 'Vitest: 3 fixture rows, one per format, all resolve to correct PID' },
  { criterion: 'capture-session-id.cjs deletes all dead pid markers immediately (dead.slice(0))', measure: 'Vitest: simulate 5 dead markers, verify zero retained after cleanup pass' },
  { criterion: 'Zero regressions in lib/eva + lib/claim-validity-gate test suite', measure: 'Pre-existing passing test count unchanged after PR' }
];

const newSmokeTestSteps = [
  { step_number: 1, instruction: 'Run vitest suite for the 4 modified files', expected_outcome: 'All new tests pass + zero regressions in pre-existing tests' },
  { step_number: 2, instruction: 'Set IDENTITY_DRIFT_OVERRIDE=test-reason and invoke handoff.js execute LEAD-TO-PLAN against a mock SD with 3-marker drift', expected_outcome: 'Handoff proceeds, audit_log row inserted with override reason' },
  { step_number: 3, instruction: 'Spawn fresh CC session in scratch worktree, observe SessionStart hook log line', expected_outcome: 'reconcile.applied telemetry event emitted (or skipped with reason=flag_off when SESSION_IDENTITY_SOT_ENABLED=false)' }
];

const metadataPatch = {
  lead_decision: {
    decided_at: new Date().toISOString(),
    decided_by: 'LEAD-Opus-4.7 session 4582eae5-0f07-4eea-a305-5e45cc09958e',
    decision: 'rescope_to_wire_existing_sot',
    rationale: 'validation-agent (db7da07f) PASS conf=90 surfaced lib/session-identity-sot.js 522-LOC pre-existing module gated OFF; 95% duplicate of SD as-written. risk-agent (5a499f93) MEDIUM verdict required staged rollout. Scope reduced from ~390 LOC new-build to ~60-110 LOC wire+RCA+escape-hatch (>70% reduction) across 4 files. Flag flip deferred to follow-up SD.',
    sub_agent_evidence: [
      { code: 'VALIDATION', row_id: 'db7da07f-615b-4fba-a7b2-36644cfb1737', verdict: 'PASS', confidence: 90 },
      { code: 'RISK', row_id: '5a499f93-6a6f-4cd8-be17-5cd61411fe25', verdict: 'MEDIUM' }
    ],
    deferred_followup_sd_premise: 'Flip SESSION_IDENTITY_SOT_ENABLED=true after 24-48h burn-in of this SD; pre-flip MUST run validateSourcesAgree() against all status=active claude_sessions rows and abort if any session is unreconciled.'
  },
  loc_estimate_revised: { src: { min: 60, max: 110 }, test: 150 },
  superseded_estimate: { src: 140, test: 250 }
};

(async () => {
  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', sdId)
    .single();

  if (readErr) {
    console.error('READ_ERR:', readErr);
    process.exit(1);
  }

  const mergedMetadata = { ...(existing.metadata || {}), ...metadataPatch };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: newDescription,
      key_changes: newKeyChanges,
      success_criteria: newSuccessCriteria,
      smoke_test_steps: newSmokeTestSteps,
      scope_reduction_percentage: 72,
      metadata: mergedMetadata
    })
    .eq('id', sdId)
    .select('id, sd_key, scope_reduction_percentage');

  if (error) {
    console.error('UPDATE_ERR:', error);
    process.exit(1);
  }
  console.log('UPDATED:', JSON.stringify(data, null, 2));
})();
