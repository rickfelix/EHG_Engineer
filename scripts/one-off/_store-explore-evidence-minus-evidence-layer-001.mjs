// SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 -- EXPLORE evidence writer (LEAD phase).
// Persists the LEAD-phase premise-verification pass (live DB + codebase claims check against the
// SD's own pre-fix evidence text) to sub_agent_execution_results, required by GATE_SUBAGENT_EVIDENCE.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'Verified 4/5 of the SD\'s stated pre-fix evidence claims TRUE against the live DB (eva_stage_gate_results, ' +
    '1,796 rows: entry=898/exit=898/kill=0) and current codebase, one PARTIALLY TRUE. resolved_outcome column ' +
    'exists (migration 20260625_eva_stage_gate_results_outcome.sql) with 0/1,796 rows populated -- its only writer, ' +
    'recordGateOutcome() (lib/eva/artifact-persistence-service.js:427-450), has zero production callers. Zero ' +
    '"kill" gate_type rows confirmed live -- GATE_TYPE_MAP (artifact-persistence-service.js:359-370) maps every ' +
    'real call site to entry/exit, so the code-level kill-gate concept never reaches the DB as gate_type=\'kill\'. ' +
    'The current write path is a true UPSERT on unique index (venture_id,stage_number,gate_type) ' +
    '(migration 20260319_add_gate_results_unique_index.sql), confirmed by 0/1,796 rows showing any ' +
    'created_at/updated_at/evaluated_at drift. eva-orchestrator.js:128 mints a correlationId threaded into ' +
    'recordGateResult metadata at :914, but artifact-persistence-service.js:381 discards metadata whenever ' +
    '`reasoning` is truthy -- confirmed live. THE SD\'S OWN CITED NUMBER IS WRONG: it says "34/1,796" rows drop ' +
    'the correlationId; live measurement (strict JSON-parse of all 1,796 notes fields) is 483/1,796 (464 exit + ' +
    '19 entry). lib/eva/launch-workflow/index.js\'s 3 queries (lines 44/96/136) select nonexistent reasoning/score ' +
    'columns (real columns: notes/overall_score), reproduce a live 42703 error, and silently swallow it (no ' +
    '`error` binding on the destructure) -- confirmed by direct query reproduction. No duplicate/overlapping SD ' +
    'or PRD found for this scope; 4 sibling T-minus SDs created the same day consume (not duplicate) this SD\'s ' +
    'evidence layer.',
  recommendations: [
    'Correct all citations of the correlationId-drop defect to 483/1,796, not 34/1,796, before this figure is used as a PRD proof-point.',
    'Do NOT backfill run_id from correlationId -- it is minted per-(venture,stage) invocation (879 distinct IDs across 1,313 rows, ~1.5 rows/ID), not a run identity; using it would permanently encode a wrong semantic into the new evidence layer.',
    'Resolve FR-6 (existing-table-vs-side-table decision) as an explicit LEAD decision BEFORE any FR-1/FR-2 DDL is authored -- FR-1/FR-2 as chartered already assume the existing table while FR-6 treats that choice as open, a direct contradiction. See risk-agent (row c73332a0) and validation-agent (row 8bb1f901) for the full blast-radius analysis (930 legacy rows collapse into 46 groups; ~884 unique-violation risk on naive backfill; the proposed key omits venture_id).',
    'Split FR-5 (launch-workflow dead-reader fix) into its own immediately-shippable PR with zero schema/DDL dependency -- it is a live defect today (some ventures report false-positive "launch ready"), independently correctable without waiting on the chairman-gated DDL ceremony for FR-1/FR-2/FR-3.',
    'Resolve the resolved_outcome semantic collision explicitly in the PRD: the column already carries a documented different enum (survived|killed|pivoted|exited|false_kill|false_pass, venture-outcome calibration) from FR-3\'s proposed 7-term evaluation-disposition enum -- 2 sibling SDs (P3, P5) already hard-code FR-3\'s new terms, so this cannot be deferred.',
  ],
  metadata: {
    exploration_mode: 'live_db_and_codebase_premise_verification',
    issues_detail: [
      {
        severity: 'high',
        title: 'SD pre-fix evidence contains a factually wrong measured number',
        detail: 'SD text claims "34/1,796" rows drop the correlationId at persistence (eva-orchestrator.js:128 -> artifact-persistence-service.js:381). Live measurement: 483/1,796 (464 exit + 19 entry). 34 does not match distinct correlationIds (879) or distinct venture_ids (47) either -- appears to be a stale/miscounted figure that must not propagate into the PRD.',
      },
      {
        severity: 'high',
        title: 'FR-1 unique-key legacy-row backfill is not naively executable',
        detail: '930 legacy venture_id-NULL rows collapse into only 46 distinct (stage_number,gate_type) groups (max 37 rows/group) -- a sentinel legacy run_id under the proposed (run_id,stage_number,gate_type,attempt_number) key would produce ~884 unique-violation errors on CREATE UNIQUE INDEX. FR-7\'s quarantine VIEW does not mitigate this: the constraint applies to the base table, not a filtered view.',
      },
      {
        severity: 'medium',
        title: 'resolved_outcome column already exists with a different documented enum',
        detail: 'Migration 20260625_eva_stage_gate_results_outcome.sql (from SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 FR-5) documents survived|killed|pivoted|exited|false_kill|false_pass as the intended enum, orthogonal to FR-3\'s proposed machine_pass|machine_fail|override|chairman_adjudicated|skip|cannot_evaluate|not_exercised. 0/1,796 rows populated, zero readers depend on the old enum (LOW runtime risk), but it is a documented forward commitment, not a free column.',
      },
      {
        severity: 'low',
        title: 'FR-3 writer name collides with an existing, live, production-wired export',
        detail: 'A different, production-wired recordGateOutcome already exists at lib/eva/experiments/gate-outcome-bridge.js:66. The dormant, zero-caller recordGateOutcome at artifact-persistence-service.js:427-450 is a DIFFERENT function with the same name.',
      },
    ],
    live_row_count: 1796,
    gate_type_breakdown: { entry: 898, exit: 898, kill: 0 },
    resolved_outcome_populated_count: 0,
    correlationid_dropped_count_measured: 483,
    correlationid_dropped_count_sd_claimed: 34,
    legacy_null_venture_row_count: 930,
    legacy_null_venture_distinct_groups: 46,
    legacy_null_venture_max_group_size: 37,
    duplicate_work_check: 'CLEAN -- no other active SD/PRD targets run_id/attempt_number/resolved_outcome-7-term-enum/launch-workflow dead-reader; 4 sibling T-minus SDs created same day consume this SD, not duplicate it',
    related_sub_agent_rows: {
      risk_agent: 'c73332a0-ea74-48bf-848f-2dc7c6e1dd60',
      validation_agent: '8bb1f901-12c2-4f40-934c-79dcbcfa67e3',
    },
  },
  execution_time_ms: 480000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'EXPLORE',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('EXPLORE', SD_ID, { name: 'Explore (Claude Code built-in)' }, results, { phase: PHASE, source: 'manual' });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
