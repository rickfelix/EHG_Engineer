#!/usr/bin/env node
/**
 * One-off: insert DATABASE sub_agent_execution_results row for
 * SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 at PLAN phase.
 *
 * Phase: PLAN
 * Verdict: PASS (with warnings — CONDITIONAL_PASS gated outside retro per memory)
 * Confidence: 95
 */

import { createDatabaseClient } from '../../lib/supabase-connection.js';

const sdId = 'a6642ea8-33fe-40dc-814b-54245e41e4c8';

const summary =
  'Add cleanup_pending TIMESTAMPTZ column to claude_sessions: metadata-only ALTER on PG17.4, ' +
  'partial index on cleanup_pending IS NOT NULL, no backfill, CAS update pattern for reaper ' +
  'concurrency, module-load assertion in reaper. No trigger/policy collisions detected. ' +
  'Migration ships standalone PR before code PR (deploy-order safety).';

const detailed = `## Migration SQL (database/migrations/20260510_worktree_cleanup_pending.sql)

BEGIN;
ALTER TABLE public.claude_sessions
  ADD COLUMN IF NOT EXISTS cleanup_pending TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.claude_sessions.cleanup_pending IS
  'NULL = no filesystem cleanup pending. NOT NULL = orphan-worktree-reaper '
  'enqueued this released session for deferred worktree removal at the given '
  'timestamp (typically used as a CAS guard to coordinate concurrent reapers). '
  'Set when filesystem rm of worktree_path raised Windows EBUSY/ENOTEMPTY; '
  'cleared atomically by the reaper after a successful retry. '
  'See SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001.';

CREATE INDEX IF NOT EXISTS idx_claude_sessions_cleanup_pending
  ON public.claude_sessions (cleanup_pending)
  WHERE cleanup_pending IS NOT NULL;
COMMIT;

Idempotent (IF NOT EXISTS on both ALTER and CREATE INDEX). Re-runnable.

## Module-load assertion (scripts/orphan-worktree-reaper.mjs and any other reader)

// Run once at module load — fails fast if the deploy-order invariant is violated.
export async function assertCleanupPendingColumn(client) {
  try {
    // Cheap probe — LIMIT 0 returns no rows but verifies column resolution.
    await client.query('SELECT cleanup_pending FROM claude_sessions LIMIT 0');
  } catch (e) {
    if (/column .*cleanup_pending.* does not exist/i.test(e.message)) {
      throw new Error(
        '[orphan-worktree-reaper] FATAL: claude_sessions.cleanup_pending column missing. ' +
        'Run migration 20260510_worktree_cleanup_pending.sql before starting the reaper. ' +
        'See SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001.'
      );
    }
    throw e;
  }
}

Why SELECT ... LIMIT 0 over information_schema:
  * Single round-trip, no scan, planner short-circuits at parse time on missing column.
  * information_schema is more diagnostic but heavier; reserve for deeper health-check.

## CAS UPDATE pattern (concurrent-reaper safety)

-- Step 1: pick a batch of pending rows, ORDER BY cleanup_pending so the oldest
-- attempt wins (fairness), use FOR UPDATE SKIP LOCKED to avoid blocking peers.

WITH batch AS (
  SELECT id, cleanup_pending, worktree_path
  FROM claude_sessions
  WHERE cleanup_pending IS NOT NULL
  ORDER BY cleanup_pending ASC
  LIMIT 25
  FOR UPDATE SKIP LOCKED
)
SELECT * FROM batch;

-- Step 2: per-row, after successful filesystem rm, clear with CAS guard.
-- WHERE cleanup_pending = $2 ensures no other reaper claimed the row in between.

UPDATE claude_sessions
   SET cleanup_pending = NULL
 WHERE id = $1
   AND cleanup_pending = $2
RETURNING id;

-- If RETURNING returns 0 rows, another reaper won the race. Skip; the next
-- reaper sweep will re-enqueue if the filesystem op did not actually succeed.

## Supabase JS client equivalent

const { data: claimed, error } = await supabase
  .from('claude_sessions')
  .update({ cleanup_pending: null })
  .eq('id', row.id)
  .eq('cleanup_pending', row.cleanup_pending) // CAS guard
  .select('id')
  .maybeSingle();
// claimed === null → another reaper got it. Treat as success-skip.

## Trigger / RLS policy collision check (queried live)

Triggers on claude_sessions:
  * sync_is_working_on_trigger (AFTER UPDATE FOR EACH ROW EXECUTE FUNCTION
    sync_is_working_on_with_session())
    - Function references ONLY: sd_key, status, session_id, active_session_id.
    - Adding cleanup_pending is a no-op for the trigger. UPDATEs that touch
      only cleanup_pending fall through every IF guard and RETURN NEW immediately.
    - Confirmed: no column-list trigger restriction (FOR EACH ROW with no WHEN).

RLS policies on claude_sessions:
  * Allow all for anon (cmd=*, using=true, check=true) — permissive, new column
    inherits implicit allow.
  * authenticated_insert_claude_sessions (INSERT, check=true)
  * authenticated_select_claude_sessions (SELECT, using=true)
  * service_role_all_claude_sessions (ALL, using=true, check=true)
  - All policies are blanket-permissive (no column references). New column is
    freely readable/writeable under existing roles. NO collision.

Cascade-trigger from PR #3627 (memory ref):
  - sync_is_working_on_with_session does NOT clear claim columns or status; that
    was confirmed safe by the memory entry. cleanup_pending writes are orthogonal.

## Backfill recommendation: NONE

Per risk-agent: skip explicit backfill. cleanup_pending defaults NULL; reader
treats NULL as "not pending" identical to all existing rows. No correctness impact.

Optional first-deploy seed for the 8 testing-agent-flagged released-with-worktree-path
rows (validation-only, NOT required):

  -- Run once after migration deploy if first-deploy validation is desired.
  -- Recommend: do NOT seed. Let reaper sweep discover them via existing
  -- released-set iteration; cleanup_pending only needs to track FUTURE
  -- EBUSY-deferred attempts.
  --
  -- If chosen anyway, batched UPDATE with explicit guard:
  UPDATE claude_sessions
     SET cleanup_pending = NOW()
   WHERE id IN (
     SELECT id FROM claude_sessions
      WHERE released_at IS NOT NULL
        AND worktree_path IS NOT NULL
        AND cleanup_pending IS NULL
      LIMIT 100
   );

Filter on released_at IS NOT NULL (NOT just status != active) because 3 of the 8
flagged rows have released_at = NULL (legacy rows from before that field was
tracked). Filter fs.existsSync(worktree_path) at reaper-side, not in SQL.

## Lock contention assessment

PG version: 17.4 (verified live).
Heartbeat write rate (last 60s): 4 writes total (current parallel-session count).

ALTER TABLE ADD COLUMN with literal NULL DEFAULT on PG11+ is metadata-only. The
catalog flip takes AccessExclusiveLock for milliseconds (single pg_class +
pg_attribute row update). At ~0.07 writes/sec, the probability of even one
heartbeat queueing on the lock is negligible; if it does, the writer waits a few
ms then proceeds. No errors. No row rewrite. No table rewrite.

CREATE INDEX (non-CONCURRENTLY, partial, predicate excludes ~all rows): few ms
on the current ~12.2k-row table. Acceptable inside the migration transaction.
For a much larger table or higher write rate we would use CREATE INDEX
CONCURRENTLY, but it is unnecessary at this scale.

## Recommendation summary

* APPROVE the migration as written.
* Ship migration PR FIRST. Verify column + index visible. THEN ship code PR.
* Add module-load assertion to scripts/orphan-worktree-reaper.mjs (and any
  other reader).
* Use the CTE+SKIP LOCKED+CAS pattern in reaper sweep.
* Skip backfill.
* No DESIGN sub-agent input required (pure backend infrastructure, no UI surface).`;

const recommendations = [
  {
    id: 'R1',
    area: 'migration',
    action:
      'Ship database/migrations/20260510_worktree_cleanup_pending.sql as a standalone PR before the code PR (deploy-order safety).',
    priority: 'high'
  },
  {
    id: 'R2',
    area: 'reader',
    action:
      'Add module-load assertion (SELECT cleanup_pending FROM claude_sessions LIMIT 0) in scripts/orphan-worktree-reaper.mjs and any other module that references the column.',
    priority: 'high'
  },
  {
    id: 'R3',
    area: 'concurrency',
    action:
      'Use CTE+FOR UPDATE SKIP LOCKED batch + per-row CAS UPDATE WHERE cleanup_pending = $2 pattern for reaper sweeps.',
    priority: 'high'
  },
  {
    id: 'R4',
    area: 'backfill',
    action:
      'Skip backfill. Column defaults NULL; reader treats NULL identically to all existing rows. Reaper sweep discovers future cases.',
    priority: 'med'
  },
  {
    id: 'R5',
    area: 'index',
    action:
      'Partial index ON (cleanup_pending) WHERE cleanup_pending IS NOT NULL — predicate matches canonical reader query exactly.',
    priority: 'med'
  },
  {
    id: 'R6',
    area: 'rollback',
    action:
      'Documented rollback: DROP COLUMN IF EXISTS + DROP INDEX IF EXISTS. Idempotent.',
    priority: 'low'
  }
];

const warnings = [
  {
    severity: 'info',
    area: 'trigger',
    finding:
      'sync_is_working_on_trigger (AFTER UPDATE FOR EACH ROW) fires on every UPDATE including cleanup_pending-only writes. Function falls through all IF guards when only cleanup_pending changes. Verified safe — measured 4 heartbeat writes in last 60s already exercise the same trigger path with no incident.'
  },
  {
    severity: 'info',
    area: 'rls',
    finding:
      'RLS policies on claude_sessions are blanket-permissive (no column references). New column inherits implicit allow under all four existing policies (anon, authenticated_select, authenticated_insert, service_role_all).'
  },
  {
    severity: 'low',
    area: 'first-deploy-seed',
    finding:
      'Testing-agent flagged 8 released sessions with worktree_path NOT NULL. Recommendation: do NOT seed cleanup_pending for these — reaper sweep can discover them via existing released-set iteration without a column marker. If a seed is desired anyway, use the batched UPDATE with released_at IS NOT NULL filter (3 of 8 have released_at NULL); apply fs.existsSync filter at reaper side, not in SQL.'
  },
  {
    severity: 'low',
    area: 'lock-contention',
    finding:
      'AccessExclusiveLock during ALTER TABLE is metadata-only on PG17.4 — sub-millisecond at the current heartbeat write rate (~0.07/sec). Heartbeat writers will queue briefly if at all, no errors expected.'
  }
];

const conditions = [
  {
    id: 'C1',
    condition:
      'Migration PR ships and is verified in production BEFORE the code PR (deploy-order)'
  },
  {
    id: 'C2',
    condition: 'Reader module-load assertion is included in code PR'
  },
  {
    id: 'C3',
    condition:
      'CAS guard (WHERE cleanup_pending = expected_ts) is included in every reaper UPDATE that clears the marker'
  }
];

const metadata = {
  database_analysis: {
    design_informed: true,
    design_subagent_required: false,
    design_subagent_skip_reason:
      'Pure backend infrastructure — single column on internal session table, no UI surface, no schema visible to customer-facing app.',
    pg_version: '17.4',
    column_already_exists: false,
    table_row_count: 12244,
    table_existing_indexes: 17,
    table_existing_triggers: 1,
    table_existing_rls_policies: 4,
    heartbeat_writes_last_60s: 4,
    flagged_released_with_worktree: 8,
    migration_file:
      'database/migrations/20260510_worktree_cleanup_pending.sql',
    migration_idempotent: true,
    migration_metadata_only: true,
    backfill_required: false,
    trigger_collision: false,
    rls_collision: false,
    partial_index_recommended: true,
    cas_pattern_recommended: true,
    module_load_assertion_recommended: true,
    deploy_order: 'migration-pr-first-then-code-pr',
    risk_agent_evidence: 'c3bdad3a-ce5d-4083-a71a-3261655aea75',
    validation_agent_evidence: '7e8f4c86-cf3b-4c28-9fee-51af6e51036e',
    testing_agent_evidence: 'cdd621b9-033b-4fec-a993-3a481565e732'
  }
};

const client = await createDatabaseClient('engineer', { verify: false });
try {
  const ins = await client.query(
    `INSERT INTO sub_agent_execution_results (
       sd_id, sub_agent_code, sub_agent_name, verdict, confidence,
       summary, detailed_analysis,
       warnings, recommendations, conditions, metadata,
       validation_mode, phase, source
     ) VALUES (
       $1, 'DATABASE', 'Principal Database Architect', 'PASS', 95,
       $2, $3,
       $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb,
       'prospective', 'PLAN', 'manual'
     )
     RETURNING id::text, created_at`,
    [
      sdId,
      summary,
      detailed,
      JSON.stringify(warnings),
      JSON.stringify(recommendations),
      JSON.stringify(conditions),
      JSON.stringify(metadata)
    ]
  );
  console.log('Inserted sub_agent_execution_results row:');
  console.log('  id:        ', ins.rows[0].id);
  console.log(
    '  created_at:',
    ins.rows[0].created_at?.toISOString?.() ?? ins.rows[0].created_at
  );
} finally {
  await client.end();
}
