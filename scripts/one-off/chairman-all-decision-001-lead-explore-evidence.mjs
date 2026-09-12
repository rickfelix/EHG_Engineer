#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed: locating the live view definition, tracing every
 * write site of feedback.snoozed_until across the repo, verifying which of them can actually reach
 * a critical/high row, and confirming no duplicate/prior-art fix exists for this branch.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001';

const findings = [
  {
    id: 'flag-review-branch-never-consults-snoozed-until',
    severity: 'HIGH',
    summary: 'public.chairman_all_decision_signals\'s flag_review branch (feeds the chairman decision queue for critical/high feedback rows) filters on severity, resolved_at and status only; it never references snoozed_until at all. Live pg_get_viewdef confirms all 7 branches; only flag_review is affected by this fix.',
  },
  {
    id: 'two-real-writers-of-snoozed-until-found-repo-wide',
    severity: 'HIGH',
    summary: 'git grep for "snoozed_until" across lib/, scripts/, .claude/skills/ located exactly two live writers: (1) lib/quality/assist-engine.js:768 (recordEnhancementDecision, this_week/next_week branch of /leo assist Phase 2) -- sets status=\'backlog\' + snoozed_until with NO severity filter, so it can write onto a critical/high row; (2) scripts/chairman-decisions.mjs:247 (recordDeferral, chairman `defer --review-in`) -- inserts a new feedback row with severity HARDCODED to \'low\', so it can never produce a row this branch would surface anyway.',
  },
  {
    id: 'snooze-manager-write-paths-dead-by-construction',
    severity: 'HIGH',
    summary: 'lib/quality/snooze-manager.js\'s snoozeFeedback (status=\'snoozed\'), unsnoozeFeedback (status=\'open\') and wakeExpiredSnoozes (status=\'open\') all write status values rejected by the live public.feedback_status_check CHECK constraint (permits only new/triaged/in_progress/resolved/wont_fix/duplicate/invalid/backlog/shipped -- verified live against pg_constraint). The sole call site of the first two is .claude/skills/inbox.md\'s /inbox snooze and /inbox unsnooze commands; wakeExpiredSnoozes has zero callers anywhere, skill or code -- confirmed via repo-wide grep (only a barrel re-export at lib/quality/index.js:65, which is not a caller).',
  },
  {
    id: 'live-population-measured',
    severity: 'INFO',
    summary: 'Live query 2026-09-12: whole feedback table (38218 rows) has exactly 1 non-null snoozed_until row, already in the past, severity=\'low\' (matches writer (2)\'s recordDeferral shape, not writer (1)). The branch\'s ELIGIBLE population (critical/high, unresolved, non-terminal status, independent of snoozed_until) is ~404-408 rows and fluctuates normally day to day. So today\'s fix-attributable delta is 0 rows -- the gap is prospective (protects future /leo assist deferrals of critical/high rows), not a correction of a currently-stuck queue.',
  },
  {
    id: 'view-has-drifted-once-outside-committed-history',
    severity: 'MEDIUM',
    summary: 'The live flag_review WHERE clause\'s status-exclusion list (5 values: resolved, wont_fix, in_progress, duplicate, invalid) is wider than the last committed migration for this view (database/chairman-gated/20260817_chairman_all_decision_signals_merged.sql, which shows only resolved, wont_fix). The view was re-applied live at least once since 2026-08-17 by a ceremony whose SQL was never committed to this directory. This SD\'s migration captures CURRENT LIVE STATE as its base (same "read live, don\'t retype by hand" discipline as the 2026-08-17 merge), not the stale committed text, and does not attempt to reconstruct the missing history (out of scope).',
  },
  {
    id: 'no-duplicate-or-prior-art-found',
    severity: 'INFO',
    summary: 'git log --all --oneline --grep for chairman_all_decision_signals + snoozed_until returns only this SD\'s own commits and the 2026-08-17 merge migration and its two superseded predecessors (2026-08-03). No other open SD or QF touches this view\'s flag_review branch or snoozed_until. Not a duplicate of SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C (that SD fixed 6 named application call sites\' feedback.update() calls against the lifecycle-allowlist trigger; it explicitly excluded this shared-view finding as out-of-scope F3, which is this SD\'s origin).',
  },
];

const warnings = [
  'The originally-filed F3 finding (and this SD\'s first-drafted migration header) named /inbox snooze (lib/quality/snooze-manager.js) as THE writer of snoozed_until. That attribution does not survive a grep: snooze-manager.js\'s writes are rejected by feedback_status_check and cannot reach the database. The migration header and this SD\'s description/scope have both been corrected (two passes) to name the two real writers found above. The fix predicate itself (snoozed_until IS NULL OR snoozed_until <= now()) is unaffected by which writer is real -- only the causal narrative was wrong.',
  'lib/quality/snooze-manager.js\'s dead write paths are a separate, real, chairman-facing defect (the /inbox snooze/unsnooze/snoozed commands appear functional but can never work) -- deliberately kept OUT of this SD\'s scope to preserve its one-change/byte-identical-provenance discipline. Recommend filing a dedicated follow-up (Tier 3 given module + skill-doc size) rather than folding it in here.',
];

const recommendations = [
  'PLAN should treat the migration file itself as the PRD\'s primary technical artifact (it already documents WHAT\'S BROKEN, PROVENANCE, THE ONE CHANGE and VERIFY in full) rather than re-deriving a separate PRD narrative from scratch.',
  'PLAN/EXEC should keep the DOWN file and migration-shape test in lockstep with any further header edits -- both were re-verified to still pass after each of the two correction passes made during LEAD.',
  'File a separate follow-up SD/QF for the snooze-manager.js dead-code cluster once this SD ships; do not let it block or expand this SD\'s scope.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001 confirmed the flag_review branch of chairman_all_decision_signals never consults snoozed_until, traced every live writer of that column repo-wide (assist-engine.js:768 and chairman-decisions.mjs:247 are real; snooze-manager.js\'s three functions are dead against feedback_status_check), measured the live-affected population (0 rows today, ~404-408 eligible), found the view has drifted once outside committed history (base captured live rather than from the stale 2026-08-17 commit), and confirmed no duplicate or prior-art fix exists. This discovery directly drove the two-pass correction of the migration header\'s original (incorrect) causal narrative.';

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
    confidence_score: 94,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion.sql',
        'database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion_DOWN.sql',
        'database/chairman-gated/20260817_chairman_all_decision_signals_merged.sql',
        'lib/quality/assist-engine.js',
        'lib/quality/snooze-manager.js',
        'scripts/chairman-decisions.mjs',
        'lib/chairman/decision-queue.mjs',
        '.claude/skills/inbox.md',
        'tests/unit/migrations/chairman-all-decision-signals-snoozed-exclusion-migration-shape.test.js',
      ],
      searches_run: [
        'git grep -n "snoozed_until" across lib/, scripts/, .claude/skills/',
        'live SELECT against public.feedback for snoozed_until distribution and flag_review-eligible population',
        'live pg_constraint query for feedback_status_check permitted values',
        'git log --all --oneline --grep for chairman_all_decision_signals and snoozed_until',
      ],
      dedup_candidates_checked: ['SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C (origin of this SD as out-of-scope finding F3)'],
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
