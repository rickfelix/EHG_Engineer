/**
 * Insert user_stories for SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 PRD.
 * STORIES sub-agent auto-invocation failed twice during PRD creation — manual fallback.
 * One story per FR-N (8 stories, all with implementation_context for BMAD ≥80% rule).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const KEY = 'SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001';
const SD_ID = '9d966989-c8d8-47f4-9eba-ee8056a829d1';
const PRD_ID = 'PRD-9d966989-c8d8-47f4-9eba-ee8056a829d1';

const stories = [
  {
    story_key: `${KEY}:US-001`,
    title: 'PLAN database-agent enumerates triggers + reproduces PATH D bug (FR-1)',
    description: 'As LEAD, I need empirical evidence of the actual root cause before EXEC commits to a fix surface. database-agent enumerates ALL triggers on sd_v2 + sister tables + claude_sessions, queries pg_proc for live function bodies, and reproduces the bug under controlled conditions.',
    acceptance_criteria: [
      'Trigger enumeration JSON exists at .worktrees/<SD>/rca-fr1-out.clean.json',
      'PATH D reproduced: UPDATE claude_sessions SET status=stale → sd_v2 claim cols cleared',
      'PATH A disproven: UPDATE sd_v2 SET description=... preserves all claim cols',
      'database-agent evidence row PASS @ ≥85 confidence'
    ],
    implementation_context: {
      technical_approach: 'Direct pg_catalog queries via scripts/lib/supabase-connection.js::createDatabaseClient. Trigger enumeration via pg_trigger JOIN pg_class JOIN pg_proc. Live function bodies via pg_proc.prosrc. Reproduction via UPDATE claude_sessions then SELECT sd_v2.',
      files_to_create: ['scripts/one-off/_db-agent-fr1-rca-trigger-enumeration.mjs', 'scripts/one-off/_db-agent-fr1-rca-reproduce-bug-2.mjs', 'rca-fr1-out.clean.json'],
      files_to_modify: [],
      dependencies: ['scripts/lib/supabase-connection.js'],
      estimated_effort: 'COMPLETE — done at PLAN phase via database-agent (evidence fabb2c47)'
    },
    status: 'completed'
  },
  {
    story_key: `${KEY}:US-002`,
    title: 'Surgical CREATE OR REPLACE on sync_is_working_on_with_session trigger (FR-2)',
    description: 'As EXEC, I write a migration that modifies the AFTER UPDATE trigger function on claude_sessions to fire its claim-clearing branch ONLY on irrevocable transitions (sd_key→NULL, status→released/completed) — NOT on recoverable status=stale.',
    acceptance_criteria: [
      'Migration file at database/migrations/<date>_sync_is_working_on_preserve_recoverable_stale.sql exists',
      'CREATE OR REPLACE FUNCTION (idempotent)',
      'Migration ends with NOTIFY pgrst, reload schema',
      'CAS guard active_session_id = OLD.session_id present in UPDATE WHERE clause',
      'Backward-compat: UPDATE status=released still clears claim cols (irrevocable transition)',
      'cleanup_stale_sessions Block 3 (30s grace) still works — verified via integration test'
    ],
    implementation_context: {
      technical_approach: 'CREATE OR REPLACE FUNCTION sync_is_working_on_with_session() with new IF block. Original function body captured in rca-fr1-out.clean.json (database-agent FR-1 evidence). New conditional: IF (OLD.sd_key IS NOT NULL AND NEW.sd_key IS NULL) OR (OLD.status=active AND NEW.status IN (released, completed) AND OLD.sd_key IS NOT NULL) THEN clear. Recoverable stale: do nothing (return NEW). NOTIFY pgrst at end of migration in same transaction.',
      files_to_create: ['database/migrations/<YYYYMMDD>_sync_is_working_on_preserve_recoverable_stale.sql'],
      files_to_modify: [],
      dependencies: ['rca-fr1-out.clean.json (FR-1 evidence baseline)'],
      estimated_effort: '~1 hour — migration is ~30 lines SQL + comments'
    },
    status: 'draft'
  },
  {
    story_key: `${KEY}:US-003`,
    title: 'Heartbeat keep-alive subprocess in sd-start.js (FR-3 defense-in-depth)',
    description: 'As an active LEO session, my sd-start.js spawns a detached subprocess that pings claude_sessions.heartbeat_at every 60s. Eliminates cleanup_stale_sessions trigger condition for in-flight sessions during long sub-agent execution.',
    acceptance_criteria: [
      'scripts/lib/heartbeat-keepalive.mjs exists with fork-detach pattern',
      'sd-start.js spawns keep-alive after successful claim_sd RPC',
      'PID file at .claude/pids/heartbeat-<session-id>.pid',
      'SIGTERM/SIGHUP handlers gracefully exit + delete pidfile',
      'Configurable interval via env LEO_HEARTBEAT_INTERVAL_SEC (default 60)',
      'Empirical test (integration): claim SD, wait 150s without external refresh, status STILL active',
      'Re-run sd-start: detect existing PID, kill stale keep-alive, spawn fresh'
    ],
    implementation_context: {
      technical_approach: 'child_process.fork(scripts/lib/heartbeat-keepalive.mjs, {detached:true, stdio:ignore}).unref(). Keep-alive runs setInterval(updateHeartbeat, intervalSec*1000). PID lifecycle: write on spawn, delete on graceful exit. Pattern source: scripts/lib/lifecycle/sd-claim-reaper.mjs detached-fork pattern. Env: LEO_HEARTBEAT_INTERVAL_SEC=60 default. Disable via LEO_HEARTBEAT_KEEPALIVE_DISABLED=true (for tests).',
      files_to_create: ['scripts/lib/heartbeat-keepalive.mjs', 'tests/unit/heartbeat-keepalive/lifecycle.test.js', 'tests/unit/heartbeat-keepalive/interval.test.js', 'tests/unit/heartbeat-keepalive/respawn.test.js'],
      files_to_modify: ['scripts/sd-start.js'],
      dependencies: ['child_process (Node built-in)', 'scripts/lib/supabase-connection.js'],
      estimated_effort: '~2 hours — keep-alive + sd-start integration + 3 unit tests'
    },
    status: 'draft'
  },
  {
    story_key: `${KEY}:US-004`,
    title: 'Regression-pin static guard test on trigger body (FR-4)',
    description: 'As EXEC, I write a vitest test that reads the FR-2 migration file via fs.readFileSync + regex assertions to detect future regressions of the trigger body (e.g., someone removes released/completed from IF block, or removes NOTIFY pgrst, or weakens CAS guard).',
    acceptance_criteria: [
      'tests/unit/migrations/sync-is-working-on-trigger-static-pin.test.js exists',
      '4 regex assertions: (a) IF block contains released AND completed, (b) IF block does not contain stale-only-clear, (c) UPDATE has CAS active_session_id = OLD.session_id, (d) NOTIFY pgrst at end',
      'Test PASSES on FR-2 migration as written',
      'Inject regression: remove released/completed → test FAILS with clear message',
      'Run via vitest in CI'
    ],
    implementation_context: {
      technical_approach: 'fs.readFileSync of migration .sql file + 4 regex assertions. Pattern source: SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 PR #3693 dual-anchor static-pin. Mocking-independent.',
      files_to_create: ['tests/unit/migrations/sync-is-working-on-trigger-static-pin.test.js'],
      files_to_modify: [],
      dependencies: ['vitest'],
      estimated_effort: '~30 min — ~80 LOC test'
    },
    status: 'draft'
  },
  {
    story_key: `${KEY}:US-005`,
    title: 'Audit trail to session_lifecycle_events on stale-flag transitions (FR-5)',
    description: 'As an observability operator, I can query session_lifecycle_events to see which sessions had their claim cleared, when, and whether the trigger was on a recoverable or irrevocable transition. Powers future RCA and validates FR-3 keep-alive efficacy.',
    acceptance_criteria: [
      'session_lifecycle_events table CREATE TABLE IF NOT EXISTS in FR-2 migration',
      'Trigger INSERTs audit row on every fire',
      'payload.claim_cleared accurately reflects which branch ran',
      'Indexed on (session_id, created_at) and (sd_key, created_at)',
      'Empirical test: trigger fire → row appears in session_lifecycle_events with correct payload'
    ],
    implementation_context: {
      technical_approach: 'CREATE TABLE IF NOT EXISTS session_lifecycle_events (id BIGSERIAL PK, session_id UUID, sd_key TEXT, event_type TEXT, old_status TEXT, new_status TEXT, claim_cleared BOOL, payload JSONB, created_at TIMESTAMPTZ DEFAULT NOW()) in same migration as FR-2. Trigger function INSERTs after computing whether to clear (so claim_cleared boolean is accurate). EXCEPTION handler ensures audit failure does not block trigger itself.',
      files_to_create: [],
      files_to_modify: ['database/migrations/<YYYYMMDD>_sync_is_working_on_preserve_recoverable_stale.sql (combined with FR-2)'],
      dependencies: ['FR-2 migration'],
      estimated_effort: '~30 min — table DDL + trigger INSERT clause'
    },
    status: 'draft'
  },
  {
    story_key: `${KEY}:US-006`,
    title: 'Test suite — 12 cases / 5 distinct types (FR-6)',
    description: 'As EXEC, I write 12 vitest cases covering FR-2 + FR-3 + FR-4 + FR-5: 6 unit (trigger logic shape, keep-alive lifecycle), 3 integration (real DB round-trip — PATH D fix, irrevocable still clears, CAS guard, audit row), 3 static-pin (FR-4 + 2 additional). Per LEAD testing-agent R-3.',
    acceptance_criteria: [
      '12 of 12 tests PASS in vitest',
      '6 unit + 3 integration + 3 static-pin distribution',
      '1 consumer-side verification (sd-start CLAIMED detection)',
      'Tests run in CI on PR open',
      'Integration tests skipped in sandboxed CI (run in post-merge per FR-8)'
    ],
    implementation_context: {
      technical_approach: 'Unit tests use vi.spyOn(supabase) + assertions on call shape. Integration tests use real Supabase service-role + INSERT/UPDATE/SELECT round-trips against probe SD + probe session. Static-pin tests use fs.readFileSync + regex on migration .sql + trigger fn body. Consumer-side test: spawn 2 sessions, first claims, status flips to stale, verify second sd-start reports CLAIMED correctly.',
      files_to_create: ['tests/integration/cascade-trigger-overreach/path-d-fix.test.js', 'tests/integration/cascade-trigger-overreach/irrevocable-clears.test.js', 'tests/integration/cascade-trigger-overreach/cas-guard.test.js', 'tests/integration/cascade-trigger-overreach/audit-trail.test.js', 'tests/integration/cascade-trigger-overreach/consumer-side.test.js'],
      files_to_modify: [],
      dependencies: ['vitest', 'scripts/lib/supabase-connection.js'],
      estimated_effort: '~3 hours — 12 tests with setup/teardown'
    },
    status: 'draft'
  },
  {
    story_key: `${KEY}:US-007`,
    title: 'Documentation: CLAUDE_LEAD.md + canonical-write-paths.md hygiene (FR-7)',
    description: 'As future-LEAD, I can read the disproof lesson in CLAUDE_LEAD.md so I do not misdiagnose similar cascade-timing illusions. As governance maintainer, I can read docs/reference/canonical-write-paths.md to see strategic_directives_v2 listed with its 6 exempt_writers (handoff.js, sd-start.js, etc).',
    acceptance_criteria: [
      'CLAUDE_LEAD.md harness-fix cadence section updated with disproof lesson + cross-reference to this SD',
      'docs/reference/canonical-write-paths.md row exists for strategic_directives_v2 with 6 exempt_writers',
      'tests/unit/governance/canonical-helper-bypass-guard.test.js still PASSES (zero new violations introduced by registry update)'
    ],
    implementation_context: {
      technical_approach: 'CLAUDE_LEAD.md: append paragraph to harness-fix cadence section. canonical-write-paths.md: add row with exempt_writers JSON list per existing pattern (lib/governance/emit-feedback.js + lib/security/audit-events-emitter.js precedents). Run existing canonical-helper-bypass-guard.test.js to verify zero new violations.',
      files_to_create: [],
      files_to_modify: ['CLAUDE_LEAD.md', 'docs/reference/canonical-write-paths.md'],
      dependencies: ['existing tests/unit/governance/canonical-helper-bypass-guard.test.js'],
      estimated_effort: '~30 min — docs only'
    },
    status: 'draft'
  },
  {
    story_key: `${KEY}:US-008`,
    title: 'Post-merge smoke runner verify-claim-col-preservation.mjs (FR-8)',
    description: 'As CI, I emit [SD_CLAIM_COL_PRESERVATION_VERIFIED] audit marker ~3min after PR merges to main, asserting the FR-2 fix works against live DB. Covers sandbox-blocked migration scenarios.',
    acceptance_criteria: [
      'scripts/smoke/verify-claim-col-preservation.mjs exists',
      'Spawns probe session, claims probe SD, simulates stale flip, asserts preservation',
      'Emits [SD_CLAIM_COL_PRESERVATION_VERIFIED] OR [SD_CLAIM_COL_PRESERVATION_DEGRADED] audit marker',
      'Cleans up probe rows in finally block',
      '.github/workflows/post-merge-cascade-fix-verify.yml wired (or manual post-merge invocation)'
    ],
    implementation_context: {
      technical_approach: 'Smoke runner: INSERT temp claude_sessions row, claim_sd RPC on probe SD-key, UPDATE status=stale, SELECT sd_v2 claim cols, assert preserved, DELETE temp rows. Audit marker via console.log line scanned by CI. Pattern source: PR #3691 [LFA_GRACEFUL_DEGRADE_TO_ACCEPTED] graceful-degrade marker.',
      files_to_create: ['scripts/smoke/verify-claim-col-preservation.mjs', '.github/workflows/post-merge-cascade-fix-verify.yml'],
      files_to_modify: [],
      dependencies: ['scripts/lib/supabase-connection.js', 'GitHub Actions'],
      estimated_effort: '~1 hour — smoke runner + CI workflow YAML'
    },
    status: 'draft'
  }
];

const rows = stories.map((s, idx) => {
  // Map: description → reuse as user_want (As X I want Y); skip description col which doesn't exist
  const { description, ...rest } = s;
  return {
    ...rest,
    user_role: 'EXEC engineer / LEAD reviewer',
    user_want: description.substring(0, 500),
    user_benefit: 'Eliminate cascade-trigger claim-loss class — long sub-agent runs no longer break handoff.js',
    given_when_then: description.substring(0, 1000),
    prd_id: PRD_ID,
    sd_id: SD_ID,
    priority: 'high',
    story_points: 3
  };
});

const { data, error } = await supabase.from('user_stories').insert(rows).select('story_key, status');
if (error) { console.error('INSERT err:', JSON.stringify(error, null, 2)); process.exit(1); }
console.log('Inserted', data.length, 'user stories:');
for (const s of data) console.log(' -', s.story_key, '| status:', s.status);

// Verify implementation_context present (BMAD ≥80% requirement)
const { data: verify } = await supabase
  .from('user_stories')
  .select('story_key, implementation_context')
  .eq('prd_id', PRD_ID);
const withContext = verify.filter(s => s.implementation_context && Object.keys(s.implementation_context).length > 0).length;
console.log(`\nimplementation_context coverage: ${withContext}/${verify.length} = ${Math.round(withContext/verify.length*100)}% (BMAD ≥80% requirement)`);
