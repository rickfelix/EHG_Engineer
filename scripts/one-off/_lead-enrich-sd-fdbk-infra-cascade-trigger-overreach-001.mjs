/**
 * LEAD enrichment for SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001
 * Closes 18-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 cascade-trigger overreach class.
 *
 * After enrichment, runs _restore-claim equivalent — this SD itself is the prevention layer
 * for the cascade-trigger overreach the workaround addresses.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const KEY = 'SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001';
const SD_ID = '9d966989-c8d8-47f4-9eba-ee8056a829d1';
const SESSION = process.env.CLAUDE_SESSION_ID;

if (!SESSION) {
  console.error('CLAUDE_SESSION_ID required');
  process.exit(2);
}

// ===== ENRICHMENT PAYLOAD =====

const description = `
Eliminate the LEAD-enrichment cascade-trigger overreach pattern that has surfaced 18 times across 12+ months
with zero preventive controls. Every LEAD-phase enrichment script that issues a .update() on strategic_directives_v2
outside handoff.js silently clears claiming_session_id and is_working_on, breaking handoff.js precondition checks
mid-flight ("Cannot create handoff for SD without active session claim"). Sessions currently work around this with
ad-hoc _restore-claim-*.mjs scripts guarded by v_active_sessions ownership lookups, which is brittle, easy to forget,
and does not scale. Two-prong systemic fix: (1) database-side trigger surgery — identify the trigger(s) on
strategic_directives_v2 that overreach by clearing claim columns when those columns are NOT in the UPDATE SET
clause, and modify them to honour the explicit-write contract (a .update() that does not name claiming_session_id
or is_working_on must not touch them); (2) defense-in-depth canonical writer at lib/governance/safe-sd-update.js
that wraps .update() with explicit pre/post claim-column preservation for new code, plus a static-pin regression
test catching raw .update() on strategic_directives_v2 outside the canonical helper or handoff.js. Default flag OFF
for the canonical writer's stricter mode pending burn-in. 18th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001
sister case (cascade-trigger overreach variant). Closes feedback 18c57c39 and unblocks every future LEAD enrichment
session by removing the _restore-claim workaround dependency.
`.trim().replace(/\s+/g, ' ');

const scope = `
IN SCOPE:
- (FR-1) RCA + database-agent enumeration of all triggers on strategic_directives_v2 (catalogue trigger_name +
  event_manipulation + action_timing + action_statement). Identify which trigger(s) clear claiming_session_id /
  is_working_on on UPDATEs that do NOT name those columns in SET. Output: prd metadata.trigger_audit_evidence_id.
- (FR-2) IF a single overreaching trigger is identified: modify the trigger function via CREATE OR REPLACE FUNCTION
  in a new migration to honour the explicit-write contract (only clear claim cols when they appear in NEW.* and the
  caller explicitly intends the change). Migration MUST include partial UNIQUE INDEX or session-token-aware predicate
  if needed to prevent regressions. NOTIFY pgrst, 'reload schema' after CREATE OR REPLACE.
- (FR-3) IF database-side fix is infeasible OR defense-in-depth needed: provide canonical writer
  lib/governance/safe-sd-update.js::updateStrategicDirective(sdKey|sdId, fields, options) that (a) READS current
  claiming_session_id + is_working_on, (b) injects them into UPDATE SET if not present, (c) verifies post-write
  via SELECT projection, (d) FAIL-LOUD on PostgrestError. Defaults: env flag LEO_SAFE_SD_UPDATE_STRICT=true gates
  whether unknown callers throw vs warn.
- (FR-4) Static-pin regression test (vitest, fs.readFileSync + regex) that scans scripts/one-off/_*.mjs and
  scripts/modules/**/*.{js,mjs,cjs} for raw .from('strategic_directives_v2').update(...) outside an allowlist
  (handoff.js, lib/governance/safe-sd-update.js, scripts/sd-start.js, complete-quick-fix.js). Failing test names
  the offending file:line.
- (FR-5) lib/governance/safe-sd-update.test.js with positive case (preserves claim cols on description-only update)
  + negative case (allows explicit claim-col writes when intended) + FAIL-LOUD case (PostgrestError surfaces).
- (FR-6) Update CLAUDE_LEAD.md and lib/governance writer reference doc to document the canonical pattern.

OUT OF SCOPE (DELETION AUDIT, Q8 — ~60% reduction from maximalist):
- Migrating ALL ~50+ existing scripts/one-off/_lead-enrich-*.mjs to canonical writer (deferred — they are short-lived
  and the database-side fix retroactively covers them).
- Building cross-table consistency report or claim-state reconciliation cron (separate SD candidate).
- Adding new claim columns, session-token columns, or modifying claim_validity_gate logic.
- Touching handoff.js (it already correctly preserves claim cols via .update() that explicitly names them).
- Modifying the 21st-witness sister case (TRIPLE asymmetry on sd_v2.status enum, feedback a050c98c) — different root
  cause, different fix surface, parallel SD.
- Auto-restoring claim columns from session context (too clever; opt-in via canonical writer is correct).
`.trim();

const key_changes = [
  {
    change: 'database-agent catalogues all BEFORE/AFTER UPDATE triggers on strategic_directives_v2 and identifies the cascade-trigger overreach origin (PR #3627 Layer 1 functions OR a separate trigger).',
    impact: 'PRD FR-1 deliverable. Output: sub_agent_execution_results row with trigger_name + action_statement + repro evidence (column-X UPDATE → column-Y cleared). Without this, FR-2 vs FR-3 fix surface decision is uninformed.'
  },
  {
    change: 'Database-side fix (FR-2): CREATE OR REPLACE FUNCTION on the overreaching trigger function to honour explicit-write contract — claim columns are only cleared when they appear in the UPDATE SET (i.e., the caller explicitly intends the change), not when ANY column changes.',
    impact: 'Single migration in database/migrations/<date>_preserve_sd_claim_cols_on_partial_update.sql. Includes NOTIFY pgrst schema reload + idempotent CREATE OR REPLACE. Backward-compatible with existing claim-clearing callers (release_session, cleanup_stale_sessions, sd-start.js claim takeover) because they DO name the claim cols in SET.'
  },
  {
    change: 'Canonical writer lib/governance/safe-sd-update.js::updateStrategicDirective(sdKeyOrId, fields, options) — wraps Supabase .update() with explicit claim-col preservation; pattern source: lib/db/writeback-verify.js (QF-20260509-650) updateAndVerify.',
    impact: 'Defense-in-depth for cases where (a) database fix has unforeseen edge, (b) new callers want explicit semantics, (c) FAIL-LOUD surfaces PostgrestError instead of swallowing. ~50-80 LOC src + ~120-200 LOC test.'
  },
  {
    change: 'Static-pin regression test tests/unit/governance/safe-sd-update-static-pin.test.js — fs.readFileSync + regex scans for raw .from(\'strategic_directives_v2\').update(...) outside allowlist (handoff.js, lib/governance/safe-sd-update.js, sd-start.js, complete-quick-fix.js). Pattern source: SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 PR #3693 OOS allowlist.',
    impact: 'Prevents regression: any future enrichment script that introduces raw .update() on sd_v2 fails CI. Allowlist documented inline with rationale per file.'
  },
  {
    change: 'Documentation updates: CLAUDE_LEAD.md "Default Sub-Agent Invocation Cadence for Harness-Fix SDs" section gains canonical-writer reference. New lib/governance/README-safe-sd-update.md (or section in existing governance docs).',
    impact: 'Future LEAD-enrichment session authors see canonical pattern in one place; eliminates _restore-claim workaround precedent.'
  }
];

const key_principles = [
  'Database-side fix preferred — modify the trigger to honour explicit-write contract, not paper over with a wrapper. (NC-005: root cause first.)',
  'FAIL-LOUD on PostgrestError — surface schema/auth errors instead of silent swallow (W2 from QF-20260510-WT-CLAIM-PROTECT-001).',
  'Backward-compatible with all existing claim-CLEARING callers — they explicitly name the claim cols in SET, so the explicit-write contract preserves their behaviour.',
  'Defense-in-depth: canonical writer + database fix + static-pin test (3 layers); single layer is brittle.',
  'Static-pin regression tests via fs.readFileSync + regex (mocking-independent) — pattern proven in 7+ recent SDs.',
  'Lookup-then-update primitive when claim-col preservation needed (pattern from PR #3691 FR-2).',
  'NOTIFY pgrst, \'reload schema\' after every CREATE OR REPLACE FUNCTION (gotcha W2 from PR #3691).',
  'Eat-our-own-dogfood: this SD\'s own LEAD enrichment uses the legacy _restore-claim workaround; EXEC ships the canonical writer that retroactively replaces it for future SDs.'
];

const strategic_objectives = [
  'Close 18-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 cascade-trigger overreach variant — eliminate the underlying class so it does not surface 19th, 20th, 21st time.',
  'Eliminate the _restore-claim-*.mjs workaround pattern from the LEAD enrichment workflow. Future LEAD sessions on sd-start should be able to .update() any non-claim column without claim loss.',
  'Reduce LEAD-enrichment cognitive overhead: authors should not need to remember "always run _restore-claim after every .update()" — the system enforces it.',
  'Establish the canonical pattern (lib/governance/safe-sd-update.js) for any future SD-table writer outside handoff.js.',
  'Add static-pin guard so future bypass cannot regress silently — failing CI is preferable to silent claim loss.',
  'Document the explicit-write contract for triggers on strategic_directives_v2 to prevent future trigger authors from re-introducing the same overreach class.'
];

const success_criteria = [
  {
    criterion: 'Trigger audit complete: database-agent enumerates all UPDATE triggers on strategic_directives_v2 with action_statement bodies, identifies the overreaching trigger(s) by name.',
    measure: 'sub_agent_execution_results row from database-agent at PLAN phase contains trigger_name + action_statement excerpt + repro proof (UPDATE column-X cleared column-Y). Empty or missing row = FR-1 failed.'
  },
  {
    criterion: 'Database-side fix applied OR canonical writer shipped (whichever path PRD selects): a fresh test session that runs sd-start.js then .update() on description (any non-claim column) does NOT clear claiming_session_id/is_working_on.',
    measure: 'Behaviour test: claim SD via sd-start, .update({description: \'x\'}) via raw Supabase, SELECT claiming_session_id — must equal session ID. Pre-fix this assertion FAILS; post-fix it PASSES.'
  },
  {
    criterion: 'Canonical writer lib/governance/safe-sd-update.js exists, exports updateStrategicDirective, has positive + negative + FAIL-LOUD test coverage.',
    measure: 'File exists at expected path. tests/unit/governance/safe-sd-update.test.js: ≥6 cases (pass+fail+throw shapes). 100% PASS in vitest. Mocked Supabase + non-mocked round-trip integration.'
  },
  {
    criterion: 'Static-pin regression test ships and CI-fails when raw .from(\'strategic_directives_v2\').update(...) appears outside allowlist.',
    measure: 'tests/unit/governance/safe-sd-update-static-pin.test.js: scans codebase via fs.readFileSync + regex; allowlist documented; positive test (PASS on current code) + negative test (FAIL when injected violation introduced and reverted).'
  },
  {
    criterion: 'Zero new feedback rows of category=harness_backlog with title containing "cascade-trigger overreach" OR "claim columns cleared" in the 7 days post-merge.',
    measure: 'Manual check at 7-day burn-in. Inverse: any new such row = regression, file follow-up SD.'
  }
];

const success_metrics = [
  { metric: 'cascade-trigger overreach feedback rows post-merge (7-day window)', target: '0 new rows', actual: 'TBD measured at 7d burn-in' },
  { metric: 'callers of canonical writer at merge time', target: '≥1 (this SD\'s own LEAD enrichment retroactively, OR EXEC scripts/one-off if migration of existing scripts in scope)', actual: 'TBD' },
  { metric: 'static-pin regression test coverage of strategic_directives_v2 .update() callsites', target: '100% of non-allowlist files scanned, 0 violations on current main', actual: 'TBD' },
  { metric: 'PR LOC (source-only, exclude tests + migration)', target: '≤200 LOC source (Tier-3 with documented justification if exceeded)', actual: 'TBD' },
  { metric: 'sub-agent evidence rows at handoffs', target: '≥6 (LEAD: validation + risk + testing-prospective; PLAN: validation + risk + database; EXEC: testing)', actual: 'TBD' }
];

const risks = [
  {
    risk: 'Modifying the overreaching trigger function breaks an unforeseen consumer (database-agent did not catalogue all triggers, or a NEW trigger fires AFTER ours and undoes the fix).',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'database-agent FR-1 catalogues ALL triggers (BEFORE+AFTER+INSTEAD OF, all event_manipulations) before FR-2. Behaviour test in FR-2 migration sandbox: round-trip update on every non-claim column type, assert claim cols preserved across all paths. Defense-in-depth: canonical writer (FR-3) covers cases the trigger fix misses.'
  },
  {
    risk: 'PostgREST schema cache misses the function replacement → consumers continue calling old behaviour for hours.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'NOTIFY pgrst, \'reload schema\' after CREATE OR REPLACE FUNCTION (gotcha W2 from PR #3691). Migration includes the NOTIFY in same transaction. Verify post-migration via SELECT prosrc FROM pg_proc.'
  },
  {
    risk: 'Sandbox migration application blocked (SELF_SIGNED_CERT_IN_CHAIN, network) — code ships, migration does not.',
    impact: 'medium',
    likelihood: 'high (per memory, recurring class — feedback 7d238d0e)',
    mitigation: 'Defense-in-depth: canonical writer (FR-3) is independent of migration. PRD includes FR-7 graceful-degrade — if migration not yet applied, canonical writer still preserves cols app-side. Module-load assertion at import time + writer fallback (pattern from SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 PR #3667).'
  },
  {
    risk: 'Static-pin test produces false positives on legitimate raw .update() in handoff.js or sd-start.js.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Allowlist documented per-file with rationale; pattern proven across 7+ static-pin tests this campaign. Allowlist is `[path, rationale]` pairs, not `[path]` only — keeps the docs co-located with the suppression.'
  },
  {
    risk: 'EXEC migration of existing _restore-claim scripts is requested by reviewers, scope-creeps the SD beyond Tier-3 (200 LOC source target).',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'PRD scope is explicit: existing one-offs are out-of-scope (deferred). Database-side fix retroactively covers them — they continue working with workaround, but workaround becomes optional. If any reviewer pushes back, point to Q8 deletion audit (~60% reduction).'
  },
  {
    risk: 'The overreaching trigger turns out to be a Postgres SECURITY DEFINER function with grants we cannot replace via service-role.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'database-agent enumerates SECURITY DEFINER bit at FR-1 catalogue. If blocker hit: fall back to FR-3 canonical writer as PRIMARY fix (not defense-in-depth). PRD risk-agent re-runs at PLAN with the actual catalogue evidence.'
  },
  {
    risk: 'Two-phase risk-agent cadence (LEAD scope + PLAN literal) catches a BLOCKER class only at PLAN — same lesson as PR #3691 PA-1 (status=\'pending\' rejected).',
    impact: 'medium (rework but not project-killing)',
    likelihood: 'medium (per memory, two-phase risk-agent caught BLOCKER 1× in last 5 SDs)',
    mitigation: 'Schedule risk-agent at BOTH LEAD (now, scope shape) and PLAN (after database-agent catalogue, literal SQL/trigger). Document this expectation in handoff.'
  }
];

const dependencies = [
  { type: 'internal', dependency: 'database-agent (PLAN-phase trigger catalogue)', status: 'available', notes: 'Required for FR-1 — pre-PLAN literal trigger enumeration on strategic_directives_v2. Pattern: pg_proc + information_schema.triggers query.' },
  { type: 'internal', dependency: 'lib/db/writeback-verify.js (QF-20260509-650)', status: 'shipped', notes: 'Pattern source for FR-3 canonical writer (read-after-write verification primitive).' },
  { type: 'internal', dependency: 'risk-agent two-phase cadence', status: 'available', notes: 'Per memory PR #3691 lesson: assess at LEAD (scope shape) AND PLAN (literal SQL).' },
  { type: 'internal', dependency: 'testing-agent prospective at LEAD', status: 'available', notes: 'MANDATORY per CLAUDE_LEAD.md harness-fix cadence (writer/consumer + signature keywords match).' }
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Claim a fresh draft SD via sd-start.js (or simulate: INSERT a temp draft SD + call claim_sd RPC). Verify claiming_session_id + is_working_on populated.',
    expected_outcome: 'SELECT claiming_session_id, is_working_on FROM strategic_directives_v2 WHERE sd_key=<test-key> shows session ID + true.'
  },
  {
    step_number: 2,
    instruction: 'Run an enrichment-style raw UPDATE: supabase.from(\'strategic_directives_v2\').update({description: \'test\'}).eq(\'id\', <id>) — i.e., no claim cols in SET.',
    expected_outcome: 'POST-FIX: claiming_session_id + is_working_on UNCHANGED (still session ID + true). PRE-FIX: both columns CLEARED to NULL/false.'
  },
  {
    step_number: 3,
    instruction: 'Run handoff.js execute LEAD-TO-PLAN <test-sd-key> immediately after Step 2.',
    expected_outcome: 'POST-FIX: handoff proceeds without "Cannot create handoff for SD without active session claim" error. PRE-FIX: handoff fails at claim-validity gate.'
  }
];

// ===== APPLY ENRICHMENT =====

async function applyEnrichment() {
  console.log('=== Applying LEAD enrichment ===');
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      description,
      scope,
      key_changes,
      key_principles,
      strategic_objectives,
      success_criteria,
      success_metrics,
      risks,
      dependencies,
      smoke_test_steps,
      scope_reduction_percentage: 60
    })
    .eq('id', SD_ID);

  if (error) {
    console.error('Enrichment failed:', error);
    process.exit(1);
  }
  console.log('Enrichment applied (15 fields).');
}

async function restoreClaim() {
  console.log('\n=== Verifying & restoring claim columns (cascade-trigger overreach workaround) ===');
  const { data: vas } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, computed_status')
    .eq('session_id', SESSION)
    .eq('sd_key', KEY);

  if (!vas || vas.length === 0) {
    console.error(`REFUSED — v_active_sessions has no active row for ${SESSION} on ${KEY}`);
    process.exit(2);
  }
  if (vas.length > 1) {
    console.error(`REFUSED — v_active_sessions has ${vas.length} rows; ambiguous`);
    process.exit(2);
  }
  if (vas[0].computed_status !== 'active') {
    console.error(`REFUSED — computed_status=${vas[0].computed_status}, not active`);
    process.exit(2);
  }
  console.log('v_active_sessions agrees — restoring claim columns.');

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      claiming_session_id: SESSION,
      is_working_on: true
    })
    .eq('id', SD_ID);
  if (error) {
    console.error(error);
    process.exit(1);
  }
}

async function verify() {
  console.log('\n=== Verification ===');
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('claiming_session_id, is_working_on, description, scope_reduction_percentage')
    .eq('id', SD_ID)
    .single();
  console.log('claiming_session_id:', data.claiming_session_id);
  console.log('is_working_on:', data.is_working_on);
  console.log('scope_reduction_percentage:', data.scope_reduction_percentage);
  console.log('description (', (data.description || '').split(/\s+/).length, 'words)');

  if (data.claiming_session_id !== SESSION) {
    console.error('CLAIM RESTORE FAILED — session mismatch');
    process.exit(1);
  }
  if (data.is_working_on !== true) {
    console.error('CLAIM RESTORE FAILED — is_working_on != true');
    process.exit(1);
  }
  console.log('OK — claim preserved, enrichment applied.');
}

await applyEnrichment();
await restoreClaim();
await verify();
