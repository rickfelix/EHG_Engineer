/**
 * RETRO sub-agent evidence row for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001, PLAN_VERIFICATION.
 *
 * Canonical writers only: storeSubAgentResults (lib/sub-agent-executor/results-storage.js) for the
 * row, resolveSubAgentRepo + applySubAgentRepoVerdict (lib/sub-agents/resolve-repo.js) for repo
 * evidence. metadata is set on `results` BEFORE applySubAgentRepoVerdict, which MERGES into it
 * (repo_path + executed_from_cwd) rather than replacing it. No hand-rolled insert; no top-level
 * repo_path/local_path/score/status/findings keys (those are not columns).
 *
 * Subject: retrospective ba1be19a-5bc8-42d7-acb7-7ddebcd50c58 (retrospectives table).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const RETRO_ID = 'ba1be19a-5bc8-42d7-acb7-7ddebcd50c58';
const NL = String.fromCharCode(10);

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'SD-completion retrospective GENERATED, STORED and VERIFIED AT THE CONSUMER. Row ' + RETRO_ID
    + ' in retrospectives: retro_type=SD_COMPLETION, retrospective_type=NULL, status=PUBLISHED, '
    + 'quality_score=100 with quality_issues=[], learning_category=PROCESS_IMPROVEMENT. Content: 11 '
    + 'what_went_well, 18 what_needs_improvement, 23 key_learnings, 9 action_items, 7 success_patterns, '
    + '14 failure_patterns, 4 protocol_improvements, 23 related_commits. Written through the canonical '
    + 'writer (storeRetrospective). '
    + 'VERIFIED AT THE CONSUMER, NOT AT THE WRITE: getFilteredRetrospective (the predicate '
    + 'RETROSPECTIVE_QUALITY_GATE itself calls) returns MATCHED for this row, so the PLAN-TO-LEAD gate '
    + 'can see it. 17 issue_patterns rows extracted to learning history. '
    + 'HEADLINE RECORDED: this SD committed the defect class it is about NINETEEN times - silent-stop '
    + 'paths and guards nothing could falsify - including a fix whose hazard trigger was THE FIX '
    + 'SUCCEEDING (the reaper handed its own execution source as a deletion target), two guards shipped '
    + 'with no disarm test, an identity guard defeated first by a bare mkdir and then by a ~50-byte .git '
    + 'FILE plant, a hardening that would have CAUSED the outage the SD prevents (git config off -> no '
    + 'credential helper -> no fetch -> stale tree -> refusal), and a content check that re-opened the '
    + 'starvation on gitignored artifacts. All 17 durable rules earned by EXEC are in key_learnings, plus '
    + '6 more. '
    + 'THREE MEASUREMENT CORRECTIONS made while writing it. (1) EIGHT SECURITY FAIL rows persisted for '
    + 'this sd_id (82/90/92/93/95/94/96/96) before the PASS at 95, not nine - measured from '
    + 'sub_agent_execution_results, with no SECURITY rows for this SD under any other phase; the branch '
    + 'carries TEN SECURITY evidence-writer artifacts against NINE persisted verdict rows, so at least one '
    + 'review round left no row, and a round whose verdict never persists is invisible to every gate that '
    + 'reads this table. (2) quality_score=100 is the DB trigger number, not the authored one: the '
    + 'retrospectives quality trigger recomputes from array completeness and overwrites whatever the '
    + 'writer supplies; the authored self-assessment was 92 and both numbers are on the row. (3) A FRESH '
    + 'INSERT was required rather than enhancing the pre-existing HANDOFF retro, which was created ~0.5s '
    + 'BEFORE the LEAD-TO-PLAN acceptance and would therefore have produced a PUBLISHED SD_COMPLETION row '
    + 'the gate cannot see.',
  critical_issues: [],
  warnings: [
    {
      severity: 'MEDIUM',
      issue: 'Two readers of one question in the retro machinery: checkExistingRetrospective (lib/sub-agents/retro/db-operations.js) and getFilteredRetrospective (scripts/modules/handoff/retro-filters.js) disagree about which retrospective counts. On this SD the RETRO sub-agent enhance path would have produced a PUBLISHED SD_COMPLETION row that RETROSPECTIVE_QUALITY_GATE cannot see.',
      recommendation: 'Export ONE predicate and have both callers use it. Recorded as a high-priority action item on the retrospective.',
    },
    {
      severity: 'MEDIUM',
      issue: 'The validateRetrospective exported by scripts/validate-retrospective-schema.js is unusable and nobody noticed, because generate-comprehensive-retrospective.js keeps a private local copy: it maps key_learnings to key_learnings (errors on every valid retro), flags protocol_improvements (a real column) as a wrong field name, and runs constraint discovery on ANON_KEY, returning zero rows and therefore an EMPTY allowlist that rejects generated_by=MANUAL.',
      recommendation: 'Fix or delete the exported validator and make the comprehensive generator import it. Recorded as a high-priority action item on the retrospective.',
    },
    {
      severity: 'LOW',
      issue: 'The 18th what_needs_improvement entry (the validator finding) has no issue_patterns row: auto-extract-patterns-from-retro.js is idempotent on learning_extracted_at, and clearing that stamp to capture one new item would re-process the other 17 and inflate their occurrence_count, which feeds pattern-alert SD creation.',
      recommendation: 'Leave the frequency data honest; the finding is durable on the retrospective row itself.',
    },
  ],
  recommendations: [
    'Record the reviewed module BLOB (git rev-parse HEAD:<path>) on every review evidence row - six verdicts on this SD were carried against a stale HEAD.',
    'Add a disarm test alongside every new guard: one that goes red when the guard body is replaced with return true.',
    'DEFERRED (completion flags, not gaps), all on the retrospective as action items: FR-3 serial git (measured 5-7 min / 26 worktrees; ergonomics, not the starvation window); NI-R2 wall-clock gauge on (now - last_spawn_at), which MUST read state from a consumer other than tick() because tick() returns before readState; TOCTOU-2 (measured 247.6ms against a LOCAL remote - the reviewer RETRACTED its earlier "bounded ms" characterisation); the behavioural wire recipe that would retire the last structural assertion; R5-2 forged .git/worktrees entries, retired in practice by the content check.',
  ],
  metadata: {
    retrospective_id: RETRO_ID,
    retrospective_table_row: {
      retro_type: 'SD_COMPLETION',
      retrospective_type: null,
      status: 'PUBLISHED',
      quality_score_stored: 100,
      quality_score_authored: 92,
      quality_issues: [],
      learning_category: 'PROCESS_IMPROVEMENT',
      counts: {
        what_went_well: 11,
        what_needs_improvement: 18,
        key_learnings: 23,
        action_items: 9,
        success_patterns: 7,
        failure_patterns: 14,
        protocol_improvements: 4,
        related_commits: 23,
      },
    },
    consumer_verification: 'getFilteredRetrospective(sd.id, sd.created_at, supabase, sd.sd_key) returns MATCHED id=' + RETRO_ID + ' (cutoff 2026-08-08T08:32:08.883Z) - the gate predicate itself, not a reimplementation of it',
    patterns_extracted: 17,
    security_verdicts_measured: { fail_rows: 8, confidences: [82, 90, 92, 93, 95, 94, 96, 96], final: 'PASS', final_confidence: 95, open_blocking: [] },
    security_review_artifacts_on_branch: 10,
    evidence_gap_note: 'EXEC session reported nine refusal rounds (INHERITED); 8 FAIL rows persisted (MEASURED). Review rounds and verdict rows are not 1:1.',
    self_committed_defect_class_instances: 19,
    retro_writer_self_defect: 'The retro writer itself committed the SD defect class on its first run: a blunt sed -i "/validate-retrospective-schema.js/d" deleted the two CONTENT lines mentioning that filename, dropping one improvement entry and the action: key of one action item. push() with no argument pushes nothing, and the action item stored as (no text) - which promote-retro-action-items.mjs would have minted as a QF. The count-based preflight and the gate predicate both read GREEN; only an element-by-element readback caught it. Repaired via amend2, and the writer now carries a content-integrity preflight, mutation-proven two-sided.',
    artifacts: [
      'scripts/one-off/insert-retro-scheduled-worktree-reaper-001.mjs',
      'scripts/one-off/amend-retro-scheduled-worktree-reaper-001.mjs',
      'scripts/one-off/amend2-retro-scheduled-worktree-reaper-001.mjs',
    ],
  },
};

results.detailed_analysis = [
  'RETRO VERDICT: ' + results.verdict + ' | CONFIDENCE: ' + results.confidence + '/100 | PHASE: PLAN_VERIFICATION',
  'RETROSPECTIVE ROW: ' + RETRO_ID + ' (retrospectives table, keyed on sd_id ' + SD_ID + ')',
  '',
  results.summary,
  '',
  'WARNINGS',
  '='.repeat(60),
  results.warnings.map((w, i) => (i + 1) + '. [' + w.severity + '] ' + w.issue + NL + '   -> ' + w.recommendation).join(NL + NL),
  '',
  'RECOMMENDATIONS',
  '='.repeat(60),
  results.recommendations.map((r, i) => (i + 1) + '. ' + r).join(NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'RETRO',
  targetApplication: 'EHG_Engineer',
  fallback: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'RETRO',
  SD_ID,
  { name: 'Continuous Improvement Coach' },
  results,
  { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
);

console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || 'UNKNOWN'));
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence);
console.log('REPO repo_path=' + results.metadata.repo_path + ' resolved=' + results.metadata.repo_resolved + ' source=' + results.metadata.registry_source);
console.log('REPO executed_from_cwd=' + results.metadata.executed_from_cwd);
