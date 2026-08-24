// SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 -- EXPLORE evidence writer (LEAD phase).
// Read-only discovery mapping every sourcing_engine_activation_state read/write site, the
// "SOURCING ENGINE FIRST-CHECK" doctrine text, the roadmap-motion.cjs dangling citation, and the
// adam-startup-check.mjs SOURCING SSOT STATE probe's data sources.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Confirms the LEAD-phase VALIDATION finding (evidence 1e5eb721) independently, at the file:line ' +
    'level. sourcing_engine_activation_state (database/migrations/20260623_sourcing_engine_activation_state.sql) ' +
    'was seeded enabled=true for all 3 arms at migration time and has exactly one write helper ' +
    '(reconcileSourcingArmState, scripts/lib/sourcing-engine-awareness.mjs:80-95) that has ZERO production ' +
    'callers anywhere in the repo -- only referenced from its own unit test. So post-seed, the table can only ' +
    'change via a direct/manual DB write; nothing in the codebase currently cross-checks it against the ' +
    'actual enabled/disabled state of the underlying GitHub Actions workflows (confirmed by a repo-wide grep ' +
    'for octokit/gh-actions-API patterns near sourcing-engine code -- zero matches). The migration\'s own ' +
    'preamble (line 9) explains this was a DELIBERATE design choice (workflow-YAML presence != enabled; ' +
    'gh-run-state is rate-limited), not an oversight -- so the fix is a NEW reconciliation capability, not a ' +
    'bug in existing logic. The literal "SOURCING ENGINE FIRST-CHECK" phrase appears in exactly 2 places: ' +
    '.claude/commands/coordinator.md:670-706 (doctrine prose) and scripts/coordinator-capacity-forecast.mjs:454 ' +
    '(the runtime template that emits it, fed by formatSourcingAwareness() in sourcing-engine-awareness.mjs). ' +
    'The literal number "504" does NOT appear anywhere in the repo -- unpromoted depth is always computed ' +
    'live from roadmap_wave_items/v_plan_of_record_remainder counts, never a stored constant, so the coordinator\'s ' +
    'provenance figure was a one-off manual measurement against the raw table, not a doctrine-embedded value. ' +
    'adam-startup-check.mjs\'s own SOURCING SSOT STATE probe (lines 436-700) already reads unpromoted depth from ' +
    'v_plan_of_record_remainder (lines 621-623, per an FR-cited count-truncation fix noted in its own comments) ' +
    '-- narrowing this SD\'s scope further: the view-based-count fix may already exist in the probe surface the ' +
    'coordinator actually reads day-to-day, and the gap is specifically in the coordinator\'s own ad-hoc ' +
    'provenance-measurement methodology, not in shipped code. roadmap-motion.cjs:48,67 both cite ' +
    'SD-FDBK-INFRA-ROADMAP-COMMITMENT-CLOCK-001 as the named unblocking child for its permanently-UNMEASURABLE ' +
    'verdict; that SD does not exist in strategic_directives_v2 (confirmed exact-key and ilike search). A fully ' +
    'implemented but uncalled discriminator (classifyMotion(), lines 78-99) already exists in the same file, ' +
    'ready for that child SD to wire in.',
  recommendations: [
    'FR scope: add a reconciliation check (new code, not a bugfix) that compares sourcing_engine_activation_state ' +
      'rows against actual GitHub Actions workflow enabled/disabled state and surfaces any mismatch loudly -- ' +
      'reconcileSourcingArmState() already exists as the write primitive but has never been wired to a caller; ' +
      'a new detector/reporter is needed upstream of it, not a fix to it.',
    'Before writing FR-3 (queue-depth accuracy), confirm precisely whether adam-startup-check.mjs\'s existing ' +
      'v_plan_of_record_remainder-based count is already what the coordinator should have used for the 504 ' +
      'figure -- if so, this FR is a coordinator-methodology/documentation fix (point future ad-hoc measurements ' +
      'at the existing probe output), not a code change to the probe itself.',
    'FR-4 (dangling citation): either file a real draft SD/QF for SD-FDBK-INFRA-ROADMAP-COMMITMENT-CLOCK-001 and ' +
      'update the citation to point at it, or correct/remove the 2 citations at roadmap-motion.cjs:48,67. Do not ' +
      'wire classifyMotion() (lines 78-99) into classify() as part of this fix -- that requires a real per-item ' +
      'commitment clock this SD does not build (matches the SD\'s own risk-mitigation boundary).',
    'GitHub Actions API calls are rate-limited (migration comment, line 9) -- any reconciliation check design ' +
      'should account for this (e.g. cache/interval, not a per-invocation live call) rather than repeating the ' +
      'mistake the migration was written to avoid on the read side.',
  ],
  metadata: {
    exploration_mode: 'read_only_discovery',
    activation_state_sites: {
      schema: 'database/migrations/20260623_sourcing_engine_activation_state.sql:13-18',
      seed_write: 'database/migrations/20260623_sourcing_engine_activation_state.sql:25-29 (all 3 arms enabled=true, ON CONFLICT DO NOTHING)',
      reads: [
        'scripts/lib/sourcing-engine-awareness.mjs:56-68 readSourcingEngineFlagsFromDb() -- fail-open, swallows errors, falls back to env-var reader',
        'scripts/coordinator-capacity-forecast.mjs:162 (calls readSourcingEngineFlagsFromDb)',
        'scripts/sourcing-engine/refill-cron.mjs:167-171 (gates hourly --apply promote)',
        'scripts/adam-startup-check.mjs:677-687 (direct query, deliberately bypasses the fail-open helper, per comment 666-674)',
      ],
      write_helper_unused_in_production: 'scripts/lib/sourcing-engine-awareness.mjs:80-95 reconcileSourcingArmState() -- only referenced from tests/unit/sourcing-engine-awareness.test.js:11,166,171,175; zero production callers',
      docs: [
        'docs/sourcing-engine-activation-runbook.md:54-59',
        'docs/reference/schema/engineer/tables/sourcing_engine_activation_state.md',
        'CLAUDE_ADAM.md:241-259 (section 5f)',
      ],
    },
    first_check_doctrine_sites: {
      prose: '.claude/commands/coordinator.md:670-706',
      runtime_template: 'scripts/coordinator-capacity-forecast.mjs:447-462, literal string emitted at line 454',
      queue_depth_source_fn: 'formatSourcingAwareness() in scripts/lib/sourcing-engine-awareness.mjs:102+',
      literal_504_found_in_repo: false,
    },
    roadmap_motion_dangling_citation: {
      file: 'lib/governance/drive-state/axes/roadmap-motion.cjs',
      citation_lines: [48, 67],
      blocked_reason_const: 'no_per_item_commitment_clock (line 57)',
      classify_fn_lines: '109-119, unconditionally returns STATE.UNMEASURABLE',
      unused_ready_discriminator: 'classifyMotion() lines 78-99, not called by classify()',
      named_unblocking_sd_exists_in_db: false,
    },
    adam_startup_check_probe: {
      line_range: '436-700',
      section_header: 'SD-LEO-INFRA-ADAM-SOURCE-FROM-SSOT-CONTRACT-001 (FR-2)',
      data_sources: [
        'env: SOURCING_GAUGE_GAP_MINER_V1, SOURCING_DEFERRED_WATCHER_V1 (via readSourcingFlags, line 694)',
        'DB view v_plan_of_record_remainder (lines 621-623, paginated, already view-based per an FR-cited count-truncation fix)',
        'DB table sd_backlog_map (lines 639-640, disposition coverage head-counts)',
        'audit_log via lib/governance/demand-gate-emit.js readLastDemandDecision/readLastProductionOutcome (called at 655,659)',
        'DB table sourcing_engine_activation_state (lines 677-687, direct query)',
      ],
      github_actions_api_calls_found: 0,
    },
    ssot_inversion_reconciliation: {
      exists_today: false,
      evidence: 'zero matches for octokit/gh-actions-API patterns near sourcing-engine code; migration comment line 9 confirms this was deliberate (workflow-YAML presence != enabled; gh-run-state rate-limited), not an oversight',
    },
  },
  execution_time_ms: 461000,
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
