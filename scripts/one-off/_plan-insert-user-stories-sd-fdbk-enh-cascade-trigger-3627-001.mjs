// PLAN-PHASE user-stories insert for SD-FDBK-ENH-CASCADE-TRIGGER-3627-001
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdId = '38f4e8aa-0610-4f0d-a344-1b1968fef6b1';
const sdKey = 'SD-FDBK-ENH-CASCADE-TRIGGER-3627-001';
const prdId = `PRD-${sdKey}`;

const stories = [
  {
    story_key: `${sdKey}:US-001`,
    sd_id: sdId,
    prd_id: prdId,
    title: 'Repair assertSweepHandoffGate query',
    user_role: 'stale-session-sweep operator',
    user_want: 'assertSweepHandoffGate to actually block reset paths when accepted handoffs past the target reset phase exist',
    user_benefit: 'so SD work-product state (status, current_phase, progress) is not silently corrupted when phantom sessions are SWEEP_PID_DEAD-released',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'assertSweepHandoffGate(supabase, "SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001", "LEAD") throws ExecContextError(ACCEPTED_HANDOFF_OVERRIDE)',
      'assertSweepHandoffGate(supabase, "<uuid>", "LEAD") throws ACCEPTED_HANDOFF_OVERRIDE on UUID input',
      'assertSweepHandoffGate(supabase, "<sdKey-with-no-handoffs>", "LEAD") returns {ok: true}',
      'assertSweepHandoffGate(supabase, "<nonexistent-sdKey>", "LEAD") throws ExecContextError(SD_NOT_FOUND)',
    ],
    test_scenarios: [
      'GIVEN witness SD with 3 accepted handoffs in sd_phase_handoffs WHEN assertSweepHandoffGate is called THEN it throws ACCEPTED_HANDOFF_OVERRIDE',
      'GIVEN UUID input format WHEN assertSweepHandoffGate is called THEN it bypasses the resolver and queries sd_id directly',
    ],
    given_when_then: [
      'GIVEN PR is merged WHEN sweep encounters STUCK_PENDING_APPROVAL or PHANTOM_IN_PROGRESS SD with accepted handoffs THEN sweep skips reset and emits SKIP_RESET log line',
    ],
    technical_notes: 'lib/exec-context-guard.mjs:169-208 — replace .or(sd_id.eq.X,sd_key.eq.X) with sd_key->UUID resolution + sd_id-only lookup',
    implementation_context: 'lib/exec-context-guard.mjs::assertSweepHandoffGate function (lines 169-208). Resolve sd_key→UUID via select id from strategic_directives_v2 where sd_key=$1 (only when input is not UUID-format). Then query sd_phase_handoffs.sd_id with the UUID. UUID detection regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.',
    implementation_status: 'pending',
    e2e_test_status: 'not_created',
    metadata: { fr_id: 'FR-1' },
  },
  {
    story_key: `${sdKey}:US-002`,
    sd_id: sdId,
    prd_id: prdId,
    title: 'Distinguish schema-class DB errors from transient errors (fail-CLOSED on schema)',
    user_role: 'stale-session-sweep operator',
    user_want: 'permanent schema errors to fail-CLOSED so future column drift is loudly surfaced instead of silently bypassed',
    user_benefit: 'so the bug class that caused the original regression (silent fail-open on schema mismatch) cannot recur for any future schema change',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'PostgreSQL SQLSTATE 42703 (column does not exist) -> fail-CLOSED with ExecContextError(SCHEMA_ERROR)',
      'PostgreSQL SQLSTATE 42P01 (relation does not exist) -> fail-CLOSED',
      'PostgreSQL SQLSTATE 42883 (function does not exist) -> fail-CLOSED',
      'PGRST301 (timeout) and other transient errors -> fail-OPEN preserved (returns {ok:true, dbError})',
      'Unclassified errors -> fail-OPEN (default conservative)',
    ],
    test_scenarios: [
      'GIVEN stub supabase returning error{code:42703} WHEN assertSweepHandoffGate runs THEN it throws SCHEMA_ERROR',
      'GIVEN stub returning error{code:PGRST301} WHEN it runs THEN it returns {ok:true, dbError}',
    ],
    given_when_then: [
      'GIVEN sweep encounters schema-class error WHEN guard runs THEN sweep aborts loudly with structured log line (FR-5)',
    ],
    technical_notes: 'Match by error.code (SQLSTATE), NOT message regex. Schema-class set: {42703, 42P01, 42883}.',
    implementation_context: `lib/exec-context-guard.mjs assertSweepHandoffGate. Replace if(error){return {ok:true, dbError}} with classifier: const SCHEMA_CODES = new Set(['42703', '42P01', '42883']); if (error && SCHEMA_CODES.has(error.code)) throw new ExecContextError('SCHEMA_ERROR', ...); else if (error) return {ok:true, dbError}; (preserves transient fail-OPEN).`,
    implementation_status: 'pending',
    e2e_test_status: 'not_created',
    metadata: { fr_id: 'FR-2' },
  },
  {
    story_key: `${sdKey}:US-003`,
    sd_id: sdId,
    prd_id: prdId,
    title: 'Vitest stub-injection regression test',
    user_role: 'CI gate enforcer',
    user_want: 'a stub-injected vitest test covering 9+ branches of the repaired guard',
    user_benefit: 'so future regressions to the column-name drift class or schema-error fail-open class are caught in CI before merge',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'New test file tests/unit/exec-context-guard-handoff-gate-query-repair.test.mjs (or .test.js)',
      '9+ test cases covering FR-1 (sdKey input, UUID input, no handoffs, unknown sdKey) + FR-2 (3 schema codes, transient, unclassified)',
      'Test uses stub-injected supabase client (zero live DB)',
      'All cases pass; existing exec-context-guard tests unchanged; lib/eva regression count unchanged',
    ],
    test_scenarios: [
      'GIVEN test suite runs WHEN any branch of guard contract is broken THEN at least one test fails',
    ],
    given_when_then: [
      'GIVEN a developer changes sd_phase_handoffs schema WHEN PR is opened THEN regression test fails IF guard is not also updated',
    ],
    technical_notes: 'Mock supabase.from() with chainable .select().or().eq() returning configurable {data, error}. Pattern from claim-validity-gate test files.',
    implementation_context: `New file: tests/unit/exec-context-guard-handoff-gate-query-repair.test.mjs (or .test.js). Use vitest. Stub supabase.from() with a chainable mock yielding {data, error}. 9+ test cases covering FR-1 (sdKey, UUID, no-handoffs, unknown-sdKey) + FR-2 (42703, 42P01, 42883, transient, unclassified). Pattern reference: existing tests/unit/claim-validity-gate*.test.* files.`,
    implementation_status: 'pending',
    e2e_test_status: 'not_created',
    metadata: { fr_id: 'FR-3' },
  },
  {
    story_key: `${sdKey}:US-004`,
    sd_id: sdId,
    prd_id: prdId,
    title: 'Fleet pre-merge audit script discloses latent victim SDs',
    user_role: 'LEAD reviewer at PLAN-VERIFY',
    user_want: 'a one-shot script enumerating SDs whose current_phase ranks below their latest accepted to_phase',
    user_benefit: 'so any latent fleet victims of the broken guard are disclosed at PR review time, not discovered post-merge in production',
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'New script scripts/audit/fleet-handoff-gate-latent-victims.mjs',
      'Script runs to completion and exits 0',
      'Output is human-readable TSV (header + rows: sd_key, current_phase, latest_accepted_to_phase, phase_rank_diff, accepted_handoff_count)',
      'Output saved as evidence at PLAN-VERIFY (file or PRD metadata)',
    ],
    test_scenarios: [
      'GIVEN fleet has at least one SD with phase regression WHEN audit runs THEN that SD appears in output',
      'GIVEN fleet has no phase regressions WHEN audit runs THEN output has only header line',
    ],
    given_when_then: [
      'GIVEN PR is approaching LEAD-FINAL WHEN LEAD reviewer runs audit THEN they see disclosed list of affected SDs and can authorize per-SD triage',
    ],
    technical_notes: 'phaseRank mapping mirrors lib/exec-context-guard.mjs::assertSweepHandoffGate. Skip phases not in mapping (consistent with guard).',
    implementation_context: `New file: scripts/audit/fleet-handoff-gate-latent-victims.mjs. Imports phaseRank from lib/exec-context-guard.mjs (export it if not already). Iterates strategic_directives_v2 rows joining latest accepted sd_phase_handoffs per sd_id. Computes phase_rank_diff = phaseRank[latest_to_phase] - phaseRank[current_phase]. Outputs TSV to stdout AND saves to docs/audits/<sd-key>-latent-victims-<date>.tsv.`,
    implementation_status: 'pending',
    e2e_test_status: 'not_created',
    metadata: { fr_id: 'FR-4' },
  },
  {
    story_key: `${sdKey}:US-005`,
    sd_id: sdId,
    prd_id: prdId,
    title: 'Structured log line on guard fail-CLOSED for operator visibility',
    user_role: 'sweep operator monitoring stderr',
    user_want: 'a key=value log line emitted when assertSweepHandoffGate aborts due to schema-class error',
    user_benefit: 'so silent guard aborts cannot recur — every fail-CLOSED is human-visible and grep-able for log aggregation',
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Format: `[exec-context-guard] SCHEMA_ERROR sd_key=<X> target=<phase> sqlstate=<code> hint="check column references in lib/exec-context-guard.mjs"`',
      'Line emitted exactly once per fail-CLOSED event',
      'Line is unambiguously parseable (key=value)',
    ],
    test_scenarios: [
      'GIVEN stub returns 42703 WHEN guard runs THEN structured log line appears on stderr',
    ],
    given_when_then: [
      'GIVEN future schema migration breaks guard WHEN sweep runs THEN stderr is grep-able for "[exec-context-guard]" lines',
    ],
    technical_notes: 'Use console.error with template literal. Reuse stale-session-sweep.cjs log conventions where possible.',
    implementation_context: 'In lib/exec-context-guard.mjs::assertSweepHandoffGate, when classifier triggers SCHEMA_ERROR throw, prepend a console.error line of the form: [exec-context-guard] SCHEMA_ERROR sd_key=<X> target=<phase> sqlstate=<code> hint="check column references in lib/exec-context-guard.mjs". Use template literal in source code; document key=value format here.',
    implementation_status: 'pending',
    e2e_test_status: 'not_created',
    metadata: { fr_id: 'FR-5' },
  },
];

const { data, error } = await supabase
  .from('user_stories')
  .insert(stories)
  .select('id, story_key, status, priority');

if (error) {
  console.error('INSERT_ERR:', error);
  process.exit(1);
}

console.log('USER_STORIES_INSERTED:', data.length);
for (const s of data) {
  console.log('  -', s.story_key, '|', s.status, '|', s.priority);
}
