#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C, LEAD-TO-PLAN phase.
 *
 * Records the discovery work performed before LEAD's scope correction: re-reading all 9 named
 * call sites across 6 files against current main, reading the newly-applied
 * 20260912_feedback_no_update_lifecycle_allowlist.sql migration in full, running a live
 * transactional probe (BEGIN + SAVEPOINT per shape + ROLLBACK, no persisted writes) against the
 * production DB to empirically confirm each shape's actual behavior rather than inferring from
 * column names alone, and tracing lib/quality/snooze-manager.js's real callers via
 * .claude/skills/inbox.md. Independently corroborated by a validation-agent Task-tool run
 * (evidence row ab9b70a1-18f0-4191-bc04-26b48859029e), which caught two gaps in this exploration
 * (the /inbox skill caller this search initially missed, and wakeExpiredSnoozes/getSnoozedItems
 * as two additional broken functions beyond the 3 originally named).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C';

const findings = [
  {
    id: 'migration-applied-narrows-trigger-to-content-columns',
    severity: 'INFO',
    summary: 'database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql (chairman decision ba4055b7 option A) was APPLIED 2026-09-12T10:53:36Z, read in full and confirmed live via pg_get_triggerdef (tgenabled=\'A\', WHEN clause present). It replaces feedback_no_update with a WHEN-clause trigger that only fires when a CONTENT column changes (title, description, category, type, source_application, source_type, error_message, etc.); lifecycle columns (status, resolved_at, resolution_notes, resolution_type, ai_triage_classification, ai_triage_confidence, ai_triage_source, snoozed_until, metadata, updated_at, etc.) are unconditionally UPDATE-able again.',
  },
  {
    id: 'eight-of-nine-sites-already-fixed-by-migration-confirmed-via-live-probe',
    severity: 'INFO',
    summary: 'Read all 6 named files directly against current main (not grep-only) and ran a live transactional probe (INSERT a disposable row, BEGIN/SAVEPOINT per shape/ROLLBACK -- zero persisted changes) exercising each shape\'s exact UPDATE payload against the production DB. Confirmed 8 of 9 sites succeed cleanly under the live trigger: scripts/modules/inbox/assist-runner.js:125-132 (ai_triage_classification/confidence/source+updated_at), scripts/modules/inbox/auto-triage.js:175-182 (same 4 columns), scripts/modules/inbox/auto-resolve-recovered.js:116-119 (status/resolution_type/resolution_notes/resolved_at+updated_at), scripts/chairman-decisions.mjs resolveFeedback():195-197 (status/resolved_at/resolution_notes/resolution_type -- NOTE: writes resolution_type, a lifecycle column, not bare type as the original audit worded it; bare type IS a guarded content column and would still be blocked), and lib/quality/assist-engine.js both shapes (_logRoutingEvent:644-654 writes only metadata; decision-dispatch:753-786 writes updated_at/status(\'in_progress\'|\'backlog\'|\'wont_fix\', all valid per feedback_status_check)/snoozed_until/resolution_notes). All columns written are either absent from the trigger\'s WHEN clause or already-valid CHECK-constraint enum values. No code change is needed for these 5 files.',
  },
  {
    id: 'snooze-manager-genuinely-broken-independent-of-the-trigger',
    severity: 'HIGH',
    summary: 'lib/quality/snooze-manager.js is the sole file still broken, for reasons UNRELATED to the append-only trigger. snoozeFeedback():94-124 writes snoozed_at/snoozed_by/snooze_reason -- confirmed via information_schema.columns that none of these 3 columns exist on public.feedback (only snoozed_until exists; the file even carries a schema-lint-disable-line comment naming this exact drift, meaning it was known and silenced rather than fixed). Separately, snoozeFeedback sets status=\'snoozed\' and unsnoozeFeedback():132-149/wakeExpiredSnoozes():169-209 set status=\'open\' -- confirmed via pg_get_constraintdef that feedback_status_check only allows {new,triaged,in_progress,resolved,wont_fix,duplicate,invalid,backlog,shipped}; neither \'snoozed\' nor \'open\' is a valid value. Both failure modes fire regardless of trigger state -- a column-does-not-exist error and a CHECK-constraint violation are Postgres-level rejections that occur whether or not the trigger even exists.',
  },
  {
    id: 'snooze-manager-is-a-live-broken-entry-point-not-dead-code',
    severity: 'HIGH',
    summary: 'Initial repo-wide search (scripts/, lib/, api/, server/, src/, pages/) found no by-name caller of snoozeFeedback/unsnoozeFeedback/wakeExpiredSnoozes/getSnoozedItems and scripts/chairman-decisions.mjs imports only the unrelated parseDuration from the same file, suggesting dead code. validation-agent (Task-tool, independently corroborating) found the real caller this search missed: .claude/skills/inbox.md\'s snooze/unsnooze/snoozed subcommands (lines ~341-399) invoke all of snoozeFeedback, unsnoozeFeedback, and getSnoozedItems directly via inline `node -e` snippets requiring lib/quality/snooze-manager.js. docs/reference/research/quality-lifecycle-100-percent-completion-plan.md:79 records this as deliberately "wired to /inbox skill". This is a live, user-facing, currently-broken command surface, not dead code -- of 38,184 feedback rows, status=\'snoozed\' -> 0 and snoozed_until IS NOT NULL -> 1 (from chairman-decisions.mjs\'s unrelated INSERT-based recordDeferral, not from this file), confirming the /inbox snooze command has never successfully completed.',
  },
  {
    id: 'four-broken-functions-not-three-two-fail-silently',
    severity: 'MEDIUM',
    summary: 'validation-agent traced wakeExpiredSnoozes() precisely: its SELECT filters .eq(\'status\',\'snoozed\') (a value that has never actually been written, per finding above), so it matches zero rows and silently no-ops (returns {woken:0}) rather than throwing -- masking the underlying breakage rather than surfacing it. getSnoozedItems():218-251 has the same status=\'snoozed\' filter plus an .eq(\'snoozed_by\', options.userId) reference to a nonexistent column when userId is passed; without that option it also silently returns an empty array. This is 4 broken functions (snoozeFeedback, unsnoozeFeedback, wakeExpiredSnoozes, getSnoozedItems), 2 of which (wakeExpiredSnoozes, getSnoozedItems) fail silently rather than loudly, which is almost certainly why this drift survived undetected.',
  },
  {
    id: 'design-decision-status-backlog-must-be-distinguished-from-assist-engine-decision-dispatch',
    severity: 'HIGH',
    summary: 'lib/quality/assist-engine.js\'s decision-dispatch (finding #2) ALSO writes status=\'backlog\'+snoozed_until for the this_week/next_week decisions -- an independently-verified, already-working, unrelated use of the exact same column shape. Any fix that represents "/inbox snoozed" state as bare status=\'backlog\'+snoozed_until (the closest valid enum semantic to "deferred") would collide with assist-engine\'s rows: wakeExpiredSnoozes()/getSnoozedItems() would incorrectly bulk-match and wake assist-engine-scheduled items too, corrupting /leo assist\'s independent scheduling semantics. The fix must tag snooze-manager-originated rows distinctly (e.g. a `metadata.snooze` marker object) and filter on that marker in addition to status+snoozed_until, so the two independent mechanisms sharing one column pair never cross-contaminate.',
  },
  {
    id: 'sibling-qf-20260912-253-missed-this-exact-defect-class',
    severity: 'INFO',
    summary: 'QF-20260912-253 (completed) already fixed the identical defect class -- feedback.update() call sites writing columns that do not exist on public.feedback -- for triage-engine.js (x2) and ignore-patterns.js (x1), per the 20260912 migration\'s own header comment naming it. lib/quality/snooze-manager.js is a 4th site of that exact class that QF-20260912-253\'s "exhaustive grep" missed, almost certainly because of the schema-lint-disable-line suppression comment at line 99 hiding it from the linter that would otherwise have flagged it.',
  },
  {
    id: 'no-duplicate-or-overlapping-open-sds-or-qfs',
    severity: 'INFO',
    summary: 'Confirmed via strategic_directives_v2 and quick_fixes queries that no other open SD or QF targets snooze-manager.js, "feedback snooze", or the snoozed_at/snoozed_by/snooze_reason column drift. Sibling child G (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C\'s counterpart) already completed (PR #8756) using the identical re-scope-after-allowlist pattern this exploration follows -- direct precedent that a narrowed, migration-aware scope correction is the correct LEAD response here, not a no-op or cancellation.',
  },
];

const warnings = [
  'The originally-submitted premise ("Confirmed LIVE by that audit -- re-verify before fixing") was stale for 8 of 9 sites by the time this LEAD evaluation ran, because the chairman-ruled allowlist migration was applied between the audit and this claim (both 2026-09-12). PLAN should not assume any of the 6 files still need a code-level trigger-interaction fix -- only lib/quality/snooze-manager.js does, and its actual defects (nonexistent columns, invalid status enum values) predate and are independent of the trigger entirely.',
  'The child SD\'s scope text also describes lib/quality/assist-engine.js as "UNCLEAR -- needs a PLAN-phase split decision on whether these two shapes get one fix or two." Direct verification found BOTH shapes already work with zero code changes; the real split decision this exploration surfaced is a different one -- how to keep snooze-manager.js\'s fix from colliding with assist-engine\'s independent, already-working use of status=\'backlog\'+snoozed_until.',
];

const recommendations = [
  'PLAN should scope EXEC to exactly 1 file: lib/quality/snooze-manager.js. No migration/schema change is required -- represent "snoozed" using EXISTING columns only (status=\'backlog\', a valid enum value; snoozed_until, an existing column) plus a metadata.snooze marker object ({active, pre_snooze_status, snoozed_at, snoozed_by, snooze_reason}) to (a) avoid the CHECK-constraint violation on invalid \'snoozed\'/\'open\' values, (b) avoid referencing the 3 nonexistent columns, and (c) distinguish these rows from assist-engine.js\'s independent status=\'backlog\'+snoozed_until rows so wakeExpiredSnoozes/getSnoozedItems only ever match genuinely /inbox-snoozed items.',
  'unsnoozeFeedback() and wakeExpiredSnoozes() must restore the PRE-snooze status (captured in metadata.snooze.pre_snooze_status at snooze time) rather than hardcoding an invalid \'open\' value -- fall back to \'new\' only for a legacy/manually-snoozed row with no captured marker.',
  'PLAN should require regression tests for the 5 already-fixed files (assert a lifecycle-only UPDATE against each of the 8 confirmed-working shapes actually lands) to close this child\'s completion evidence with proof rather than assumption, mirroring sibling Child G\'s approach.',
  'PLAN should document why a dedicated table was NOT used for snooze state despite the original audit\'s NEEDS_DEDICATED_TABLE classification: the metadata-marker approach fixes the live defect with zero migration risk and zero new schema surface, and a dedicated table is unwarranted scope for a feature whose live usage (0 successful writes ever, per the row-count check) does not currently justify the added architecture.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C re-verified all 9 named call sites across 6 files directly against current main and via a live transactional probe (BEGIN+SAVEPOINT+ROLLBACK, zero persisted writes) against the production DB, rather than trusting the original audit\'s pre-allowlist-migration classification. 8 of 9 sites (5 files) are already fixed by the 2026-09-12 lifecycle-allowlist migration -- verification tests only, no code change needed. The 9th (lib/quality/snooze-manager.js, actually 4 functions: snoozeFeedback/unsnoozeFeedback/wakeExpiredSnoozes/getSnoozedItems) is genuinely broken for reasons independent of the trigger (3 nonexistent columns, 2 invalid CHECK-constraint enum values) and is a LIVE, user-facing entry point via .claude/skills/inbox.md\'s snooze/unsnooze/snoozed subcommands -- not dead code, as this exploration initially concluded before validation-agent\'s independent corroboration found the real caller. A load-bearing design constraint was identified: the fix must not collide with lib/quality/assist-engine.js\'s independent, already-working use of the identical status=\'backlog\'+snoozed_until column shape for an unrelated scheduling decision. This exploration is the basis for LEAD\'s scope reduction to a single-file fix using only existing schema (no migration).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 93,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql',
        'scripts/modules/inbox/assist-runner.js',
        'scripts/modules/inbox/auto-resolve-recovered.js',
        'scripts/modules/inbox/auto-triage.js',
        'scripts/chairman-decisions.mjs',
        'lib/quality/snooze-manager.js',
        'lib/quality/assist-engine.js',
        'lib/quality/index.js',
        'lib/chairman/decision-disposition.mjs',
        '.claude/skills/inbox.md',
      ],
      probe_method: 'Live transactional probe against SUPABASE_POOLER_URL/SUPABASE_DB_URL: INSERT one disposable feedback row inside BEGIN, SAVEPOINT per shape, exercise each of the 9 named UPDATE payloads, ROLLBACK TO SAVEPOINT on failure / RELEASE on success, final ROLLBACK discards the whole transaction -- zero persisted changes.',
      corroborated_by: 'validation-agent (Task-tool run, LEAD-phase). Verdict CONDITIONAL_PASS, confidence 92, evidence row ab9b70a1-18f0-4191-bc04-26b48859029e. Confirmed all 8/9-already-fixed claims, refuted this exploration\'s initial "dead code" conclusion for snooze-manager.js with a concrete live caller, and identified 2 additional broken functions (wakeExpiredSnoozes, getSnoozedItems) beyond the 3 this exploration named.',
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
