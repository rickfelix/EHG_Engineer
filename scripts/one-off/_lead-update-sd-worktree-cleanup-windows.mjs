// LEAD-phase scope-lock update for SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001
// One-off: writes integrated sub-agent findings + smoke_test_steps + scope reduction
// Sub-agent evidence rows: validation 7e8f4c86, testing cdd621b9, risk c3bdad3a
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const update = {
  scope:
    'EHG_Engineer backend infrastructure: extend existing retry-with-backoff coverage in lib/worktree-manager.js to 4 ad-hoc safeRecursiveRm sites that bypass rollbackWorktreeFilesystemSync; add CJS-hook parity (scripts/hooks/concurrent-session-worktree.cjs:472); add nullable cleanup_pending TIMESTAMPTZ column to claude_sessions with reader (orphan-worktree-reaper) + writer (safeRecursiveRm persistent-failure path) wired in same PR series; ship migration in standalone PR ahead of code PR; static guard test pins writer/consumer pairing to prevent 16th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001. EXPLICITLY OUT-OF-SCOPE: cross-host orphan reconciliation (shipped via SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 2026-05-09), junction-safe rm (PR #3630), root-tree race (feedback a389eedd acknowledged-no-fix), parent FR-4 successor SD-LEO-INFRA-WORKTREE-COMPLETENESS-CHECK-001 (never filed; flagged separately).',
  success_criteria: [
    {
      criterion:
        'Retry-with-backoff covers 4 ad-hoc safeRecursiveRm sites (lib/worktree-manager.js lines 1198/1267/1291/1660) AND CJS hook (scripts/hooks/concurrent-session-worktree.cjs:472)',
      measure:
        'AST/regex test pins all 5 sites; manual EPERM-then-success simulation passes for each',
    },
    {
      criterion:
        'cleanup_pending TIMESTAMPTZ column exists on claude_sessions, nullable, default NULL',
      measure:
        'information_schema.columns query returns nullable=YES, data_type=timestamp with time zone, default=NULL',
    },
    {
      criterion:
        'orphan-worktree-reaper consumes cleanup_pending IS NOT NULL rows; clears column atomically on cleanup success',
      measure:
        'Vitest: backfill 1 row + run reaper + assert column NULLed; race test: 2 concurrent reapers do not both claim same row',
    },
    {
      criterion:
        'Static guard test pins canonical writer (safeRecursiveRm persistent-failure path) AND canonical reader (worktree-reaper.mjs sweep) for cleanup_pending column',
      measure:
        'Test fails when adding new write/read site without registering it in pin list',
    },
    {
      criterion:
        'Migration ships in standalone PR ahead of code PR (deploy-order safety)',
      measure:
        '2 separate PRs in sequence; module-load assertion in reaper fails loudly if column missing',
    },
    {
      criterion: 'Orphan worktree count drops after deploy',
      measure:
        '.worktrees/ orphan count in 24h post-merge < pre-merge baseline (currently 88)',
    },
  ],
  success_metrics: [
    {
      metric: 'Orphan worktree count',
      target: '<10 in .worktrees/ within 24h post-merge',
      actual: 'TBD (baseline=88)',
    },
    {
      metric: 'Test coverage',
      target:
        '8 new vitest cases covering: 5 retry-site simulations + reaper race + backfill stat-check + static guard',
      actual: 'TBD',
    },
    {
      metric: 'Zero regressions',
      target:
        '0 existing tests broken across lib/eva + lib/worktree + scripts/orphan*',
      actual: 'TBD',
    },
    {
      metric: 'Deploy ordering',
      target: 'Migration PR merges + verifies before code PR',
      actual: 'TBD',
    },
  ],
  strategic_objectives: [
    'Close 16th-candidate witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 by shipping cleanup_pending writer + reader in same PR series',
    'Reduce orphan worktree accumulation on Windows from observed-88 to single-digit baseline via persistent-retry layer',
    'Self-healing across Claude Code restarts and Windows file-handle-release windows (cleanup_pending makes failed-cleanup state observable + retryable)',
    'Maintain backward compatibility: column nullable + default NULL; reader treats NULL as not-pending',
  ],
  key_changes: [
    {
      change:
        'FR-1: Extend rollbackWorktreeFilesystemSync retry-with-backoff coverage to 4 ad-hoc safeRecursiveRm sites in lib/worktree-manager.js (lines 1198/1267/1291/1660)',
      impact:
        'Closes existing helper coverage gap; per-call 3-attempt retry with shared 15s budget per validation findings',
    },
    {
      change:
        'FR-1c: CJS hook scripts/hooks/concurrent-session-worktree.cjs:472 retry parity (extract retry into shared shape OR duplicate inline with parity test)',
      impact: 'ESM helper does not reach CJS sites; testing-agent flagged this blind spot',
    },
    {
      change:
        'FR-1d: Explicit-include/exclude list for sibling cleanup sites: cancel-sd worktree rollback, orphan-qf-reaper, /ship Step 7 cleanup',
      impact: 'PRD documents which sibling sites are explicitly NOT in scope (vs missed)',
    },
    {
      change:
        'FR-2: Add nullable cleanup_pending TIMESTAMPTZ column on claude_sessions (standalone migration PR)',
      impact:
        'Metadata-only ALTER on PG11+; no backfill needed (NULL default per risk-agent R1)',
    },
    {
      change:
        'FR-2c: Reaper claim-then-clean concurrency primitive (CAS pattern: UPDATE WHERE cleanup_pending = expected_ts)',
      impact: 'Prevents 2 concurrent reapers from racing on same row',
    },
    {
      change:
        'FR-2d: Backfill stat-check (fs.existsSync filter) for 8 currently-released sessions with worktree_path NOT NULL',
      impact: 'Prevents reaper spinning on phantom paths',
    },
    {
      change:
        'FR-2e: Static guard test pinning canonical writer (safeRecursiveRm persistent-failure UPDATE) AND canonical reader (worktree-reaper.mjs sweep) for cleanup_pending column',
      impact: 'Closes writer/consumer asymmetry pattern in same PR',
    },
    {
      change:
        'FR-3: orphan-worktree-reaper consumer of cleanup_pending column (sweep, retry cleanup, NULL column on success)',
      impact:
        'Without this, FR-2 ships a writer with no consumer (16th witness of writer/consumer asymmetry)',
    },
  ],
  key_principles: [
    'Writer + consumer ship in same PR series (no asymmetry)',
    'Migration ships standalone before code (deploy-order safety per risk-agent R4)',
    'Retry at outer envelope, not per-inode (risk-agent R2)',
    'NULL default + IF NOT EXISTS = metadata-only on hot table (risk-agent R1)',
    'Static guard tests prevent next missed call site',
    'Backward-compatible: NULL means not-pending',
  ],
  risks: [
    {
      risk: 'R1: Backfill UPDATE contention on hot claude_sessions table (~9s heartbeat × 5 sessions/host)',
      impact: 'medium',
      likelihood: 'low',
      mitigation:
        'Skip backfill entirely — let column default to NULL; treat NULL as not-pending in reader',
    },
    {
      risk: 'R2: Retry envelope 1+2+4=7s could compound in reaper sweeps',
      impact: 'medium',
      likelihood: 'medium',
      mitigation:
        'Apply retry at outer tree-walk envelope; 15s shared budget cap; all callers are backend (no UI block)',
    },
    {
      risk: 'R3: Retry masks genuine ACL EPERM as transient handle-held EPERM',
      impact: 'medium',
      likelihood: 'low',
      mitigation:
        'Stat probe + 1× chmod retry on permission denied; if still fails, log structured ACL marker',
    },
    {
      risk: 'R4: Code-before-migration deploy → PGRST204 cascading across heartbeat writers (16th writer/consumer asymmetry witness)',
      impact: 'high',
      likelihood: 'low',
      mitigation:
        'Standalone migration PR first + npm run db:verify-column gate before merging code PR; module-load assertion in reaper',
    },
    {
      risk: 'R6: 2 concurrent reapers race on same cleanup_pending row → both claim, half-clean filesystem, both NULL column',
      impact: 'medium',
      likelihood: 'medium',
      mitigation: 'CAS UPDATE WHERE cleanup_pending = expected_ts + pg_try_advisory_lock',
    },
    {
      risk: 'R8: Filesystem race during retry — new file appears in directory between attempts',
      impact: 'low',
      likelihood: 'medium',
      mitigation: 'Re-walk tree on each retry; do not cache file list across attempts',
    },
  ],
  smoke_test_steps: [
    {
      step_number: 1,
      instruction:
        'Run npm run db:verify-column claude_sessions cleanup_pending after migration PR merge',
      expected_outcome:
        'Reports nullable=YES, type=timestamp with time zone, default=NULL — confirming metadata-only ALTER succeeded',
    },
    {
      step_number: 2,
      instruction:
        'In a test DB, INSERT 1 released claude_sessions row with worktree_path pointing to a real .worktrees/ directory; UPDATE cleanup_pending = NOW()',
      expected_outcome:
        'Row visible in SELECT WHERE cleanup_pending IS NOT NULL — writer path proven',
    },
    {
      step_number: 3,
      instruction: 'Run node scripts/orphan-worktree-reaper.mjs with the seeded row',
      expected_outcome:
        'Reaper logs structured event WORKTREE_CLEANUP_RETRY_SUCCESS for that row; .worktrees/ directory removed; cleanup_pending column NULLed via CAS UPDATE — full writer to reader cycle observable',
    },
    {
      step_number: 4,
      instruction:
        'Run two reaper instances concurrently against the same seeded row (race test)',
      expected_outcome:
        'Only one reaper claims the row (CAS prevents both); other logs WORKTREE_CLEANUP_LOST_RACE; no double-removal attempt; column ends NULL exactly once',
    },
    {
      step_number: 5,
      instruction:
        'After 24h post-deploy, query .worktrees/ orphan count and SELECT COUNT(*) FROM claude_sessions WHERE cleanup_pending IS NOT NULL',
      expected_outcome:
        'Orphan count drops from baseline (88 today) to <10; cleanup_pending count trends toward 0 in steady state',
    },
  ],
  scope_reduction_percentage: 30,
  metadata: {
    tier: 'Tier-3',
    campaign:
      'CLAIM-LIFECYCLE / SESSION-IDENTITY harness backlog cluster 2026-05-09',
    prior_art: [
      'SD-LEO-INFRA-WORKTREE-LIFECYCLE-HARDENING-001 (cancelled)',
      'PR #3630 (junction-safe rm)',
      'rollbackWorktreeFilesystemSync from SD-LEO-INFRA-LEO-INFRA-SESSION-001 + SD-FDBK-INFRA-CONCURRENT-NPM-RECONCILIATION-001',
    ],
    loc_estimate: { src: 280, test: 120, total: 430, migration: 30 },
    witness_count: 1,
    migration_reviewed: true,
    source_feedback_ids: ['95105f9b-6b70-45f3-8a51-f61e26e8c4f6'],
    requires_db_migration: true,
    sub_agent_evidence: {
      validation: '7e8f4c86-cf3b-4c28-9fee-51af6e51036e',
      testing: 'cdd621b9-033b-4fec-a993-3a481565e732',
      risk: 'c3bdad3a-ce5d-4083-a71a-3261655aea75',
    },
    scope_reduction_notes:
      'DEFERRED: cross-host reconciliation (shipped SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 2026-05-09); junction-safe rm (shipped PR #3630); root-tree race (feedback a389eedd acknowledged-no-fix); parent FR-4 successor (SD-LEO-INFRA-WORKTREE-COMPLETENESS-CHECK-001 never filed). Q8 deletion-audit: removed cross-host scope language, removed junction-rm wording, removed completeness-check fold-in — ~30% scope reduction.',
    rescoped_at_lead_phase: '2026-05-10',
    fr_count: 8,
  },
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update(update)
  .eq('id', 'a6642ea8-33fe-40dc-814b-54245e41e4c8')
  .select('id,sd_key,scope_reduction_percentage,smoke_test_steps')
  .single();

if (error) {
  console.error('ERROR:', error);
  process.exit(1);
}
console.log('UPDATED:', data.sd_key);
console.log('  scope_reduction_percentage:', data.scope_reduction_percentage);
console.log('  smoke_test_steps count:', Array.isArray(data.smoke_test_steps) ? data.smoke_test_steps.length : 'N/A');
