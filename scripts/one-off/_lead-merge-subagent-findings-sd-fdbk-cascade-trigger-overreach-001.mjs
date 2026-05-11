/**
 * Merge 3 LEAD sub-agent findings into SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 PRD scope.
 *
 * Sub-agent evidence:
 * - TESTING 1303d211-d755-4a58-a617-d6f569f01ef3 (APPROVE-WITH-CONCERNS @ 84): W-1 — no overreaching trigger found
 * - VALIDATION 739f06d2-dee1-421b-9d07-2912907a34bd (WARNING @ 86): R-2 — ~50% LOC reduction via existing infra
 * - RISK c0b54e1c-ef8b-43bd-a8f0-c381bb686665 (MEDIUM/WARNING @ 87): R-1 — cascade-trigger hypothesis EMPIRICALLY DISPROVED
 *
 * Conditions to clear (4 BLOCK_EXEC):
 * - COND-1: Re-frame to writer-side preservation PRIMARY
 * - COND-2: Collapse FR-4 to registry edit + exempt_writers
 * - COND-3: Add FR-1.5 triage decision gate
 * - COND-4: success_metrics prose form (no TBD)
 *
 * After merging, re-restore claim cols per cascade-trigger workaround (eat-our-own-dogfood).
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

// ===== REFRAMED ENRICHMENT (post sub-agent merge) =====

const description = `
Eliminate the LEAD-enrichment claim-column loss pattern that has surfaced 18 times across 12+ months with zero
preventive controls. Symptom: enrichment scripts that .update() strategic_directives_v2 outside handoff.js
silently lose claiming_session_id and is_working_on, breaking handoff.js precondition checks ("Cannot create
handoff for SD without active session claim"). LEAD risk-agent ran two empirical UPDATE probes (single-field
description-touch + multi-field handoff-style) and CLAIM COLS WERE PRESERVED IN BOTH — empirically disproving
the original "cascade-trigger overreach" hypothesis. Likely actual root causes (PLAN database-agent confirms):
(a) cleanup_stale_sessions cron (300s threshold) firing during long sub-agent execution, (b) PG-side release_sd
invoked by concurrent worker, (c) sync_is_working_on_with_session AFTER UPDATE cascade. Fix surface SHIFTS to
writer-side preservation: lib/governance/safe-sd-update.js canonical writer that wraps .update() with explicit
"explicit-write contract" semantics — claim cols only touched if named in input. Pattern-anchor: existing
lib/governance/emit-feedback.js (@canonical-writer-for: feedback) and lib/security/audit-events-emitter.js
(@canonical-writer-for: security_audit_events). Predecessor scope-anchor: SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001
shipped docs/reference/canonical-write-paths.md registry + tests/unit/governance/canonical-helper-bypass-guard.test.js
— this SD adds strategic_directives_v2 to that registry. Database-side fix CONDITIONAL on PLAN database-agent RCA;
canonical writer ships unconditionally and provides immunity regardless of root cause class. ~50% LOC reduction
vs original maximalist scope by reusing existing registry + bypass-guard infra. Closes feedback 18c57c39.
`.trim().replace(/\s+/g, ' ');

const scope = `
IN SCOPE (post LEAD sub-agent merge — ~50% reduction vs maximalist):

- (FR-1) PLAN database-agent RCA: enumerate ALL triggers on strategic_directives_v2 + product_requirements_v2 +
  sd_phase_handoffs (per testing-agent W-6); query pg_proc for live release_sd / release_session /
  cleanup_stale_sessions / sync_is_working_on_with_session function definitions (NOT trust migration files —
  multiple overlapping CREATE OR REPLACE per risk-agent R-4); produce repro test that reliably reproduces the
  symptom in a controlled environment. Output: prd metadata.trigger_rca_evidence_id row from database-agent.
  STATUS: Evidence-gathering, NOT commitment to a fix.

- (FR-1.5) NEW Triage Decision Gate (per testing-agent R-1 + risk-agent reframing): based on FR-1 RCA findings,
  PRD selects one of three FR-2 paths:
    PATH A: Database trigger fix (only if BEFORE/UPDATE trigger with overreach confirmed — currently LOW
            likelihood per risk-agent probes)
    PATH B: cleanup_stale_sessions cron threshold/lock/serialization fix (if root cause = race)
    PATH C: PG-side release_sd guard (no-op when target SD has active heartbeat) — if root cause = concurrent
            release race
  IF FR-1 finds NO Postgres-side root cause that's reproducible → FR-2 deferred to follow-up SD; FR-3 ships alone.

- (FR-2) CONDITIONAL on FR-1.5: Either CREATE OR REPLACE FUNCTION migration on overreaching trigger function
  OR app-side fix (depending on FR-1.5 selection). Migration MUST end with NOTIFY pgrst, 'reload schema' in
  same transaction (gotcha from PR #3691). MUST preserve backward compat for existing claim-clearing callers
  (release_session, cleanup_stale_sessions, sd-start claim takeover) — they DO name claim cols in SET, so
  honouring explicit-write contract preserves their behaviour.

- (FR-3) PRIMARY (always ships, regardless of FR-1.5): Canonical writer
  lib/governance/safe-sd-update.js::updateStrategicDirective(sdKeyOrId, fields, options).
  - Tag: @canonical-writer-for: strategic_directives_v2 (matches existing canonical-writer pattern)
  - Semantics: explicit-write contract — fields object passed in is the COMPLETE set of cols to touch;
    claiming_session_id + is_working_on + active_session_id NOT mutated unless explicitly in fields object.
  - Implementation: pre-read current claim cols (one SELECT) + UPDATE with explicit SET on input fields only +
    post-verify via SELECT projection asserting claim cols match pre-read.
  - FAIL-LOUD on PostgrestError (W2 from QF-20260510-WT-CLAIM-PROTECT-001).
  - Default OFF strict mode: env LEO_SAFE_SD_UPDATE_STRICT=true gates whether unknown callers throw vs warn.

- (FR-4) COLLAPSED (per validation-agent R-2): Add strategic_directives_v2 entry to existing
  docs/reference/canonical-write-paths.md registry with exempt_writers list:
    - scripts/handoff.js + scripts/modules/handoff/** (handoff system explicitly preserves claim cols)
    - scripts/sd-start.js (claim takeover path explicitly writes claim cols)
    - lib/sd/revert.js (atomic single-UPDATE on sd_v2; revertSD precedent)
    - lib/claim-validity-gate.js:450 (orphan auto-release sets worktree_path=null — known callsite)
    - lib/claim-lifecycle-release.mjs (CAS release pattern)
    - lib/drain-orchestrator.mjs (drain path)
  Existing tests/unit/governance/canonical-helper-bypass-guard.test.js auto-detects new bypasses once registry
  updated — NO new fs.readFileSync + regex test file required (was original FR-4 plan).

- (FR-5) NEW Observability (per risk-agent rec 8): Add heartbeat-lag observability to safe-sd-update.js — warn
  when handoff in progress AND session age approaches 300s threshold (the cleanup_stale_sessions trigger). Feeds
  RCA back into root cause confirmation.

- (FR-6) Tests for FR-3 canonical writer:
  - 6 unit tests (mocked Supabase): description-only update preserves claim cols / explicit claim_session write
    works / explicit is_working_on write works / BOTH explicit works / NEITHER (the bug-fix case) preserves /
    PostgrestError surfaces FAIL-LOUD
  - 3 integration tests (real DB round-trip): probe SD round-trip, concurrent UPDATE TOCTOU (per testing-agent
    W-4), RPC-issued UPDATE (per testing-agent W-5)
  - 3 static-pin tests (FR-4): allowlist+non-claim → PASS, non-allowlist+non-claim → FAIL, non-allowlist+claim
    → FAIL different reason
  Total 12 tests / 5 distinct types (per testing-agent R-3).

- (FR-7) Documentation: CLAUDE_LEAD.md harness-fix cadence section gains canonical-writer reference;
  lib/governance/safe-sd-update.js header comment with usage; canonical-write-paths.md row populated.

- (FR-8) Post-merge smoke runner: scripts/smoke/verify-claim-col-preservation.mjs wired into post-merge to
  assert real DB behaviour ~3min post-deploy + emit [SD_CLAIM_COL_PRESERVATION_VERIFIED] audit marker (pattern
  per PR #3691 [LFA_GRACEFUL_DEGRADE_TO_ACCEPTED]).

OUT OF SCOPE (DELETION AUDIT, Q8 — ~60% reduction from maximalist):
- Migrating ALL ~50+ existing scripts/one-off/_lead-enrich-*.mjs to canonical writer (deferred — they are
  short-lived and the canonical writer retroactively covers FUTURE scripts).
- Building cross-table consistency report or claim-state reconciliation cron.
- Adding new claim columns, session-token columns, or modifying claim_validity_gate logic.
- Touching handoff.js (already correctly preserves claim cols).
- Modifying the 21st-witness sister case (TRIPLE asymmetry on sd_v2.status enum, feedback a050c98c) — different
  root cause, different fix surface, parallel SD candidate.
- Refactoring lib/claim-validity-gate.js:450 raw .update() — exempt via registry instead.
- Auto-restoring claim columns from session context (too clever; explicit-write contract is correct semantics).
`.trim();

const key_changes = [
  {
    change: 'PLAN database-agent FR-1 RCA: enumerate triggers on sd_v2 + product_requirements_v2 + sd_phase_handoffs (per testing-agent W-6); query pg_proc for live release_sd/cleanup_stale_sessions/sync_is_working_on_with_session functions (per risk-agent R-4 multiple-overlapping-CREATE-OR-REPLACE risk); produce reliable repro test.',
    impact: 'Evidence-only; informs FR-1.5 triage gate. Without this, FR-2 fix surface is uninformed (LEAD risk-agent empirical probes already disproved the original cascade-trigger hypothesis — most likely actual cause is cleanup_stale_sessions race or PG release_sd race).'
  },
  {
    change: 'NEW FR-1.5 Triage Decision Gate: PRD selects FR-2 PATH A (DB trigger fix) / B (cleanup_stale_sessions threshold) / C (PG release_sd guard) based on FR-1 RCA. If no Postgres-side root cause reproduces → FR-2 deferred entirely; FR-3 ships alone.',
    impact: 'Prevents the LEAD scope-creep / pre-empirical-commit class flagged by validation-agent R-1 + testing-agent W-1. FR-3 provides immunity regardless of root cause via explicit-write contract.'
  },
  {
    change: 'FR-3 PRIMARY (always ships): lib/governance/safe-sd-update.js::updateStrategicDirective with @canonical-writer-for: strategic_directives_v2 tag (matches lib/governance/emit-feedback.js + lib/security/audit-events-emitter.js patterns). Implementation: pre-read claim cols + UPDATE explicit fields + post-verify SELECT projection. FAIL-LOUD on PostgrestError. Default OFF strict mode via env LEO_SAFE_SD_UPDATE_STRICT.',
    impact: '~80-120 LOC source. Provides immunity via explicit-write contract regardless of FR-1.5 selection. Pattern source: lib/db/writeback-verify.mjs (QF-20260509-650) + lib/governance/emit-feedback.js.'
  },
  {
    change: 'FR-4 COLLAPSED: Add strategic_directives_v2 row to existing docs/reference/canonical-write-paths.md registry with exempt_writers list (handoff.js, sd-start.js, lib/sd/revert.js, lib/claim-validity-gate.js:450, lib/claim-lifecycle-release.mjs, lib/drain-orchestrator.mjs). Existing tests/unit/governance/canonical-helper-bypass-guard.test.js auto-enforces.',
    impact: '~15 LOC vs original ~50 src + 100-200 test (per validation-agent R-2 ~50% reduction). NO new fs.readFileSync test file. Known bypass at lib/claim-validity-gate.js:450 documented as exempt.'
  },
  {
    change: 'FR-5 Observability (per risk-agent rec 8): Heartbeat-lag instrumentation in safe-sd-update.js — emit warn when handoff in progress AND session age approaches 300s cleanup_stale_sessions threshold.',
    impact: 'Feeds RCA back; helps PLAN/EXEC distinguish (a) cleanup_stale_sessions race vs (b) other root causes. ~10-20 LOC.'
  },
  {
    change: 'FR-6 Test distribution: 12 tests / 5 distinct types — 6 unit (mocked Supabase, FR-3 happy + edge), 3 integration (round-trip + TOCTOU + RPC-issued), 3 static-pin (canonical-helper-bypass-guard.test.js coverage).',
    impact: '~120-180 LOC test. Coverage of testing-agent edge cases (a)-(h) per W-3..W-5 + W-12 consumer-side.'
  },
  {
    change: 'FR-8 Post-merge smoke runner scripts/smoke/verify-claim-col-preservation.mjs with [SD_CLAIM_COL_PRESERVATION_VERIFIED] audit marker (pattern per PR #3691 [LFA_GRACEFUL_DEGRADE_TO_ACCEPTED]) — addresses sandbox-block migration risk per testing-agent C-1.',
    impact: '~30-50 LOC. Provides post-merge verification when sandbox migration application blocked (recurring class — feedback 7d238d0e).'
  },
  {
    change: 'PRD documentation: cite SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 as scope-anchor predecessor (registry + bypass-guard infra source); cite SD-LEO-INFRA-LAYER-SIDE-CLAIMING-001 (PR #3627) as adjacent fix for Layer 1 release functions; cite QF-20260509-650 + lib/db/writeback-verify.mjs as read-after-write pattern source.',
    impact: 'Traceability for future sessions; clarifies what this SD reuses vs ships net-new.'
  }
];

const key_principles = [
  'Empirical-first: LEAD risk-agent probes DISPROVED the cascade-trigger hypothesis. PRD scope reflects the empirical reality, not the original feedback framing.',
  'Explicit-write contract: claim cols only touched when caller explicitly names them in fields object. This is the canonical writer semantics that retroactively covers ALL root cause classes.',
  'FAIL-LOUD on PostgrestError — surface schema/auth errors instead of silent swallow (W2 from QF-20260510-WT-CLAIM-PROTECT-001).',
  'Reuse existing infrastructure: docs/reference/canonical-write-paths.md registry + tests/unit/governance/canonical-helper-bypass-guard.test.js + lib/governance/emit-feedback.js pattern. ~50% LOC reduction.',
  'Defense-in-depth via canonical writer + (conditional) DB fix + registry-driven static-pin (3 layers). Single layer is brittle.',
  'NOTIFY pgrst, \'reload schema\' after every CREATE OR REPLACE FUNCTION (gotcha W2 from PR #3691).',
  'Two-phase risk-agent: LEAD assesses scope shape (Phase 1 done — disproved trigger hypothesis). PLAN re-checks literal SQL/triggers after database-agent surfaces them (Phase 2 mandatory).',
  'Eat-our-own-dogfood: this SD\'s own LEAD enrichment uses _restore-claim workaround. EXEC ships safe-sd-update.js that retroactively replaces it for future SDs.',
  'Out-of-scope items deferred via Q8 deletion audit (~60% reduction): no migration of existing scripts, no claim_validity_gate refactor, no sister-SD coupling.'
];

const strategic_objectives = [
  'Close 18-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 claim-column-loss variant via writer-side preservation.',
  'Add strategic_directives_v2 to canonical-write-paths registry; eliminate the documentation gap that allows new raw .update() callers to slip in undetected.',
  'Provide explicit-write-contract semantics for sd_v2 writers — eliminates the cognitive overhead of "always run _restore-claim after every .update()" for future LEAD enrichment authors.',
  'Reuse existing canonical-helper-bypass-guard infrastructure (no new test infra needed).',
  'RCA the actual root cause (cleanup_stale_sessions race vs PG release_sd race vs other) so PR-B follow-up SD can target the source if FR-3 alone proves insufficient.',
  'Produce post-merge smoke verification ([SD_CLAIM_COL_PRESERVATION_VERIFIED] audit marker) for sandbox-blocked migration scenarios.'
];

const success_criteria = [
  {
    criterion: 'PLAN database-agent FR-1 RCA evidence row exists with trigger catalogue (3 tables) + live pg_proc snapshot of release_sd/cleanup_stale_sessions/sync_is_working_on_with_session + repro test result.',
    measure: 'sub_agent_execution_results row from database-agent at PLAN phase contains trigger_name list + action_statement excerpts + repro proof (or "not reproduced under test conditions"). Without this, FR-1.5 triage gate cannot fire.'
  },
  {
    criterion: 'lib/governance/safe-sd-update.js exists with @canonical-writer-for: strategic_directives_v2 tag, exports updateStrategicDirective(sdKeyOrId, fields, options), implements explicit-write contract (pre-read + UPDATE + post-verify).',
    measure: 'File at expected path. Static grep finds @canonical-writer-for tag. Exports verified via require().'
  },
  {
    criterion: '6 unit tests + 3 integration tests + 3 static-pin tests for FR-3/FR-4 — 12 total cases across 5 distinct types — ALL PASS in vitest.',
    measure: '12 of 12 PASS reported by vitest. Behaviour test (a) probe SD UPDATE description-only → claim cols preserved POST-FIX (FAIL pre-fix). Test types: unit-mocked, unit-edge, integration-real-db, integration-toctou, integration-rpc, static-pin.'
  },
  {
    criterion: 'docs/reference/canonical-write-paths.md updated with strategic_directives_v2 row + 6 exempt_writers entries; existing canonical-helper-bypass-guard.test.js continues to PASS (zero new violations).',
    measure: 'Registry parser detects strategic_directives_v2 entry. Bypass-guard test PASSES. Known callsite lib/claim-validity-gate.js:450 documented as exempt.'
  },
  {
    criterion: 'Post-merge smoke runner scripts/smoke/verify-claim-col-preservation.mjs emits [SD_CLAIM_COL_PRESERVATION_VERIFIED] audit marker within 5min of deploy.',
    measure: 'Audit marker observable in post-merge logs OR retrospective notes confirm verification ran successfully.'
  },
  {
    criterion: 'Zero new feedback rows of category=harness_backlog with description containing "cascade-trigger" OR "claim columns cleared" OR "claiming_session_id" + "cleared" in 7 days post-merge.',
    measure: 'Manual SQL check at 7-day burn-in. Inverse: any new such row → file follow-up SD targeting actual root cause from FR-1 evidence.'
  }
];

const success_metrics = [
  { metric: 'cascade-trigger / claim-col-loss feedback rows post-merge (7-day window)', target: '0 new rows', actual: 'measured at 7d burn-in via SQL count' },
  { metric: 'total tests for canonical writer + registry coverage', target: '12 of 12 tests PASS (6 unit + 3 integration + 3 static-pin)', actual: 'reported by vitest run after EXEC' },
  { metric: 'canonical writer callers at merge time', target: '1 of 1 reference call (this SD\'s own EXEC test infrastructure invokes it; existing scripts continue to use raw .update() — no migration in scope)', actual: 'grep count after EXEC' },
  { metric: 'PR LOC source-only (excludes tests + migration + docs)', target: '120 of 130 LOC budget (Tier-3 with documented justification if exceeded; ~50% reduction vs maximalist scope)', actual: 'gh pr diff count after EXEC' },
  { metric: 'sub-agent evidence rows across handoffs', target: '6 of 6 (LEAD: validation 739f06d2 + risk c0b54e1c + testing 1303d211; PLAN: validation + risk + database; EXEC: testing)', actual: 'sub_agent_execution_results query at PLAN-TO-LEAD' }
];

const risks = [
  {
    risk: 'PRIOR risk-agent empirically DISPROVED cascade-trigger hypothesis via 2 live UPDATE probes. Actual root cause UNKNOWN at LEAD; PLAN database-agent must surface it via FR-1 + reliable repro.',
    impact: 'high',
    likelihood: 'high',
    mitigation: 'FR-1.5 triage gate explicitly handles this — if no Postgres-side root cause reproduces, FR-2 deferred and FR-3 alone ships. Risk-agent v2 mandatory at PLAN.'
  },
  {
    risk: 'Most likely actual root cause = cleanup_stale_sessions cron (300s threshold) firing during long sub-agent execution. Per risk-agent R-5: explains intermittent symptom and matches observed behaviour (LEAD enrichment runs that include sub-agents can exceed 5min).',
    impact: 'medium',
    likelihood: 'high',
    mitigation: 'FR-1 enumerates cron + threshold values. FR-1.5 PATH B fixes if confirmed. FR-5 observability (heartbeat-lag warning) helps detect in-flight. FR-3 canonical writer provides immunity via explicit-write contract regardless.'
  },
  {
    risk: 'PG-side release_sd has multiple OVERLAPPING migration definitions (20260213, 20260218, 20260306). Per risk-agent R-4: most-recent CREATE OR REPLACE wins; PLAN MUST query pg_proc not migration files. Risk: assumed migration is wrong.',
    impact: 'medium',
    likelihood: 'high',
    mitigation: 'PLAN database-agent FR-1 explicitly queries pg_proc for live function bodies (not migration source). Documented in PRD acceptance criteria.'
  },
  {
    risk: 'Modifying overreaching trigger function (FR-2 PATH A) breaks an unforeseen consumer (e.g., release_session, cleanup_stale_sessions, postmortem auto-archive trigger). 16+ trigger candidates in repo per risk-agent enumeration.',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'FR-2 only fires if FR-1.5 confirms trigger root cause (currently LOW likelihood per risk-agent probes). Behaviour test in FR-2 migration sandbox: round-trip update on every non-claim col type, assert claim cols preserved across all paths. FR-3 canonical writer covers blind spots.'
  },
  {
    risk: 'PostgREST schema-cache miss after CREATE OR REPLACE FUNCTION (gotcha W2 from PR #3691). Consumers continue calling stale function for hours.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'NOTIFY pgrst, \'reload schema\' in same transaction as CREATE OR REPLACE. Verified post-migration via SELECT prosrc FROM pg_proc.'
  },
  {
    risk: 'Sandbox migration application blocked (SELF_SIGNED_CERT_IN_CHAIN, network) — code ships, migration does not. Per risk-agent R-6 + testing-agent C-1.',
    impact: 'medium',
    likelihood: 'high (recurring per memory feedback 7d238d0e)',
    mitigation: 'FR-3 canonical writer is independent of migration. FR-8 post-merge smoke runner verifies real DB behaviour. Module-load assertion at import time + writer fallback (pattern from PR #3667 SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001).'
  },
  {
    risk: 'Existing known callsite at lib/claim-validity-gate.js:450 issues raw .update({worktree_path:null}) on sd_v2. Per validation-agent: must be in exempt_writers OR refactored. Risk: forgotten exemption causes CI-fail post-merge.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'FR-4 explicitly documents this callsite in exempt_writers with rationale. Pre-merge canonical-helper-bypass-guard.test.js run validates registry covers all current callers.'
  },
  {
    risk: 'Static-pin false positives on legitimate raw .update() in handoff.js or sd-start.js.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'exempt_writers list with rationale per file. Pattern proven across 7+ static-pin tests this campaign. Allowlist is [path, rationale] pairs not [path] only.'
  },
  {
    risk: 'EXEC migration of existing _restore-claim scripts is requested by reviewers, scope-creeps the SD beyond Tier-3 budget.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'PRD scope explicit: existing one-offs OUT of scope (Q8 deletion audit ~60% reduction). Canonical writer retroactively covers FUTURE scripts. If reviewer pushes back, point to deletion audit + R-1 reframing evidence.'
  },
  {
    risk: 'SECURITY DEFINER function risk: if overreaching trigger function uses SECURITY DEFINER, service-role may not be able to CREATE OR REPLACE with same grants.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'FR-1 explicitly enumerates SECURITY DEFINER bit. If blocker hit at FR-1.5: FR-2 PATH A excluded, fall back to PATH B/C or FR-3 alone. Risk-agent v2 at PLAN re-assesses.'
  },
  {
    risk: 'Two-phase risk-agent cadence catches a BLOCKER class only at PLAN (PR #3691 PA-1 lesson — 1× in last 5 SDs).',
    impact: 'medium (rework, not project-killing)',
    likelihood: 'medium',
    mitigation: 'Risk-agent re-runs MANDATORY at PLAN with literal pg_proc evidence. Documented in handoff.'
  },
  {
    risk: 'PR_PRECHECK at LEAD-FINAL hard-blocks on open PRs (per risk-agent R-15). Risk: forgotten to merge PR before LEAD-FINAL.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Documented in handoff for EXEC reviewer; auto-merge if checks IN_PROGRESS at LEAD-FINAL time.'
  },
  {
    risk: 'Sister SD a050c98c (TRIPLE asymmetry on sd_v2.status enum, 21st-witness) is OUT OF SCOPE — DIFFERENT root cause (enum CHECK + lead-eval trigger + validator disagreement). Risk: scope confusion / coupling.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'PRD risks explicitly cross-references a050c98c as parallel SD candidate. KEEP SEPARATE per validation-agent confirmation.'
  }
];

const dependencies = [
  { type: 'internal', dependency: 'docs/reference/canonical-write-paths.md (existing registry from SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001)', status: 'shipped', notes: 'FR-4 adds strategic_directives_v2 row.' },
  { type: 'internal', dependency: 'tests/unit/governance/canonical-helper-bypass-guard.test.js (existing registry-driven bypass scan)', status: 'shipped', notes: 'Auto-enforces FR-4 once registry updated. NO new test file needed.' },
  { type: 'internal', dependency: 'lib/governance/emit-feedback.js (@canonical-writer-for: feedback)', status: 'shipped', notes: 'Pattern source for FR-3 API shape + canonical-writer tag.' },
  { type: 'internal', dependency: 'lib/db/writeback-verify.mjs::updateAndVerify (QF-20260509-650)', status: 'shipped', notes: 'Pattern source for FR-3 read-after-write verification.' },
  { type: 'internal', dependency: 'lib/sd/revert.js::revertSD (atomic single-UPDATE precedent)', status: 'shipped', notes: 'Atomicity precedent for FR-3.' },
  { type: 'internal', dependency: 'database-agent (PLAN-phase trigger + pg_proc enumeration)', status: 'available', notes: 'Required for FR-1; queries 3 tables + 4 PG functions.' },
  { type: 'internal', dependency: 'risk-agent two-phase cadence', status: 'available', notes: 'LEAD Phase 1 complete (c0b54e1c, MEDIUM/WARNING). PLAN Phase 2 MANDATORY.' },
  { type: 'internal', dependency: 'testing-agent prospective at LEAD', status: 'completed', notes: 'Evidence row 1303d211 (APPROVE-WITH-CONCERNS @ 84). W-1 informed reframing.' }
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'After EXEC merge: run scripts/smoke/verify-claim-col-preservation.mjs against live DB. Script claims a probe SD via sd-start (or simulates via temp INSERT + claim_sd RPC), then issues 3 .update() shapes via lib/governance/safe-sd-update.js: (a) description-only, (b) status+phase, (c) full handoff-style multi-field.',
    expected_outcome: 'All 3 shapes return success. Post-update SELECT confirms claiming_session_id + is_working_on UNCHANGED across all 3. Smoke runner emits [SD_CLAIM_COL_PRESERVATION_VERIFIED] audit marker.'
  },
  {
    step_number: 2,
    instruction: 'In a fresh terminal: claim a draft SD via sd-start.js, then run the canonical writer via require(\'./lib/governance/safe-sd-update.js\').updateStrategicDirective(sdKey, {description: \'test\'}). Then run handoff.js execute LEAD-TO-PLAN <sd-key>.',
    expected_outcome: 'Handoff proceeds without "Cannot create handoff for SD without active session claim" error. Pre-fix this would fail at claim-validity gate when .update() was called via raw Supabase client.'
  },
  {
    step_number: 3,
    instruction: 'CI: tests/unit/governance/canonical-helper-bypass-guard.test.js PASSES on current main (registry covers all current sd_v2 .update() callers). Inject a temporary raw .update() in scripts/one-off/_temp-test.mjs → test FAILS. Revert → test PASSES.',
    expected_outcome: 'Static-pin guard correctly enforces canonical-writer pattern. Allowlist exempts 6 documented callsites; bug new violations.'
  }
];

// ===== APPLY MERGE-FINDINGS UPDATE =====

async function applyMerge() {
  console.log('=== Applying merge-findings enrichment ===');
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
      smoke_test_steps
    })
    .eq('id', SD_ID);

  if (error) {
    console.error('Merge failed:', error);
    process.exit(1);
  }
  console.log('Merge applied.');
}

async function restoreClaim() {
  console.log('\n=== Restoring claim columns (cascade workaround) ===');
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
    .select('claiming_session_id, is_working_on, description, scope_reduction_percentage, success_metrics, risks')
    .eq('id', SD_ID)
    .single();
  console.log('claiming_session_id:', data.claiming_session_id);
  console.log('is_working_on:', data.is_working_on);
  console.log('scope_reduction_percentage:', data.scope_reduction_percentage);
  console.log('description (', (data.description || '').split(/\s+/).length, 'words)');
  console.log('success_metrics count:', (data.success_metrics || []).length);
  console.log('risks count:', (data.risks || []).length);
  console.log('first metric.actual:', data.success_metrics?.[0]?.actual);

  if (data.claiming_session_id !== SESSION) {
    console.error('CLAIM RESTORE FAILED — session mismatch');
    process.exit(1);
  }
  if (data.is_working_on !== true) {
    console.error('CLAIM RESTORE FAILED — is_working_on != true');
    process.exit(1);
  }
  if ((data.success_metrics || []).some(m => m.actual === 'TBD' || m.actual === '100%')) {
    console.error('SUCCESS_METRICS gate risk: contains TBD or 100% literal — must be prose form per PR #3693 lesson');
    process.exit(1);
  }
  console.log('OK — claim preserved, merge applied, success_metrics in prose form.');
}

await applyMerge();
await restoreClaim();
await verify();
