import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-LEO-PHASE-TAGGED-001';

const scope = `IN SCOPE (v2, corrected after VALIDATION at LEAD measured 3 of 4 original premises false against LIVE main -- direct SQL over the pooler, not PostgREST cache):
- FR-1 (RESCOPED): sd_key + LEO phase tagging on context_usage_log rows, via a per-worktree JSON state file, NOT an env var. VALIDATION found the originally-proposed CLAUDE_LEO_PHASE/CLAUDE_LEO_SD_KEY env-var mechanism is INFEASIBLE: CLAUDE_LOOP_NAME (the cited "existing pattern") is written by worker-checkin.cjs into a short-lived Bash-tool child process's env, but read by .claude/context-usage-feed.cjs inside the STATUSLINE HOOK process -- a different, separately-spawned child with its own env snapshot; the write can never reach the read (confirmed: scripts/hooks/context-compact-nudge.js:205-207 documents this exact constraint for CLAUDE_ENV_FILE). CORRECTED MECHANISM: extend sd-start.js / handoff.js to write current sd_key + leo_phase into a per-worktree state file (mirroring the existing, already-functional .leo-status.json read pattern in .claude/statusline.cjs:202-211 -- confirmed the READ side already works via file-in-cwd, only the WRITE side from the current autonomous loop needs building, since .leo-status.json today is empty/unpopulated in a fresh worktree). context-usage-feed.cjs's buildUsageEntry() reads that same file at each statusline tick and includes sd_key/leo_phase in the JSONL entry. sync-context-usage.js's transformEntry() and a new migration add the two columns to context_usage_log.
- FR-4 (gap visibility, follows FR-1): a phase with zero recorded context_usage_log rows must render as an explicit instrumentation-gap indicator in any new rollup view built on FR-1's tagged data, never silent omission.
DEFERRED PENDING CHAIRMAN DECISION (do not build until a human applies the blocking migration -- filing this as a decision request, not silently building around it or silently dropping it):
- FR-2 (populate sd_phase_handoffs.baseline_snapshot.metrics) and FR-3 (join sub-agent cost via v_agent_class_rates) BOTH depend on database/chairman-gated/20260829_phase_snapshot_windows_agent_class_rates.sql, which VALIDATION confirmed via live SQL has NEVER BEEN APPLIED to the database (0 rows in information_schema.columns for baseline_snapshot/window_registered_at; the phase_snapshot_window_freeze trigger absent from pg_trigger). That migration is deliberately outside all 3 auto-applied paths per its own directory's README and requires a human to apply it. Even once applied, VALIDATION found the freeze trigger compares the ENTIRE baseline_snapshot jsonb column with no sub-key granularity -- "populate metrics post-hoc" as originally scoped is unbuildable without ALSO amending the trigger to allowlist the metrics sub-key specifically, which is itself a decision (relaxing an anti-gaming freeze) requiring chairman sign-off, not a worker's to make unilaterally.
- FR-5 (fail-soft posture) DEMOTED from a standalone FR to an FR-1 acceptance criterion -- it was never an independently shippable deliverable, only a quality attribute of FR-1's implementation.
ALSO DEFERRED (already correctly descoped in v1, unchanged): QF-tier rollups, comms-vs-build session-class split -- no existing analog, genuinely new classification schemes disproportionate to this SD.
INCIDENTAL FINDING (routed via /signal, not silently fixed here): SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C is marked status=completed with a stated success criterion that context_usage_log's loop_name column was "added... populated for at least one real session-level consumer" -- live SQL confirms NO loop_name column exists at all; sync-context-usage.js's PGRST204 strip-loop_name fallback silently masks the absence. A completed-SD-with-unshipped-DDL pattern, same class as this session's earlier journey-walk RCA finding. Signaled (fefaed90), not this SD's scope to fix.`;

const success_criteria = [
  { criterion: 'context_usage_log rows are tagged with LEO phase + SD key at write time via a per-worktree state file, not a cross-process env var (which VALIDATION confirmed cannot work)', measure: 'A worker loop transitioning through 2+ phases for a real SD produces context_usage_log rows correctly tagged, verified by checking the state file is actually written by sd-start.js/handoff.js at each transition and actually read by context-usage-feed.cjs' },
  { criterion: 'A phase with zero recorded tokens is loud, not silent, in any new rollup view', measure: 'A fixture SD/phase with deliberately zero context_usage_log rows renders an explicit instrumentation-gap indicator, not silent omission' },
  { criterion: 'The new write/sync logic is fail-soft with zero dispatch/cadence side effects (demoted from FR-5 to an acceptance criterion of FR-1)', measure: "A forced failure in the new state-file write or read logic does not affect sd-start.js/handoff.js/context-usage-feed.cjs's own success path or exit code" }
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run sd-start.js for a real SD, then run a handoff (e.g. LEAD-TO-PLAN), then check the per-worktree state file content.',
    expected_outcome: 'The state file exists in the worktree cwd and contains the current sd_key and the LEO phase just transitioned to.'
  },
  {
    step_number: 2,
    instruction: "With the state file populated, trigger a statusline render (or directly invoke context-usage-feed.cjs's entry-building logic) and inspect the resulting JSONL entry.",
    expected_outcome: 'The JSONL entry includes sd_key and leo_phase fields matching the state file content at that moment.'
  },
  {
    step_number: 3,
    instruction: 'Run sync-context-usage.js against a JSONL file containing tagged entries, then query context_usage_log directly.',
    expected_outcome: 'The synced rows have sd_key and leo_phase columns populated with the correct values from the JSONL entries.'
  }
];

async function main() {
  const { data: sd } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  const metadata = { ...sd.metadata, lead_scope_correction_v2: "VALIDATION at LEAD (row 3758baaa) measured 3 of 4 load-bearing premises false against LIVE main via direct SQL: (1) the env-var phase-tagging mechanism cannot work cross-process, (2) sd_phase_handoffs.baseline_snapshot.metrics does not exist in the DB (unapplied chairman-gated migration), (3) the freeze trigger doesn't exist either so 'immutable post-hoc write' was self-contradictory even if the column existed. FR-1 rescoped to a per-worktree JSON state-file mechanism (the .leo-status.json read pattern in statusline.cjs already works, only the write side needs building). FR-2/FR-3 deferred pending a chairman decision on applying the blocking migration -- not built around, not silently dropped. FR-5 demoted from standalone FR to an FR-1 acceptance criterion. Incidental finding (BURN-TELEMETRY-PER-001-C completed with unshipped loop_name DDL) routed via /signal fefaed90." };
  const { error } = await supabase.from('strategic_directives_v2')
    .update({ scope, success_criteria, smoke_test_steps, metadata, scope_reduction_percentage: 55 })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK scope v2 corrected for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
