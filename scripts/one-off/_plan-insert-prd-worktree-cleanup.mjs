// PLAN-phase PRD INSERT for SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001
// Inline-mode PRD authoring per CLAUDE_PLAN.md "PRD Creation — Inline Mode is the Default"
// Sub-agent evidence: validation 7e8f4c86, testing cdd621b9, risk c3bdad3a, database 4c1031de
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = 'a6642ea8-33fe-40dc-814b-54245e41e4c8';
const SD_KEY = 'SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001';
const PRD_ID = `PRD-${SD_KEY}`;

const prd = {
  id: PRD_ID,
  directive_id: SD_KEY,
  sd_id: SD_UUID,
  title: 'PRD: Worktree cleanup Windows-safe retry coverage extension + cleanup_pending tracking column',
  version: '1.0.0',
  status: 'approved',
  category: 'infrastructure',
  priority: 'medium',
  document_type: 'prd',
  phase: 'PLAN',
  progress: 0,

  executive_summary:
    'Extend existing rollbackWorktreeFilesystemSync retry coverage to 4 ad-hoc safeRecursiveRm sites + 1 CJS hook; add cleanup_pending TIMESTAMPTZ column on claude_sessions with paired writer/reader to close 16th writer/consumer asymmetry witness.',

  business_context:
    'Orphan worktree count grew from 59 (2026-05-02) to 88 (today, 2026-05-10) as ad-hoc fs.rmSync sites in lib/worktree-manager.js bypass the existing retry layer. Without a persistent-state column, failed cleanups have no observable recovery path — sweeps re-attempt on every sd-start with the same single-attempt strategy, so persistent orphans grow without bound. Closes harness backlog feedback 95105f9b (high severity).',

  technical_context:
    'rollbackWorktreeFilesystemSync at lib/worktree-manager.js:462-588 (shipped via SD-LEO-INFRA-LEO-INFRA-SESSION-001 + SD-FDBK-INFRA-CONCURRENT-NPM-RECONCILIATION-001) already implements 3-attempt retry-with-backoff (delaysMs=[100,500,2000]) with safeRecursiveRm fallback + WORKTREE_ROLLBACK_DEFERRED audit emission. Genuine gap: 4 direct safeRecursiveRm call sites at lib/worktree-manager.js lines 1198, 1267, 1291, 1660 + 1 CJS site at scripts/hooks/concurrent-session-worktree.cjs:472 bypass that helper. claude_sessions has 45 columns + 1 trigger (sync_is_working_on_trigger references sd_key/status/session_id only — no collision) + 4 blanket RLS policies — no column refs. Hot table at ~9s heartbeat × 5 active sessions/host. PG 17.4 → ALTER TABLE ADD COLUMN with NULL default is metadata-only (sub-ms AccessExclusiveLock).',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Extend rollbackWorktreeFilesystemSync retry coverage to 4 ad-hoc safeRecursiveRm sites in lib/worktree-manager.js',
      description: 'Wrap or route safeRecursiveRm call sites at lines 1198, 1267, 1291, 1660 through the same retry helper (3 attempts; existing delaysMs=[100,500,2000] retained per validation finding; outer-envelope retry per risk-agent R2). On final failure, INSERT structured log line + UPDATE claude_sessions SET cleanup_pending=NOW() WHERE session_id=<owner>.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1.1: lib/worktree-manager.js lines 1198/1267/1291/1660 no longer call fs.rmSync or safeRecursiveRm directly without retry wrapping',
        'AC-1.2: Vitest case simulates EPERM-then-success on attempt 2 for each of 4 sites; all PASS',
        'AC-1.3: Vitest case simulates 3-attempt-failure → asserts cleanup_pending UPDATE fires for owning session',
        'AC-1.4: Existing 7 safeRecursiveRm consumers in lib/eva regression suite (255 cases) ZERO breakage',
        'AC-1.5: AST/regex static guard test enumerates 5 pinned retry sites + fails when new safeRecursiveRm appears outside pin list',
      ],
    },
    {
      id: 'FR-1c',
      requirement: 'CJS hook scripts/hooks/concurrent-session-worktree.cjs:472 retry parity',
      description: 'CJS hook uses inlined junction-aware fallback bypassing the ESM safeRecursiveRm helper. Either extract retry into a shared CJS+ESM-compatible shape OR duplicate inline with parity test that asserts matching delaysMs schedule + same EPERM/ENOTEMPTY/EBUSY catch set.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1c.1: scripts/hooks/concurrent-session-worktree.cjs:472 retries 3 attempts with same delaysMs as ESM helper',
        'AC-1c.2: Parity test asserts schedule equality between CJS hook + ESM safeRecursiveRm retry',
        'AC-1c.3: CJS hook persistent-failure path emits same WORKTREE_ROLLBACK_DEFERRED audit row shape as ESM helper',
      ],
    },
    {
      id: 'FR-1d',
      requirement: 'Sibling-cleanup-site explicit include/exclude documentation',
      description: 'Document in PRD which sibling cleanup sites are explicitly NOT in scope (vs missed): cancel-sd worktree rollback, orphan-qf-reaper, /ship Step 7 cleanup. Out-of-scope sites are flagged for follow-up SD if they recur. In-scope sites: only the 4+1 enumerated FR-1/FR-1c sites.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1d.1: PRD lists each sibling site with in/out-of-scope rationale',
        'AC-1d.2: Out-of-scope sites have follow-up SD candidate IDs reserved or backlog-feedback IDs cited',
        'AC-1d.3: Static guard test asserts no UNREGISTERED safeRecursiveRm appears in target file paths',
      ],
    },
    {
      id: 'FR-2',
      requirement: 'Add nullable cleanup_pending TIMESTAMPTZ column on claude_sessions (standalone migration PR)',
      description: 'database/migrations/20260510_worktree_cleanup_pending.sql per database-agent design: BEGIN; ALTER TABLE public.claude_sessions ADD COLUMN IF NOT EXISTS cleanup_pending TIMESTAMPTZ DEFAULT NULL; COMMENT ON COLUMN ...; CREATE INDEX IF NOT EXISTS idx_claude_sessions_cleanup_pending ON public.claude_sessions (cleanup_pending) WHERE cleanup_pending IS NOT NULL; COMMIT. Idempotent re-runnable. Metadata-only on PG17 (sub-ms lock; heartbeats queue without error). NO BACKFILL — column defaults NULL, reader treats NULL as not-pending. Standalone migration PR ships + verifies BEFORE code PR per risk-agent R4.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-2.1: information_schema.columns returns cleanup_pending: nullable=YES, data_type=timestamp with time zone, default=NULL',
        'AC-2.2: pg_indexes shows idx_claude_sessions_cleanup_pending partial index WHERE cleanup_pending IS NOT NULL',
        'AC-2.3: Migration is idempotent — second run is no-op',
        'AC-2.4: Migration PR merges + verified via npm run db:verify-column gate BEFORE code PR opens',
        'AC-2.5: claude_sessions heartbeat write latency p95 unchanged 24h post-merge',
      ],
    },
    {
      id: 'FR-2c',
      requirement: 'Reaper claim-then-clean concurrency primitive (CAS pattern with FOR UPDATE SKIP LOCKED)',
      description: 'Per database-agent CAS pattern: WITH batch AS (SELECT id, cleanup_pending FROM claude_sessions WHERE cleanup_pending IS NOT NULL ORDER BY cleanup_pending ASC LIMIT 25 FOR UPDATE SKIP LOCKED) SELECT * FROM batch; then per-row UPDATE claude_sessions SET cleanup_pending=NULL WHERE id=$1 AND cleanup_pending=$2 RETURNING id. Supabase JS equivalent: .eq("id", row.id).eq("cleanup_pending", row.cleanup_pending). RETURNING 0 = peer reaper won, skip safely.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-2c.1: Reaper sweep query uses FOR UPDATE SKIP LOCKED for batch claim',
        'AC-2c.2: Per-row UPDATE includes WHERE cleanup_pending = expected_ts (CAS guard)',
        'AC-2c.3: Vitest race test: 2 concurrent reapers seeded 1 row → exactly 1 NULL UPDATE succeeds, other returns 0 rows + logs WORKTREE_CLEANUP_LOST_RACE',
        'AC-2c.4: No double-removal attempt on filesystem when race occurs',
      ],
    },
    {
      id: 'FR-2d',
      requirement: 'Backfill stat-check (fs.existsSync filter) for 8 currently-released sessions',
      description: 'Risk-agent R1 + database-agent recommendation: skip explicit backfill UPDATE entirely. Reader-side filter: when reaper sweeps cleanup_pending IS NOT NULL rows, fs.existsSync(worktree_path) gate before retry attempt. If path no longer exists, NULL the column immediately (cleanup completed externally — e.g. user manually rm-d it). Prevents reaper spinning on phantom paths for the 8 currently-released-with-worktree_path rows that natural sweeps will pick up.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-2d.1: orphan-worktree-reaper.mjs sweep includes fs.existsSync(worktree_path) check before retry',
        'AC-2d.2: Phantom path (worktree removed externally) → cleanup_pending NULLed atomically + structured log WORKTREE_CLEANUP_PHANTOM_PATH emitted',
        'AC-2d.3: Vitest case: seed cleanup_pending row with non-existent path → assert reaper NULLs column without attempting fs operations',
        'AC-2d.4: No backfill INSERT/UPDATE seed required at deploy time (NULL default suffices)',
      ],
    },
    {
      id: 'FR-2e',
      requirement: 'Static guard test pinning canonical writer + canonical reader for cleanup_pending column',
      description: 'New vitest case in tests/static-guards/cleanup-pending-pairing.test.js scans for cleanup_pending column references in lib/ and scripts/. Asserts the only canonical WRITER is the safeRecursiveRm persistent-failure UPDATE (lib/worktree-manager.js) AND the only canonical READER is the orphan-worktree-reaper sweep (scripts/orphan-worktree-reaper.mjs or scripts/modules/orphan-worktree-reaper.mjs). Test fails when a new write/read site appears without registering it in the pinned-sites array. Closes 16th writer/consumer asymmetry witness pattern (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-2e.1: tests/static-guards/cleanup-pending-pairing.test.js exists + PASSES',
        'AC-2e.2: Test asserts exactly 1 canonical writer (lib/worktree-manager.js) + 1 canonical reader (orphan-worktree-reaper)',
        'AC-2e.3: Test FAILS when adding a sample new write site without pin-list registration (proven via test-of-the-test)',
        'AC-2e.4: Pin list documented inline with rationale referencing PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'orphan-worktree-reaper consumer of cleanup_pending column',
      description: 'Either extend existing scripts/orphan-worktree-reaper.mjs or create scripts/modules/orphan-worktree-reaper.mjs with sweep loop: claim batch via FR-2c CAS, fs.existsSync filter via FR-2d, retry safeRecursiveRm via FR-1, NULL column on success. Module-load assertion at startup: `await client.query("SELECT cleanup_pending FROM claude_sessions LIMIT 0")` → fails fast if column missing (deploy-order safety per risk-agent R4).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-3.1: Reaper module-load executes SELECT cleanup_pending FROM claude_sessions LIMIT 0 → throws fatal+log if column missing',
        'AC-3.2: Reaper sweep emits structured log per row: WORKTREE_CLEANUP_RETRY_ATTEMPT, WORKTREE_CLEANUP_RETRY_SUCCESS, WORKTREE_CLEANUP_RETRY_EXHAUSTED, WORKTREE_CLEANUP_LOST_RACE, WORKTREE_CLEANUP_PHANTOM_PATH',
        'AC-3.3: Vitest end-to-end: seed 1 row + run reaper + assert .worktrees/ removed + cleanup_pending NULLed',
        'AC-3.4: scripts/sd-start.js preflight invokes reaper best-effort non-blocking (timeout 2s; failure logged but does not block sd-start)',
      ],
    },
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Migration must use ADD COLUMN IF NOT EXISTS + DEFAULT NULL (PG17-safe metadata-only)',
      rationale: 'Avoids hot-table lock contention with ~9s heartbeat × 5 active sessions per host. PG11+ stores DEFAULT NULL as metadata, not table rewrite. Per database-agent evidence: sub-ms AccessExclusiveLock, heartbeats queue without erroring.',
    },
    {
      id: 'TR-2',
      requirement: 'Standalone migration PR merges + verifies BEFORE code PR opens',
      rationale: 'Per risk-agent R4: code-before-migration deploy → PGRST204 cascading across heartbeat writers (would be 16th witness of writer/consumer asymmetry). Two-PR sequence + npm run db:verify-column gate prevents the asymmetry from shipping.',
    },
    {
      id: 'TR-3',
      requirement: 'Reaper module-load assertion fails fast if cleanup_pending column missing',
      rationale: 'Defense-in-depth for TR-2. Even with PR sequencing, deploy-time ordering can drift. Module-load `SELECT cleanup_pending FROM claude_sessions LIMIT 0` parse-time error is single-round-trip cost + clear remediation message.',
    },
    {
      id: 'TR-4',
      requirement: 'Retry uses FOR UPDATE SKIP LOCKED + CAS guard (WHERE cleanup_pending = expected_ts) for concurrency',
      rationale: 'Per risk-agent R6 + database-agent CAS pattern: 2 concurrent reapers (cron + manual + sd-start preflight) racing on same row. SKIP LOCKED ensures non-blocking batch claim; CAS UPDATE ensures only winner NULLs the column.',
    },
    {
      id: 'TR-5',
      requirement: 'Static guard test pins all NEW cleanup_pending writes/reads + ALL existing safeRecursiveRm retry sites',
      rationale: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has 15 prior witnesses across the harness. Pin lists are the only mechanism that makes "we forgot site X" detectable in CI rather than at runtime months later.',
    },
  ],

  system_architecture: `## Overview

Two-layer fix: (Layer 1) close existing retry-helper coverage gap by routing 4+1 ad-hoc cleanup sites through the established rollbackWorktreeFilesystemSync retry pattern; (Layer 2) add cleanup_pending state column + reader to enable persistent-state retry across Claude Code restarts.

## Components

| Component | Responsibility | Technology |
|-----------|----------------|------------|
| lib/worktree-manager.js (modify) | safeRecursiveRm at lines 1198/1267/1291/1660 routed through retry helper; persistent-failure path UPDATEs claude_sessions.cleanup_pending=NOW() for owning session | Node ESM, fs.rmSync, Supabase JS client |
| scripts/hooks/concurrent-session-worktree.cjs (modify) | CJS hook line 472 inline retry parity — same delaysMs schedule, same catch set, same audit emission | Node CJS, fs.rmSync |
| database/migrations/20260510_worktree_cleanup_pending.sql (NEW) | ADD COLUMN IF NOT EXISTS cleanup_pending TIMESTAMPTZ DEFAULT NULL + partial index | PostgreSQL DDL |
| scripts/orphan-worktree-reaper.mjs (NEW or extend existing) | Module-load assertion (SELECT cleanup_pending LIMIT 0); sweep loop with FOR UPDATE SKIP LOCKED claim + fs.existsSync filter + retry + CAS UPDATE NULL on success | Node ESM, Supabase JS, fs |
| scripts/sd-start.js (modify) | Preflight invokes reaper best-effort non-blocking (timeout 2s) | Node ESM |
| tests/static-guards/cleanup-pending-pairing.test.js (NEW) | AST/regex scan: pins canonical writer + reader for cleanup_pending column; FAILS on unregistered new sites | vitest, fs.readFileSync |
| tests/lib/worktree-manager-retry.test.js (NEW or extend) | EPERM-then-success simulation per retry site; persistent-failure cleanup_pending UPDATE assertion | vitest, vi.mock fs.rmSync |

## Data Flow

\`\`\`
[sd-start / cancel-sd / orchestrator-cleanup]
        |
        v
  safeRecursiveRm at lib/worktree-manager.js:1198/1267/1291/1660
        |
        v (failure)
  rollbackWorktreeFilesystemSync retry helper (3 attempts, delaysMs=[100,500,2000])
        |
        v (3 attempts exhausted)
  Structured log WORKTREE_ROLLBACK_DEFERRED + UPDATE claude_sessions SET cleanup_pending=NOW()
        |
        v
  Time passes; file handles release (npm/antivirus/indexer)
        |
        v
  orphan-worktree-reaper sweep (cron + sd-start preflight + manual)
        |
        v
  FOR UPDATE SKIP LOCKED batch claim from claude_sessions WHERE cleanup_pending IS NOT NULL
        |
        v (per row)
  fs.existsSync(worktree_path)? -> NO -> NULL column + log PHANTOM_PATH
                                  -> YES -> retry safeRecursiveRm
        |
        v (success)
  CAS UPDATE claude_sessions SET cleanup_pending=NULL WHERE id=$1 AND cleanup_pending=$2
        |
        v
  RETURNING id? -> 0 rows = peer reaper won, log LOST_RACE; >0 rows = our row, log SUCCESS
\`\`\`

## Integration Points

- claude_sessions.cleanup_pending: new TIMESTAMPTZ column, single-writer (safeRecursiveRm persistent-failure path) + single-reader (orphan-worktree-reaper)
- session_lifecycle_events: existing audit table; reaper emits WORKTREE_CLEANUP_RETRY_* events
- rollbackWorktreeFilesystemSync helper: existing 3-attempt retry layer extended to 4 ad-hoc sites
- npm run db:verify-column: gate between migration PR merge + code PR open
- vitest static-guard test: AST/regex scan over lib/worktree-manager.js + scripts/orphan-worktree-reaper.mjs
`,

  implementation_approach: `## Phase 1: Standalone Migration PR (deploy-order safety)
**Deliverable**: database/migrations/20260510_worktree_cleanup_pending.sql

1. Author migration SQL per database-agent design (already written by sub-agent at /database/migrations/20260510_worktree_cleanup_pending.sql)
2. Open standalone PR titled "feat(SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001): claude_sessions.cleanup_pending migration (FR-2)"
3. Merge + run npm run db:verify-column claude_sessions cleanup_pending against staging + production
4. ONLY THEN open the code PR

## Phase 2: Code PR — Static Guard + Retry Coverage (FR-2e, FR-1, FR-1c)
**Deliverable**: tests/static-guards/cleanup-pending-pairing.test.js + lib/worktree-manager.js + scripts/hooks/concurrent-session-worktree.cjs

1. Write static-guard test FIRST (TDD): asserts canonical writer/reader pin list + fails when new site appears
2. Route 4 ad-hoc safeRecursiveRm sites through rollbackWorktreeFilesystemSync (FR-1)
3. Add CJS hook retry parity (FR-1c) + parity test
4. Add persistent-failure UPDATE claude_sessions SET cleanup_pending=NOW() in helper
5. Vitest cases: EPERM-then-success per site + persistent-failure UPDATE assertion

## Phase 3: Reaper Consumer (FR-3, FR-2c, FR-2d)
**Deliverable**: scripts/orphan-worktree-reaper.mjs (NEW or extend) + scripts/sd-start.js preflight modification

1. Module-load assertion (SELECT cleanup_pending LIMIT 0)
2. Sweep loop: FOR UPDATE SKIP LOCKED batch claim → fs.existsSync filter → retry → CAS UPDATE NULL
3. Structured-log emission for all 5 outcome types
4. Vitest end-to-end: seed row + run reaper + assert filesystem + DB state
5. Vitest race test: 2 concurrent reapers
6. scripts/sd-start.js preflight invokes reaper best-effort non-blocking

## Phase 4: Documentation & Sibling-Site Audit (FR-1d)
**Deliverable**: PRD updates + follow-up SD candidates

1. Document each sibling site (cancel-sd, orphan-qf-reaper, /ship Step 7) with in/out-of-scope rationale
2. File backlog feedback for any out-of-scope sites that show recurring orphan pattern
3. Update CLAUDE_CORE.md or CLAUDE_PLAN.md if pattern needs codification

## Technical Decisions

1. **Skip backfill**: NULL default + fs.existsSync filter in reader handles 8 currently-released-with-worktree_path rows naturally. Avoids hot-table backfill UPDATE contention (risk-agent R1).
2. **CAS over advisory locks**: pg_try_advisory_lock works but adds session-state complexity. CAS WHERE cleanup_pending=expected_ts is single-statement, observable in EXPLAIN, no session leak risk.
3. **Static guard over runtime detection**: Pin list catches "missed site X" in CI rather than at runtime months later (per testing-agent + 15 prior witnesses of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
4. **CJS+ESM parity via duplication, not extraction**: scripts/hooks/concurrent-session-worktree.cjs is a CJS file with .cjs extension. Cross-extension imports add complexity; parity test asserts schedule equality with reasonable acceptance.
5. **Outer-envelope retry, not per-inode**: Per risk-agent R2, retry the whole tree-walk on EPERM, not individual file unlinks. Re-walking tree on each attempt also handles filesystem races (R8).
`,

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'EPERM-then-success retry at lib/worktree-manager.js:1198',
      test_type: 'unit',
      given: 'safeRecursiveRm called at line 1198 site; vi.mock fs.rmSync to throw EPERM on first call, succeed on second',
      when: 'Cleanup site invoked',
      then: 'Retry helper backs off 100ms, retries, succeeds. cleanup_pending NOT updated. WORKTREE_ROLLBACK_DEFERRED audit row NOT inserted (success path).',
    },
    {
      id: 'TS-2',
      scenario: 'Persistent-failure UPDATE cleanup_pending=NOW()',
      test_type: 'integration',
      given: 'safeRecursiveRm at line 1267 site; vi.mock fs.rmSync throws EPERM on all 3 attempts; test claude_sessions row has owning session_id',
      when: 'Cleanup site invoked',
      then: 'Retry helper exhausts 3 attempts, structured log WORKTREE_ROLLBACK_DEFERRED emitted, claude_sessions.cleanup_pending UPDATEd to NOW() for owning session',
    },
    {
      id: 'TS-3',
      scenario: 'Reaper end-to-end happy path',
      test_type: 'integration',
      given: 'Test DB row INSERTed with cleanup_pending=NOW() and worktree_path pointing to fixture .worktrees/ directory that exists',
      when: 'Reaper sweep runs',
      then: 'fs.existsSync passes; retry succeeds (real fs.rmSync, no mock); CAS UPDATE NULLs the column; structured log WORKTREE_CLEANUP_RETRY_SUCCESS; .worktrees/ directory removed',
    },
    {
      id: 'TS-4',
      scenario: 'Reaper race: 2 concurrent reapers seeded 1 row',
      test_type: 'integration',
      given: '1 cleanup_pending row in test DB; 2 reaper processes started concurrently with same DB connection pool',
      when: 'Both sweep at same time',
      then: 'Exactly 1 reaper UPDATE returns rows (winner); other returns 0 rows + logs WORKTREE_CLEANUP_LOST_RACE; no double rm attempt; column NULL exactly once',
    },
    {
      id: 'TS-5',
      scenario: 'Reaper phantom path (worktree removed externally)',
      test_type: 'integration',
      given: 'cleanup_pending row with worktree_path pointing to non-existent directory',
      when: 'Reaper sweep runs',
      then: 'fs.existsSync returns false; reaper NULLs cleanup_pending atomically; structured log WORKTREE_CLEANUP_PHANTOM_PATH; no fs.rmSync attempted',
    },
    {
      id: 'TS-6',
      scenario: 'Module-load assertion fails fast if column missing',
      test_type: 'unit',
      given: 'Reaper imported in environment where claude_sessions.cleanup_pending column does NOT exist',
      when: 'Reaper module loads (top-level await SELECT cleanup_pending FROM claude_sessions LIMIT 0)',
      then: 'Throws PostgresError column "cleanup_pending" does not exist; reaper module load aborts; clear log directing operator to run migration first',
    },
    {
      id: 'TS-7',
      scenario: 'Static guard test detects unregistered cleanup_pending write site',
      test_type: 'unit',
      given: 'Test fixture: append a new "cleanup_pending=" UPDATE to a file NOT in the pin list',
      when: 'Static guard test runs',
      then: 'Test FAILS with clear message: new write site detected at <file:line>; add to pin list with rationale or remove the write',
    },
    {
      id: 'TS-8',
      scenario: 'CJS hook retry parity',
      test_type: 'unit',
      given: 'Both ESM safeRecursiveRm + CJS scripts/hooks/concurrent-session-worktree.cjs:472 invoked under same EPERM-throw conditions',
      when: 'Each retry chain completes',
      then: 'Both use same delaysMs schedule; both catch same error codes (EPERM, ENOTEMPTY, EBUSY, ENOENT-benign); both emit equivalent audit row',
    },
  ],

  acceptance_criteria: [
    'AC-G1: All 8 functional requirements (FR-1, FR-1c, FR-1d, FR-2, FR-2c, FR-2d, FR-2e, FR-3) have verified PASS criteria with vitest evidence',
    'AC-G2: 8+ new vitest cases (5 retry-site sims + reaper race + phantom path + static guard + module-load) all PASS',
    'AC-G3: Zero regressions in lib/eva (255 cases) + lib/worktree (existing) + scripts/orphan* test suites',
    'AC-G4: Migration PR merged + npm run db:verify-column gate PASS BEFORE code PR opens (deploy-order safety)',
    'AC-G5: Static guard test pins canonical writer (lib/worktree-manager.js) + canonical reader (orphan-worktree-reaper) for cleanup_pending; closes 16th writer/consumer asymmetry witness',
    'AC-G6: 24h post-merge: .worktrees/ orphan count drops from baseline 88 to <10; SELECT COUNT(*) FROM claude_sessions WHERE cleanup_pending IS NOT NULL trends toward 0',
    'AC-G7: claude_sessions heartbeat write latency p95 unchanged 24h post-merge (no migration regression)',
  ],

  risks: [
    {
      risk: 'R1: Code PR merged before migration PR → PGRST204 column-missing errors cascade across all heartbeat writers (16th writer/consumer asymmetry witness)',
      probability: 'LOW',
      impact: 'HIGH',
      mitigation: 'Standalone migration PR ships first + npm run db:verify-column gate verifies before code PR opens. Module-load assertion in reaper provides defense-in-depth — fails fast at deploy time with clear remediation message.',
      rollback_plan: 'If column-missing errors appear: revert code PR (single git revert), migration is independently reversible via DROP COLUMN IF EXISTS cleanup_pending. Reaper still works without column (module-load assertion stops it cleanly rather than corrupting state).',
    },
    {
      risk: 'R2: Retry envelope 1+2+4=7s compounds in reaper sweeps if applied per-inode',
      probability: 'MEDIUM',
      impact: 'MEDIUM',
      mitigation: 'Apply retry at outer tree-walk envelope per risk-agent R2; do not retry individual file unlinks. 15s shared budget cap. All callers are backend (no UI block). Reaper batch size limited to 25 rows per sweep.',
      rollback_plan: 'If reaper sweep latency degrades: tune batch size in scripts/orphan-worktree-reaper.mjs (reduce LIMIT from 25 to 5); no schema change needed.',
    },
    {
      risk: 'R3: Two concurrent reapers race on same cleanup_pending row → both attempt rm + both NULL column',
      probability: 'MEDIUM',
      impact: 'MEDIUM',
      mitigation: 'CAS pattern: UPDATE WHERE cleanup_pending = expected_ts. Loser returns 0 rows + logs WORKTREE_CLEANUP_LOST_RACE + skips. FOR UPDATE SKIP LOCKED on initial batch claim ensures non-blocking. Vitest race test in TS-4 verifies behavior.',
      rollback_plan: 'No filesystem state corruption possible — fs.rmSync is idempotent for non-existent paths. Worst case: both rm attempts log on missing-path; one succeeds CAS update, other no-ops.',
    },
    {
      risk: 'R4: Static guard test produces false-positives (e.g. matches cleanup_pending in a comment or test fixture)',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'Static guard scans only for cleanup_pending in JS .from(table).update({cleanup_pending: ...}) and similar SQL UPDATE patterns; excludes comment lines + test files. Pin list is explicit allowlist with rationale.',
      rollback_plan: 'If guard generates false-positive on a legitimate use: add to pin list with rationale documenting why this site is canonical (or refactor to single-writer pattern).',
    },
    {
      risk: 'R5: ALTER TABLE on hot claude_sessions causes heartbeat write timeout',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'PG17 ADD COLUMN IF NOT EXISTS with NULL DEFAULT is metadata-only (sub-ms AccessExclusiveLock per database-agent evidence). Heartbeats queue + complete normally during the metadata flip.',
      rollback_plan: 'If heartbeats time out during migration: monitor immediately post-merge; if observed, run migration during low-traffic window or temporarily disable heartbeat writers (feature flag SESSION_HEARTBEAT_DISABLED=true).',
    },
  ],

  dependencies: [
    {
      type: 'internal',
      dependency: 'rollbackWorktreeFilesystemSync helper at lib/worktree-manager.js:462-588',
      status: 'available',
      note: 'Existing 3-attempt retry layer shipped via SD-LEO-INFRA-LEO-INFRA-SESSION-001 + SD-FDBK-INFRA-CONCURRENT-NPM-RECONCILIATION-001',
    },
    {
      type: 'internal',
      dependency: 'session_lifecycle_events audit table',
      status: 'available',
      note: 'Existing audit table; reaper emits WORKTREE_CLEANUP_RETRY_* events',
    },
    {
      type: 'internal',
      dependency: 'npm run db:verify-column script',
      status: 'available_or_create',
      note: 'Generic column-existence verifier; if missing, add to package.json as part of FR-2',
    },
  ],

  integration_operationalization: {
    consumers: [
      {
        name: 'safeRecursiveRm callers in lib/worktree-manager.js (sd-start, cancel-sd, /ship Step 7, orchestrator cleanup)',
        interaction: 'Call sites at lines 1198, 1267, 1291, 1660 now route through retry helper transparently; no API change for callers',
        frequency: 'Every sd-start (~20-50/day), every cancel-sd (~5-10/day), every /ship completion',
      },
      {
        name: 'orphan-worktree-reaper (cron + sd-start preflight + manual)',
        interaction: 'Reads cleanup_pending IS NOT NULL rows, retries cleanup, NULLs column on success',
        frequency: 'Cron every 15 min + sd-start preflight (best-effort) + manual on-demand',
      },
      {
        name: 'CJS hook scripts/hooks/concurrent-session-worktree.cjs:472',
        interaction: 'Inline retry parity — same delaysMs + catch set as ESM helper; emits same audit row shape',
        frequency: 'Every concurrent-session detection trigger (variable, ~10-30/day)',
      },
    ],
    dependencies: [
      {
        name: 'PostgreSQL claude_sessions table',
        type: 'upstream',
        contract: 'cleanup_pending column ADD COLUMN IF NOT EXISTS migration must be applied before code PR merges',
        failure_handling: 'Module-load assertion in reaper throws PostgresError + halts module load; deploy operator runs migration then re-deploys code',
      },
      {
        name: 'Supabase Service Role Client (createSupabaseServiceClient)',
        type: 'upstream',
        contract: 'Existing connection pattern from scripts/lib/supabase-connection.js; UPDATE/SELECT permissions on claude_sessions',
        failure_handling: 'Reaper sweep retries on transient connection error; structured log WORKTREE_CLEANUP_DB_ERROR',
      },
      {
        name: 'session_lifecycle_events audit table',
        type: 'downstream',
        contract: 'Existing audit table accepts INSERTs of WORKTREE_CLEANUP_RETRY_*, WORKTREE_ROLLBACK_DEFERRED, WORKTREE_CLEANUP_LOST_RACE, WORKTREE_CLEANUP_PHANTOM_PATH event types',
        failure_handling: 'Audit insert is best-effort; failure does not block reaper progress (logged but not raised)',
      },
    ],
    data_contracts: [
      {
        contract_name: 'claude_sessions.cleanup_pending',
        schema: 'TIMESTAMPTZ DEFAULT NULL; partial index WHERE cleanup_pending IS NOT NULL',
        validation: 'Column exists check via SELECT cleanup_pending FROM claude_sessions LIMIT 0 (module-load assertion)',
        versioning: 'Single canonical writer (safeRecursiveRm persistent-failure path) + single canonical reader (orphan-worktree-reaper). Static guard test pins both.',
      },
      {
        contract_name: 'WORKTREE_CLEANUP_RETRY_* audit events',
        schema: 'session_lifecycle_events: { event_type, session_id, sd_key, payload (jsonb: { worktree_path, attempt, last_error, outcome }) }',
        validation: 'Existing audit table schema; reaper emits per outcome type',
        versioning: 'Append-only event types; new outcome types appended without removing existing',
      },
    ],
    runtime_config: {
      environment_variables: [
        'SUPABASE_URL (existing)',
        'SUPABASE_SERVICE_ROLE_KEY (existing)',
        'WORKTREE_CLEANUP_REAPER_BATCH_SIZE (optional; default 25)',
        'WORKTREE_CLEANUP_REAPER_DISABLED (optional; default false; emergency kill switch)',
      ],
      feature_flags: [
        'WORKTREE_CLEANUP_REAPER_DISABLED=true: emergency kill switch if reaper misbehaves; sd-start preflight + cron skip silently',
      ],
      deployment_considerations: 'Two-PR sequence: (1) standalone migration PR; (2) code PR. Verify column exists between merges via npm run db:verify-column.',
    },
    observability_rollout: {
      monitoring: [
        '.worktrees/ orphan count (filesystem du -d 1 .worktrees/ | wc -l)',
        'SELECT COUNT(*) FROM claude_sessions WHERE cleanup_pending IS NOT NULL (DB query)',
        'session_lifecycle_events filtered by event_type IN (WORKTREE_CLEANUP_RETRY_SUCCESS, WORKTREE_CLEANUP_RETRY_EXHAUSTED, WORKTREE_CLEANUP_LOST_RACE, WORKTREE_CLEANUP_PHANTOM_PATH)',
        'claude_sessions heartbeat write latency p95 (regression check post-migration)',
      ],
      alerts: [
        'WORKTREE_CLEANUP_RETRY_EXHAUSTED count > 10 in 1h → investigate which worktree paths are persistently failing',
        'cleanup_pending row count growing > 50 sustained → reaper not draining; check WORKTREE_CLEANUP_REAPER_DISABLED flag',
        'claude_sessions write latency p95 > 200ms sustained → potential migration regression',
      ],
      rollout_strategy: 'Phase 1: standalone migration PR. Phase 2: code PR after column verified. Phase 3: monitor 24h orphan count + heartbeat latency. Phase 4: if metrics hold, merge auto-runs; if regression, revert code PR.',
      rollback_trigger: 'Heartbeat write latency p95 sustained > 200ms; cleanup_pending row count climbing > 100 with no draining; static guard test failures in CI not attributable to legitimate new sites',
      rollback_procedure: '(a) Revert code PR via git revert; (b) Migration is independently reversible: DROP INDEX idx_claude_sessions_cleanup_pending; ALTER TABLE claude_sessions DROP COLUMN cleanup_pending; (c) Reaper without column: fails module-load cleanly (no corruption)',
    },
  },

  exploration_summary: {
    files_read: [
      'lib/worktree-manager.js (1080-1226 + grep all safeRecursiveRm sites)',
      'scripts/sd-start.js (claim flow + worktree quota check)',
      'CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md (full reads)',
      'database/migrations/ (existing migration patterns)',
      'feedback table query for source feedback 95105f9b',
      'strategic_directives_v2 for cancelled parent SD-LEO-INFRA-WORKTREE-LIFECYCLE-HARDENING-001',
      'claude_sessions schema (45 columns, 1 trigger, 4 RLS policies, 17 indexes)',
    ],
    patterns_identified: [
      'Existing rollbackWorktreeFilesystemSync retry helper at lib/worktree-manager.js:462-588 (delaysMs=[100,500,2000])',
      '4 ad-hoc safeRecursiveRm sites bypass that helper (lines 1198, 1267, 1291, 1660)',
      '1 CJS hook bypasses entirely (concurrent-session-worktree.cjs:472)',
      'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has 15 prior witnesses; this would be 16th',
      'claude_sessions is hot table (~9s heartbeat × 5 active sessions/host); ALTER TABLE must be metadata-only',
      'WORKTREE_ROLLBACK_DEFERRED audit row already exists but is functionally unused (no consumer until this SD)',
    ],
    key_decisions: [
      'Skip backfill (NULL default + reader-side fs.existsSync filter handles 8 currently-released-with-worktree_path rows naturally)',
      'CAS pattern over advisory locks (single statement, observable, no session leak)',
      'Static guard test pins canonical writer + reader (closes 16th asymmetry witness)',
      'CJS+ESM parity via inline duplication + parity test (cross-extension imports add complexity)',
      'Outer-envelope retry, not per-inode (aligns with existing helper, handles filesystem races)',
      'Two-PR deploy sequence (migration first, code second) + module-load assertion (defense-in-depth)',
    ],
    exploration_date: new Date().toISOString(),
  },

  metadata: {
    sd_uuid: SD_UUID,
    sd_key: SD_KEY,
    sub_agent_evidence: {
      validation: '7e8f4c86-cf3b-4c28-9fee-51af6e51036e',
      testing: 'cdd621b9-033b-4fec-a993-3a481565e732',
      risk: 'c3bdad3a-ce5d-4083-a71a-3261655aea75',
      database: '4c1031de-8991-42c7-8fe2-d438a2cd331e',
    },
    database_analysis: {
      design_informed: true,
      migration_file: 'database/migrations/20260510_worktree_cleanup_pending.sql',
      migration_complexity: 'metadata_only_pg17',
      column_added: 'cleanup_pending TIMESTAMPTZ DEFAULT NULL',
      partial_index: 'idx_claude_sessions_cleanup_pending WHERE cleanup_pending IS NOT NULL',
      backfill_required: false,
      lock_type: 'AccessExclusiveLock',
      lock_duration_ms: '<1',
      trigger_collisions: 'none',
      rls_policy_collisions: 'none',
      hot_table: true,
      heartbeat_write_rate: '~9s × 5 sessions = ~3 writes/sec',
    },
    deploy_strategy: {
      phase_1: 'Standalone migration PR + npm run db:verify-column gate',
      phase_2: 'Code PR (FR-1, FR-1c, FR-2c, FR-2d, FR-2e, FR-3) after column verified',
      phase_3: '24h monitoring window (orphan count + heartbeat latency)',
      rollback_unit: 'Single git revert of code PR; migration independently reversible',
    },
    pin_list_canonical: {
      cleanup_pending_writers: ['lib/worktree-manager.js (rollbackWorktreeFilesystemSync persistent-failure path)'],
      cleanup_pending_readers: ['scripts/orphan-worktree-reaper.mjs (sweep loop)'],
      retry_sites: [
        'lib/worktree-manager.js:1198',
        'lib/worktree-manager.js:1267',
        'lib/worktree-manager.js:1291',
        'lib/worktree-manager.js:1660',
        'scripts/hooks/concurrent-session-worktree.cjs:472',
      ],
    },
    out_of_scope_sites_audit: [
      { site: 'scripts/cancel-sd.js worktree rollback', rationale: 'Already routes through rollbackWorktreeFilesystemSync via QF-20260509-NESTED-JUNCTION nested-junction fix; covered by existing helper' },
      { site: 'scripts/orphan-qf-reaper.mjs', rationale: 'QF-specific reaper unrelated to worktree cleanup; covered by separate ORPHAN-QF reconciliation layer' },
      { site: '/ship Step 7 cleanup', rationale: 'Routes through cancel-sd path; covered transitively' },
    ],
    fr_count: 8,
    test_count_target: 8,
    loc_estimate: { src: 280, test: 120, total: 430, migration: 30 },
    quality_self_score: 8,
    confidence: 9,
  },
};

const { data, error } = await supabase
  .from('product_requirements_v2')
  .upsert(prd, { onConflict: 'id' })
  .select('id,sd_id,status,phase')
  .single();

if (error) {
  console.error('ERROR:', error);
  process.exit(1);
}
console.log('PRD INSERTED/UPSERTED:', JSON.stringify(data, null, 2));
