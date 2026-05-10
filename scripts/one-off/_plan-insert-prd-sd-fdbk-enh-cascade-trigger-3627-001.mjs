// PLAN-PHASE-INLINE-MODE PRD insert for SD-FDBK-ENH-CASCADE-TRIGGER-3627-001
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdId = '38f4e8aa-0610-4f0d-a344-1b1968fef6b1';
const sdKey = 'SD-FDBK-ENH-CASCADE-TRIGGER-3627-001';
const prdId = `PRD-${sdKey}`;
const sessionShort = 'd694138f';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'Repair assertSweepHandoffGate query: sd_key→UUID resolution + sd_id-only lookup',
    priority: 'high',
    description: 'In lib/exec-context-guard.mjs::assertSweepHandoffGate (lines ~169-208), replace the broken `.or("sd_id.eq.${sdKey},sd_key.eq.${sdKey}")` clause. The column `sd_phase_handoffs.sd_key` does not exist; the `.or()` therefore fails with PostgrestError 42703 on every call. Repair: detect input format — if sdKey looks like a UUID (regex `^[0-9a-f]{8}-...`), use `.eq("sd_id", sdKey)` directly; otherwise resolve `sd_id` via `strategic_directives_v2.id` lookup (`select id from strategic_directives_v2 where sd_key = $1 limit 1`), then query `sd_phase_handoffs.sd_id` with the resolved UUID. Caller signature unchanged — accepts either format. When SD lookup fails (rare), throw ExecContextError(SD_NOT_FOUND) with details, NOT a silent fail-open.',
    acceptance_criteria: [
      'AC-1.1: assertSweepHandoffGate(supabase, "SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001", "LEAD") throws ExecContextError(ACCEPTED_HANDOFF_OVERRIDE) — was: returned {ok:true, dbError:"column sd_phase_handoffs.sd_key does not exist"}.',
      'AC-1.2: assertSweepHandoffGate(supabase, "2a017ba5-ad88-4746-b2a8-0a8016c13835", "LEAD") throws ExecContextError(ACCEPTED_HANDOFF_OVERRIDE).',
      'AC-1.3: assertSweepHandoffGate(supabase, "<sdKey-with-no-handoffs>", "LEAD") returns {ok: true} (no overriding handoffs found).',
      'AC-1.4: assertSweepHandoffGate(supabase, "<nonexistent-sdKey>", "LEAD") throws ExecContextError(SD_NOT_FOUND) — does NOT silently fail-open.',
      'AC-1.5: Source-LOC budget for FR-1 ≤ 25 lines net (existing function refactor, no new files).',
    ],
  },
  {
    id: 'FR-2',
    title: 'Distinguish schema-class DB errors from transient errors (fail-CLOSED on schema)',
    priority: 'high',
    description: 'In lib/exec-context-guard.mjs::assertSweepHandoffGate, change the fail-open contract at lines ~187-189. When supabase returns an error, classify it: SCHEMA-CLASS errors (PostgreSQL SQLSTATE codes 42703 "column does not exist", 42P01 "relation does not exist", 42883 "function does not exist") indicate a permanent code/schema mismatch — these MUST fail-CLOSED (throw ExecContextError(SCHEMA_ERROR)) so the caller (sweep) aborts loudly instead of silently bypassing the guard. TRANSIENT errors (network, PostgREST 5xx-class, timeout) preserve the existing fail-OPEN contract — return {ok:true, dbError}. Match by error.code (SQLSTATE), NOT by message regex (Supabase version-fragile). Default-classify unknown errors as TRANSIENT (preserve current behavior conservatively).',
    acceptance_criteria: [
      'AC-2.1: Stub supabase.from() returning {data:null, error:{code:"42703", message:"column X does not exist"}} → assertSweepHandoffGate throws ExecContextError with code SCHEMA_ERROR.',
      'AC-2.2: Stub supabase.from() returning {data:null, error:{code:"42P01", message:"relation does not exist"}} → throws SCHEMA_ERROR.',
      'AC-2.3: Stub supabase.from() returning {data:null, error:{code:"PGRST301", message:"timeout"}} → returns {ok:true, dbError:"timeout"} (fail-OPEN preserved).',
      'AC-2.4: Stub supabase.from() returning {data:null, error:{message:"unknown error", code:undefined}} → returns {ok:true, dbError:"unknown error"} (default fail-OPEN for unclassified).',
    ],
  },
  {
    id: 'FR-3',
    title: 'Regression test: vitest stub-injection covering FR-1 + FR-2',
    priority: 'high',
    description: 'Add tests/unit/exec-context-guard-handoff-gate-query-repair.test.mjs (or equivalent .test.js). Use stub-injected supabase client (no live DB) to deterministically exercise: (a) accepted handoffs past target via sdKey input → throws ACCEPTED_HANDOFF_OVERRIDE, (b) accepted handoffs past target via UUID input → throws ACCEPTED_HANDOFF_OVERRIDE, (c) no overriding handoffs → returns {ok:true}, (d) unknown sdKey → throws SD_NOT_FOUND, (e) schema error 42703 → throws SCHEMA_ERROR (fail-CLOSED), (f) schema error 42P01 → throws SCHEMA_ERROR, (g) schema error 42883 → throws SCHEMA_ERROR, (h) transient error PGRST301 → fail-OPEN, (i) unclassified error → fail-OPEN. Total ~9 cases targeting FR-1+FR-2 contract.',
    acceptance_criteria: [
      'AC-3.1: All 9 new test cases pass on `npx vitest run tests/unit/exec-context-guard-handoff-gate-query-repair.test.mjs`.',
      'AC-3.2: Existing tests/unit/exec-context-guard*.test.* continue to pass (no regression).',
      'AC-3.3: lib/eva test suite (full) shows ZERO regressions vs pre-PR baseline (capture pre-PR pass count, assert post-PR equals).',
    ],
  },
  {
    id: 'FR-4',
    title: 'Fleet pre-merge audit query: latent-bug disclosure',
    priority: 'medium',
    description: 'Add scripts/audit/fleet-handoff-gate-latent-victims.mjs — a one-shot Node script that enumerates SDs whose `current_phase` ranks BELOW their latest accepted `to_phase` in sd_phase_handoffs. These are SDs the broken guard has been silently allowing the sweep to reset. Output: TSV-formatted list (sd_key, current_phase, latest_accepted_to_phase, accepted_handoff_count) sorted by severity (most-egregious phase regressions first). Include a hint header line indicating manual triage may be required. This script is run by LEAD at PLAN-VERIFY review and the output saved as evidence.',
    acceptance_criteria: [
      'AC-4.1: scripts/audit/fleet-handoff-gate-latent-victims.mjs runs to completion without error and exits 0.',
      'AC-4.2: Output includes the witness SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 IF its current state still shows phase regression (note: it was manually restored, may not appear).',
      'AC-4.3: Output is human-readable TSV with header row.',
      'AC-4.4: Script attaches its output to PLAN-VERIFY evidence (saved to docs/audits/<sd-key>-latent-victims.tsv or stored in metadata).',
    ],
  },
  {
    id: 'FR-5',
    title: 'Structured log line on guard fail-CLOSED for operator visibility',
    priority: 'medium',
    description: 'When assertSweepHandoffGate fails-CLOSED with SCHEMA_ERROR (FR-2), emit a structured stderr log line to the sweep operator. Format: `[exec-context-guard] SCHEMA_ERROR sd_key=<X> target=<phase> sqlstate=<code> hint="check column references in lib/exec-context-guard.mjs"`. The line is the only operator-visible signal that the guard aborted. Reuses existing console.warn/console.error patterns in stale-session-sweep.cjs.',
    acceptance_criteria: [
      'AC-5.1: When stub supabase returns 42703, the structured log line appears on stderr exactly once.',
      'AC-5.2: Line includes the SD key, target phase, and SQLSTATE code.',
      'AC-5.3: Line is machine-parseable (key=value tokens) (key=value format suitable for log aggregation grep).',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    title: 'sd_phase_handoffs.sd_id is TEXT-typed but stores UUIDs',
    rationale: 'Direct probe (PLAN-phase verification 2026-05-10): query by SD-code (`SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001`) returns 0 rows; query by UUID (2a017ba5-...) returns 5 rows; sample of 50 rows shows ALL distinct sd_id values are UUID-format (none SD-code-format). Risk-agent (3e62f9bf) initially proposed dropping the UUID resolver based on the column being TEXT, but column type alone does not determine stored format. Empirical sample is the source of truth.',
    description: 'FR-1 MUST resolve sd_key→UUID before querying sd_phase_handoffs.sd_id. The lookup is a single-row select on strategic_directives_v2.id where sd_key=$1. Cache the lookup at the sweep iteration level if performance-critical (currently not — sweep iteration count is typically <100/cycle).',
  },
  {
    id: 'TR-2',
    title: 'Use SQLSTATE codes (error.code), not message regex',
    rationale: 'Risk-agent recommendation (3e62f9bf, MEDIUM concern Q4): error.message format is Supabase-version-dependent and prone to drift; error.code (PostgreSQL SQLSTATE) is part of the wire protocol and stable across versions. Matching by code is significantly more robust.',
    description: 'Schema-class set: `{42703: "column does not exist", 42P01: "relation does not exist", 42883: "function does not exist"}`. Implementation: simple `Set` lookup by error.code. Default unknown error.code values to TRANSIENT (preserves existing fail-OPEN contract for any error not explicitly classified).',
  },
  {
    id: 'TR-3',
    title: 'No feature flag — atomic single-file revert if needed',
    rationale: 'Risk-agent recommendation: a feature flag would create a new fail-open drift surface (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 class). The fix RESTORES intended behavior of SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 FR-3, which has been broken since 2026-05-08. No flag needed; if the fix surfaces fleet-wide latent issues, FR-4 audit query at PLAN-VERIFY discloses them in advance.',
    description: 'Single-file change in lib/exec-context-guard.mjs (~25 LOC net). FR-4 audit script discloses any latent victim SDs at merge time. If unforeseen issues arise post-merge, atomic git revert restores the previous (broken) fail-open state.',
  },
  {
    id: 'TR-4',
    title: 'Test approach: stub-injection (no live DB)',
    rationale: 'Risk-agent recommendation (Q6, LOW): live-DB tests cannot deterministically inject error.code:42703 (the bug shipped to production despite live tests because the existing tests stub the happy path or DB is happy). Stub-injection ensures every error path is exercised.',
    description: 'Tests pass a stub supabase client with `from()` returning a chainable mock that yields `{data, error}` configurable per case. The mock pattern is used elsewhere in tests/unit/* (e.g. claim-validity-gate tests). New test file ~150 LOC, all stub-based, no live DB calls.',
  },
];

const test_scenarios = [
  { id: 'TS-1', test_type: 'unit', given: 'Stub supabase yields 3 accepted handoffs whose to_phase ranks > target=LEAD', when: 'assertSweepHandoffGate(stubSupabase, sdKey, "LEAD")', then: 'throws ExecContextError(ACCEPTED_HANDOFF_OVERRIDE) with overriding[] populated', scenario: 'FR-1 happy-path: SD-code input resolves and guard fires' },
  { id: 'TS-2', test_type: 'unit', given: 'Stub supabase yields 3 accepted handoffs past target', when: 'assertSweepHandoffGate(stubSupabase, uuidString, "LEAD")', then: 'throws ACCEPTED_HANDOFF_OVERRIDE — UUID input bypasses the resolver path and queries sd_id directly', scenario: 'FR-1 happy-path: UUID input direct query' },
  { id: 'TS-3', test_type: 'unit', given: 'Stub supabase yields 0 handoffs', when: 'assertSweepHandoffGate(stubSupabase, sdKey, "LEAD")', then: 'returns {ok:true} (no overriding handoffs found)', scenario: 'FR-1 negative: empty handoffs allows reset' },
  { id: 'TS-4', test_type: 'unit', given: 'SD lookup returns null (sdKey not found)', when: 'assertSweepHandoffGate(stubSupabase, "nonexistent-key", "LEAD")', then: 'throws ExecContextError(SD_NOT_FOUND)', scenario: 'FR-1 unknown-sdKey: fail-loud' },
  { id: 'TS-5', test_type: 'unit', given: 'Stub supabase returns error{code:"42703"}', when: 'assertSweepHandoffGate is called', then: 'throws ExecContextError(SCHEMA_ERROR); structured log line on stderr', scenario: 'FR-2+FR-5 schema 42703 fail-CLOSED' },
  { id: 'TS-6', test_type: 'unit', given: 'Stub supabase returns error{code:"42P01"}', when: 'assertSweepHandoffGate is called', then: 'throws SCHEMA_ERROR (relation does not exist)', scenario: 'FR-2 schema 42P01 fail-CLOSED' },
  { id: 'TS-7', test_type: 'unit', given: 'Stub supabase returns error{code:"42883"}', when: 'assertSweepHandoffGate is called', then: 'throws SCHEMA_ERROR (function does not exist)', scenario: 'FR-2 schema 42883 fail-CLOSED' },
  { id: 'TS-8', test_type: 'unit', given: 'Stub supabase returns error{code:"PGRST301"} (timeout)', when: 'assertSweepHandoffGate is called', then: 'returns {ok:true, dbError:"timeout"} — fail-OPEN preserved', scenario: 'FR-2 transient: fail-OPEN preserved' },
  { id: 'TS-9', test_type: 'unit', given: 'Stub supabase returns error{message:"unknown", code:undefined}', when: 'assertSweepHandoffGate is called', then: 'returns {ok:true, dbError} — default to fail-OPEN for unclassified', scenario: 'FR-2 unclassified: conservative fail-OPEN' },
  { id: 'TS-10', test_type: 'integration', given: 'Live witness SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 (3 accepted handoffs in sd_phase_handoffs)', when: 'assertSweepHandoffGate(realSupabase, sdKey, "LEAD")', then: 'throws ACCEPTED_HANDOFF_OVERRIDE — was: returned {ok:true,dbError}', scenario: 'Smoke (manual): repro of original bug after fix' },
];

const acceptance_criteria = [
  ...functional_requirements.flatMap(fr => (fr.acceptance_criteria || []).map(criterion => ({ requirement_id: fr.id, criterion }))),
  { requirement_id: 'NFR-1', criterion: 'PR LOC ≤30 in lib/exec-context-guard.mjs (source). Test file ≤200 LOC. Audit script ≤100 LOC.' },
  { requirement_id: 'NFR-2', criterion: 'Zero regressions: pre-existing exec-context-guard + lib/eva test suites unchanged after PR.' },
  { requirement_id: 'NFR-3', criterion: 'Smoke test (smoke_test_steps in SD) runs green at EXEC-COMPLETE.' },
  { requirement_id: 'NFR-4', criterion: 'Fleet audit (FR-4) output saved as evidence at PLAN-VERIFY before LEAD-FINAL-APPROVAL.' },
];

const risks = [
  { id: 'R-1', risk: 'Closing fail-open surfaces latent issues across the fleet — sweep behavior changes from "reset everything that looks orphaned" to "skip resets when accepted handoffs past target exist". Some currently-being-silently-reset SDs may now be retained instead, surfacing real bugs being masked.', impact: 'MEDIUM', probability: 'MEDIUM', mitigation: 'FR-4 fleet pre-merge audit query enumerates latent victims at PR time; LEAD reviews output before final approval. Per-SD triage may be needed for affected SDs but each is a genuine bug being uncovered, not a regression.', rollback_plan: 'Atomic single-file revert of lib/exec-context-guard.mjs restores the previous fail-open state.' },
  { id: 'R-2', risk: 'sd_key→UUID lookup adds DB round-trip per assertSweepHandoffGate call', impact: 'LOW', probability: 'LOW', mitigation: 'Sweep iteration count is small (<100/cycle, runs every 5min). UUID inputs bypass the resolver entirely. If observed latency >50ms p99, add per-iteration cache (deferred unless needed).', rollback_plan: 'N/A — performance optimization, not correctness.' },
  { id: 'R-3', risk: 'Schema-class detection misclassifies a non-schema PostgREST error as schema (over-fail-CLOSED)', impact: 'LOW', probability: 'LOW', mitigation: 'Match strictly on SQLSTATE codes (42703, 42P01, 42883) — these are PostgreSQL-protocol-defined and stable. Default unknown codes to TRANSIENT (fail-OPEN preserved). Test coverage includes both classes.', rollback_plan: 'Single-line revert of the schema-class Set; falls back to fail-OPEN-on-all-errors (current broken behavior, but at least not a regression).' },
  { id: 'R-4', risk: 'Audit script (FR-4) overlooks edge case where accepted handoff to_phase is unknown (not in phaseRank)', impact: 'LOW', probability: 'LOW', mitigation: 'Audit script uses same phaseRank mapping as assertSweepHandoffGate; unknown phases are skipped (consistent with guard behavior). Document the mapping in audit script header.', rollback_plan: 'N/A — audit is informational, not state-changing.' },
];

const system_architecture = {
  overview: 'Single-file repair to lib/exec-context-guard.mjs::assertSweepHandoffGate query. Function signature unchanged. Surface area: one query rewrite + new error-classification branch + structured log line on fail-CLOSED. Plus regression test (stub-injected) and one-shot fleet audit script.',
  components: [
    { name: 'lib/exec-context-guard.mjs', role: 'Repaired query (sd_key→UUID resolution + sd_id-only lookup); schema-class error classifier; structured log on fail-CLOSED' },
    { name: 'tests/unit/exec-context-guard-handoff-gate-query-repair.test.mjs', role: 'Regression test (9 cases, stub-injected supabase, zero live DB)' },
    { name: 'scripts/audit/fleet-handoff-gate-latent-victims.mjs', role: 'One-shot audit script enumerating SDs with phase-regression patterns; run at PLAN-VERIFY' },
    { name: 'scripts/stale-session-sweep.cjs', role: 'Caller — UNCHANGED. Receives the now-effective guard via existing isSweepResetAllowed wrapper at lines 686, 742, 155.' },
    { name: 'sd_phase_handoffs', role: 'Read-only target — unchanged schema. Empirically verified sd_id stores UUIDs.' },
    { name: 'strategic_directives_v2', role: 'Read-only — used by sd_key→UUID resolution path' },
  ],
  data_flow: 'sweep → isSweepResetAllowed → assertSweepHandoffGate(supabase, sdKey, target) → [if sdKey is UUID-format: query sd_phase_handoffs.sd_id directly] OR [if SD-code: lookup strategic_directives_v2.id, then query sd_phase_handoffs.sd_id with UUID] → filter accepted handoffs whose to_phase rank > target rank → throw ACCEPTED_HANDOFF_OVERRIDE if any | DB error: classify → SCHEMA_ERROR throw + log | TRANSIENT/UNKNOWN → fail-OPEN return {ok:true, dbError}',
};

const integration_operationalization = {
  consumers: [
    { consumer: 'scripts/stale-session-sweep.cjs (3 reset paths: PHASE_RESET_MAP, STUCK_PENDING_APPROVAL, PHANTOM_IN_PROGRESS)', journey: 'Each reset path calls isSweepResetAllowed → assertSweepHandoffGate. After fix, accepted handoffs past target reset phase block the reset (current broken behavior allowed reset).' },
    { consumer: 'Other potential callers (none currently — assertSweepHandoffGate exported for sweep only)', journey: 'Function signature preserved; any future caller benefits from repaired behavior automatically.' },
  ],
  dependencies: [
    { name: 'sd_phase_handoffs (table)', direction: 'upstream', failure_mode: 'If sd_id column is renamed in future migration, FR-2 will surface 42703 as SCHEMA_ERROR fail-CLOSED — operator alerted via FR-5 log line.' },
    { name: 'strategic_directives_v2 (table)', direction: 'upstream', failure_mode: 'If sd_key column is renamed, FR-1 SD lookup throws SD_NOT_FOUND-class error; sweep aborts loudly.' },
    { name: 'PostgreSQL SQLSTATE codes (wire protocol)', direction: 'upstream', failure_mode: 'Stable across PG versions; minimal drift risk.' },
  ],
  data_contracts: [
    { entity: 'assertSweepHandoffGate input', shape: 'sdKey: string (either SD-code like "SD-XXX-001" or UUID like "2a017ba5-..."); targetResetPhase: "LEAD" | "PLAN" | "EXEC"' },
    { entity: 'assertSweepHandoffGate output (success)', shape: '{ok: true} | {ok: true, dbError: string} (fail-OPEN on transient)' },
    { entity: 'assertSweepHandoffGate output (failure)', shape: 'throws ExecContextError with code in {ACCEPTED_HANDOFF_OVERRIDE, SCHEMA_ERROR, SD_NOT_FOUND}' },
    { entity: 'fleet audit TSV row', shape: '{sd_key, current_phase, latest_accepted_to_phase, phase_rank_diff, accepted_handoff_count}' },
  ],
  runtime_config: [
    { config: 'No new env vars or feature flags', purpose: 'Atomic restoration of intended behavior; no flag drift surface' },
  ],
  observability_rollout: {
    metrics: [
      'stderr line count for `[exec-context-guard] SCHEMA_ERROR ...` (FR-5 log line)',
      'sweep `SKIP_RESET: ... ACCEPTED_HANDOFF_OVERRIDE` line count (existing — should increase post-fix)',
      'sweep abort count (currently 0 by virtue of bug; expected to remain 0 in steady state — only if a future migration breaks the schema)',
    ],
    rollout_plan: 'Single-PR atomic merge. FR-4 fleet audit run at PLAN-VERIFY discloses any latent victim SDs in advance. Observe 2 sweep cycles (~10 min) post-merge to confirm SKIP_RESET log lines appear for protected SDs.',
    rollback_procedure: 'git revert <commit>; sweep returns to previous broken-but-stable behavior. No DB changes to unwind.',
  },
};

const exploration_summary = {
  files_read: [
    'lib/exec-context-guard.mjs (full read — 264 LOC)',
    'scripts/stale-session-sweep.cjs (lines 80-140 + 600-770 — guard caller + reset paths)',
    'database/migrations/20260509_layer1_claiming_session_id_release_parity.sql (full read — exonerated PR #3627 functions)',
  ],
  baseline_observation: 'Direct invocation 2026-05-10: assertSweepHandoffGate(supabase, "SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001", "LEAD") returns {ok:true, dbError:"column sd_phase_handoffs.sd_key does not exist"}. Same SD has 5 rows in sd_phase_handoffs with 3 accepted handoffs past LEAD (LEAD-TO-PLAN to_phase=PLAN, PLAN-TO-EXEC to_phase=EXEC, PLAN-TO-LEAD to_phase=LEAD). Guard SHOULD throw — instead, fails-open silently.',
  existing_infrastructure: 'lib/exec-context-guard.mjs shipped 2026-05-08 (commit c4f25e4023, PR #3600, SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001). assertSweepHandoffGate, ExecContextError class, isSweepResetAllowed wrapper all preserved as-is. Fix repairs only the .or() clause and adds error classification.',
  validation_agent_evidence: { row_id: 'f8dbf7c6-729c-4817-9bc2-112666488151', verdict: 'PASS', confidence: 92, finding: 'No duplicate fix exists; SD type/priority correct; scope boundary sharp; PR #3627 migration validated INNOCENT.' },
  risk_agent_evidence: { row_id: '3e62f9bf-6010-48f6-b775-910a68badb9c', verdict: 'PASS (MEDIUM-LOW risk)', confidence: 87, finding: 'Top concerns: latent fleet bugs surfacing (mitigated by FR-4 audit), schema-class detection accuracy (mitigated by SQLSTATE matching). Recommended additions: FR-4 audit query, FR-5 structured log, test via stub-injection. Risk-agent UUID-resolver-elimination claim was empirically refuted (sd_id stores UUIDs not SD-codes).' },
};

const prdRow = {
  id: prdId,
  directive_id: sdKey,
  sd_id: sdId,
  title: 'Repair assertSweepHandoffGate query: schema-error fail-open caused phantom-session SD state regressions',
  version: '1.0.0',
  status: 'in_progress',
  category: 'bugfix',
  priority: 'high',
  document_type: 'prd',
  phase: 'planning',
  progress: 0,
  executive_summary: 'lib/exec-context-guard.mjs::assertSweepHandoffGate has been silently fail-open on every call since deployment (commit c4f25e4023, 2026-05-08) due to a non-existent column reference (sd_phase_handoffs.sd_key) in its .or() query clause. The fail-open path returns {ok:true, dbError} on any DB error including this permanent schema error, so all stale-session-sweep reset paths (PHASE_RESET_MAP, STUCK_PENDING_APPROVAL, PHANTOM_IN_PROGRESS) bypass the guard. Witness: SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 was reset to draft/LEAD/0% on 2026-05-10 despite having 3 accepted handoffs past LEAD in sd_phase_handoffs. Source feedback c76f88ff misattributed the cause to PR #3627 cascade trigger; PR #3627 functions only clear claim columns (active_session_id/claiming_session_id/is_working_on) and are innocent. This PR repairs the guard query (sd_key→UUID resolution + sd_id-only lookup), distinguishes schema-class vs transient errors (fail-CLOSED on SQLSTATE 42703/42P01/42883, fail-OPEN preserved on transient), adds vitest stub-injection regression, runs a fleet audit (FR-4) to disclose latent victim SDs at PLAN-VERIFY, and emits a structured log line on fail-CLOSED for operator visibility.',
  business_context: 'Silent corruption of SD work-product state across the fleet. Witnessed regression cost ~30 min of manual user-authorized DB UPDATE to restore. Multiple invisible regressions likely occurred since 2026-05-08 (FR-4 audit will quantify). Restoring the guard prevents future state-loss class incidents and surfaces any latent victims at merge time so operators can triage.',
  technical_context: 'Backend infrastructure SD (EHG_Engineer only). Single-file repair in lib/ + new test file + new audit script. No DB schema changes, no migrations. Only consumer is scripts/stale-session-sweep.cjs (3 reset call sites at lines 155, 686, 742) — UNCHANGED. The fix RESTORES intended behavior of SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 FR-3.',
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria,
  risks,
  system_architecture,
  integration_operationalization,
  exploration_summary,
  technology_stack: ['Node.js (ESM in lib/)', 'Supabase JS client', 'vitest', 'PostgreSQL SQLSTATE codes'],
  dependencies: [
    'lib/exec-context-guard.mjs (PR #3600, exports assertSweepHandoffGate)',
    'sd_phase_handoffs table (read-only target)',
    'strategic_directives_v2 table (sd_key→UUID resolution path)',
  ],
  performance_requirements: { p99_assert_sweep_handoff_gate_ms: 100, sweep_iteration_overhead_max_ms: 50 },
  metadata: {
    sd_key: sdKey,
    sd_type: 'bugfix',
    plan_phase_session: 'd694138f-de06-478a-b758-18e8c1d84445',
    rescope_source: 'risk-agent recommendations folded as FR-4 + FR-5 + SQLSTATE matching',
    loc_estimate: { source: { min: 25, max: 40 }, tests: 200, audit_script: 100, ceiling: 340 },
    out_of_scope: [
      'PR #3627 migration changes (innocent of the regression)',
      'PHASE_RESET_MAP / STUCK_PENDING_APPROVAL / PHANTOM_IN_PROGRESS reset paths in stale-session-sweep.cjs (intended behavior)',
      'QF-20260423-909 PLAN-TO-LEAD-specific guard (works correctly)',
      'Feature flag (atomic single-file revert sufficient per risk-agent)',
    ],
    sub_agent_evidence: {
      validation: 'f8dbf7c6-729c-4817-9bc2-112666488151',
      risk: '3e62f9bf-6010-48f6-b775-910a68badb9c',
    },
    risk_agent_correction: 'Risk-agent recommended dropping UUID resolver based on column-type=TEXT inference. PLAN-phase empirical probe refuted: 50-row sample shows ALL sd_phase_handoffs.sd_id values are UUID-format. FR-1 retains the resolver path.',
  },
  created_by: `PLAN-PHASE-INLINE-MODE-CC-${sessionShort}`,
  goal_summary: 'Restore the deployed-but-silently-broken assertSweepHandoffGate guard so stale-session-sweep reset paths actually skip when accepted handoffs past the target reset phase exist; surface any latent fleet victims at merge time via FR-4 audit.',
  smoke_test_cmd: 'npx vitest run tests/unit/exec-context-guard-handoff-gate-query-repair.test.mjs',
};

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdRow)
  .select('id, directive_id, sd_id, status, phase, category, priority, created_by');

if (error) {
  console.error('INSERT_ERR:', error);
  process.exit(1);
}

console.log('PRD_INSERTED:', JSON.stringify(data, null, 2));
