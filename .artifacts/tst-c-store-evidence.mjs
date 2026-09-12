import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C';
const supabase = createSupabaseServiceClient();

const critical_issues = [
  'F1 BLOCKING (design contradiction): TR-2 (per-row metadata merge, never overwrite) and TR-3 (chunked bulk UPDATE...WHERE id IN) are mutually incompatible in wakeExpiredSnoozes(). A single PostgREST .update({metadata:X}).in("id", ids) writes the SAME metadata object to every row in the chunk, destroying the unrelated metadata keys on each row. Live witness: probe row 00fe5ffc-7675-4802-b42a-5cdcdc5a9c21 carries metadata keys review_key + sender_session. Compounding: wakeExpiredSnoozes currently does .select("id, title") and never fetches metadata, so a per-row merge has no source to merge from. RESOLVE BEFORE EXEC: either (a) per-row UPDATE loop for the metadata column while keeping the chunked bulk UPDATE for status/snoozed_until, or (b) do not write metadata on wake -- make snoozed_until IS NULL the authoritative awake signal and stop treating metadata.snooze.active as load-bearing for reads.',
  'F2 BLOCKING (one-directional collision guard -- snoozing will not actually snooze): FR-2 protects snooze-manager reads FROM assist-engine rows, but nothing protects assist-engine reads FROM snooze-manager rows. lib/quality/assist-engine.js:292 loadInboxItems() filters .not("status","in","(resolved,wont_fix,shipped,snoozed,invalid)") -- "backlog" PASSES. Live-measured: 255 status=backlog rows already flow through that reader today. So a row snoozed via /inbox snooze reappears in the /leo assist actionable stream on the very next run, defeating the entire purpose of the feature while satisfying every PRD acceptance criterion. Note that same filter excludes the literal "snoozed", a value absent from feedback_status_check with 0 rows ever -- dead by construction. FR-2 needs a mirror clause (exclude metadata.snooze.active rows from assist-engine), or the PRD must explicitly accept that snooze does not suppress /leo assist.',
  'F3 BLOCKING (chairman-facing regression surface): the LIVE chairman_all_decision_signals feedback arm is WHERE severity IN (critical,high) AND resolved_at IS NULL AND status <> ALL (resolved,wont_fix,in_progress,duplicate,invalid). "backlog" is NOT excluded and snoozed_until is never consulted. Live-measured: 404 currently-snoozeable (status new/triaged) rows are critical/high, so each would remain a visible chairman pending decision after being snoozed. Only 3 backlog rows sit in that queue today, so this is a real and measurable new surface, not a pre-existing wash.'
];

const warnings = [
  'F4 HIGH (silent contract break in the calling skill): .claude/skills/inbox.md:417 renders the snoozed table with (item.snoozed_by || "-") -- the exact column being removed. After the fix that field is undefined, so the "Snoozed By" column renders "-" forever with no error. PRD scopes EXEC to one file, so the in-scope remedy is for getSnoozedItems() to project back-compat snoozed_by (and snooze_reason) onto each returned item from metadata.snooze. No FR requires this. Also pin these return-shape invariants the skill depends on: snoozeFeedback must keep snoozeInfo.snoozedUntil as a Date (the skill calls .toLocaleString()), must keep durationHuman, and both snoozeFeedback and unsnoozeFeedback must keep a full-row .select() (the skill reads result.title and result.status).',
  'F5 HIGH (missed export): resnooze() is a 5th exported mutator; FR-1 enumerates only 4 functions. resnooze() delegates straight to snoozeFeedback(), so re-snoozing an already-snoozed row captures pre_snooze_status="backlog" (the snoozed state itself), permanently destroying the true original status; the later unsnooze then restores the row to "backlog" instead of new/triaged. Needs an explicit guard: capture pre_snooze_status ONLY when metadata.snooze.active is not already true. No FR and no test scenario covers this.',
  'F6 MEDIUM (evidence-strength correction): the PRD treats the assist-engine collision as an observed conflict, but the live census shows status=backlog AND snoozed_until IS NOT NULL = 0 rows out of 38,190. The this_week/next_week arm has never produced a surviving row -- the LEAD probe exercised a code path, not a population. Guarding prospectively is still correct; the PRD should state the population is 0 so a future reader does not mistake this for a witnessed collision.',
  'TEST-COVERAGE: zero existing tests reference snooze-manager (grep for snoozeFeedback|wakeExpiredSnoozes|getSnoozedItems across tests/ returns 0 files) -- FR-4 is greenfield. FR-3 relies on an "or confirmed-existing test" escape hatch that is unavailable for 2 of its 5 files: assist-runner.js has 0 test files and auto-triage.js has 0 test files. Real tests must be written for those shapes.',
  'TEST-SCENARIO GAPS (TS-1..TS-7 are necessary but not sufficient): add TS-8 re-snooze must not clobber pre_snooze_status (F5); TS-9 a row with unrelated metadata keys survives a snooze/unsnooze round-trip (TR-2 is asserted by no scenario); TS-10 a snoozed row is absent from assist-engine loadInboxItems (F2); TS-11 unsnooze on a row with no metadata.snooze marker falls back to "new" (the FR-1 fallback is untested); TS-12 getSnoozedItems projects back-compat snoozed_by for the skill (F4).',
  'CONCURRENCY (accept, do not gate): the mandated read-then-write metadata merge is a lost-update race, but PostgREST cannot express a server-side jsonb || inside an UPDATE, so it is unavoidable through supabase-js. Risk is low for an interactive single-user CLI; recommend documenting as an accepted limitation rather than adding a test scenario.'
];

const recommendations = [
  'Amend the PRD before EXEC begins: resolve the TR-2/TR-3 contradiction (F1) explicitly, add the reverse-direction collision requirement or an explicit acceptance (F2), decide the chairman-queue disposition (F3), add a back-compat projection requirement for the skill (F4), and add resnooze to FR-1 with a pre_snooze_status capture guard (F5).',
  'Add metadata to the wakeExpiredSnoozes .select("id, title") projection -- satisfying TR-2 there is currently impossible.',
  'Add TS-8..TS-12 to the PRD test_scenarios so the collision-avoidance and return-shape contracts are pinned by tests rather than by prose.'
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  critical_issues,
  warnings,
  recommendations,
  summary: 'Prospective TESTING structural review of the snooze-manager fix plan. TR-1 CONFIRMED LIVE: the feedback_no_update WHEN clause enumerates ~37 frozen columns and status/snoozed_until/metadata/updated_at are all absent from it, so all 6 proposed write shapes PASSED in rolled-back live transactions while the control (title) was correctly rejected -- the PRD core approach is sound and needs no migration. However 3 blocking structural defects and 2 high-severity gaps were found that the PRD-authoring pass missed: a TR-2 x TR-3 design contradiction that makes wakeExpiredSnoozes unimplementable as specified, a one-directional collision guard that lets snoozed rows reappear in /leo assist (255 backlog rows already flow through that reader), and 404 snoozeable critical/high rows that would remain in the live chairman pending-decision queue after being snoozed. CONDITIONAL_PASS: EXEC may proceed once the PRD absorbs F1-F5.',
  detailed_analysis: {
    scope: 'PLAN-TO-EXEC prospective review, single-file fix to lib/quality/snooze-manager.js',
    method: 'Full read of snooze-manager.js (303 lines) and of assist-engine.js decision-dispatch plus loadInboxItems; read of the .claude/skills/inbox.md snooze/unsnooze/snoozed blocks; repo-wide consumer sweep for feedback.status=backlog and snoozed_until; live pg probes against the production feedback table (trigger definitions, row census, chairman view definition, and 8 rolled-back transactional write-shape tests).',
    live_evidence: {
      feedback_no_update_when_clause_exempts: ['status', 'snoozed_until', 'metadata', 'updated_at'],
      write_shapes_probed_pass: 6,
      control_title_update_blocked: true,
      total_feedback_rows: 38190,
      backlog_rows: 255,
      backlog_with_snoozed_until: 0,
      rows_with_metadata_snooze: 0,
      rows_with_status_snoozed_ever: 0,
      backlog_rows_visible_to_assist_engine_today: 255,
      snoozeable_critical_high_rows_that_would_stay_in_chairman_queue: 404,
      backlog_rows_in_chairman_queue_now: 3,
      existing_tests_referencing_snooze_manager: 0
    },
    downstream_readers_that_newly_see_these_rows: [
      'lib/quality/assist-engine.js:292 loadInboxItems -- INCLUDES backlog (F2)',
      'chairman_all_decision_signals feedback arm (live view) -- INCLUDES backlog, ignores snoozed_until (F3)',
      'lib/inbox/unified-inbox-builder.js -- buckets backlog into the ON_THE_SHELF count',
      'lib/governance/plan-drift-detectors.js OPEN_FINDING_STATUSES -- includes backlog',
      'lib/chairman/decision-retirement.mjs RETIRABLE_STATUSES -- includes backlog',
      'EXCLUDE backlog (snoozed rows silently drop out of these gauges): lib/coordinator/feedback-sla-gauge.cjs, scripts/drain-inventory.mjs, lib/governance/gauge-finding-disposition-sweep.mjs, scripts/coordinator-audit.mjs',
      'metadata.snooze is read by NOTHING else in the repo -- the marker is invisible to every reader above'
    ],
    skill_return_shape_contract: {
      'inbox.md:353': 'result.title (snoozeFeedback) -- needs a full-row select',
      'inbox.md:354': 'result.snoozeInfo.snoozedUntil.toLocaleString() -- MUST remain a Date',
      'inbox.md:355': 'result.snoozeInfo.durationHuman',
      'inbox.md:380-381': 'result.title + result.status (unsnoozeFeedback) -- status now prints the restored value, not "open"',
      'inbox.md:417': 'item.snoozed_by -- BREAKS, renders "-" forever (F4)'
    },
    verdict_rationale: 'Not a FAIL: the fix approach is live-validated and needs no migration. Not a PASS: three of the defects would each ship a feature that satisfies its stated acceptance criteria while failing its purpose.'
  },
  metadata: {
    // Honest unmeasured verdict (testing-verdict-guard.js exemption): this is a PROSPECTIVE
    // structural review at PLAN-TO-EXEC. No test suite was executed because the code under
    // review has not been written yet -- the fix is the EXEC deliverable. The verdict rests on
    // live read-only DB probes and source review, NOT on a test run, and says so.
    measured: false,
    test_execution: buildTestExecution({
      executed: 0, passed: 0, failed: 0, skipped: 0,
      runner: 'none-prospective-review',
      source: 'prospective_structural_review_no_suite_executed'
    }),
    phase: 'PLAN',
    review_type: 'prospective_structural',
    handoff: 'PLAN-TO-EXEC',
    prd_id: 'PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C',
    findings_count: { blocking: 3, high: 2, medium: 1 },
    test_scenarios_reviewed: 'TS-1..TS-7',
    test_scenarios_recommended_added: 'TS-8..TS-12'
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'lib/quality/snooze-manager.js',
  supabase
});
console.log('repo resolution:', JSON.stringify(resolution, null, 2));
applySubAgentRepoVerdict(results, resolution);
console.log('verdict after repo apply:', results.verdict);

await storeSubAgentResults('TESTING', SD, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  phase: 'PLAN',
  source: 'manual',
  sdKey: SD
});
console.log('STORED');
