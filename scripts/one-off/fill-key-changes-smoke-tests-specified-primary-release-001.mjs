import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const key_changes = [
  {
    change: 'scripts/release-oracle-hold.js + lib/fleet/hold-writer.js: lookupConsultRowRecord() resolves a cited consult row from session_coordination first, retention_archive second (FR-1)',
    impact: 'A consult row deleted by cleanup_expired_coordination (1h after creation) no longer forces every release through --force -- the archived row\'s created_at drives the same bounded-wait computation a live row\'s would',
  },
  {
    change: 'scripts/cron/batch-mint-sweep.mjs: openConsultRow() stamps a correlation_id on every new consult row; a chairman-gated migration registers oracle_read_pending_consult in role_drain_sets for solomon (FR-2)',
    impact: 'A consult row can now be replied to, and Solomon\'s inbox stops flagging every one as an orphan',
  },
  {
    change: 'scripts/cron/batch-mint-sweep.mjs: new checkVerdictsAndRelease() runs on every existing tick, checking every currently-held QF for a matching Solomon reply and releasing immediately (tagged solomon-verdict) via the existing release functions (FR-3)',
    impact: 'The specified PRIMARY release path now functions for the first time in this mechanism\'s history -- a recorded verdict releases before the 30-minute timer, not just the degraded fallback',
  },
  {
    change: 'lib/fleet/hold-writer.js: releaseQfOracleHold() now accepts and persists consultRowId/consultRowCreatedAt/releasedBy into verification_notes; the consult message no longer conflates the batch-window anchor with the release timer\'s real anchor (FR-4)',
    impact: 'The degraded-release audit trail the spec requires is no longer dead by construction on QF holds, and a documented false-early-release retry loop cannot recur',
  },
  {
    change: 'scripts/one-off/backfill-terminal-oracle-hold-markers.mjs: one-time backfill (dry-run default, snapshot + --restore) clearing the stale oracle-hold marker on already-terminal QFs -- run live against production during EXEC (FR-5)',
    impact: '7 real terminal QFs (QF-20260901-023/-259, QF-20260902-724/-824, QF-20260903-052/-469, QF-20260904-868) had their stale marker cleared; idempotent re-run confirms 0 remaining',
  },
  {
    change: 'scripts/oracle-hold-orphaned-marker-exit-predicate-check.mjs + .github/workflows/oracle-hold-orphaned-marker-exit-predicate-check.yml: new daily-scheduled CI check asserting zero oracle-held QFs cite a consult row absent from both session_coordination and retention_archive (FR-6)',
    impact: 'A future regression of this defect class is caught by CI rather than discovered live months later',
  },
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run the 5 extended/new test files: tests/unit/scripts/release-oracle-hold.test.js, tests/unit/fleet/hold-writer.test.js, tests/unit/scripts/batch-mint-sweep.test.js, tests/unit/one-off/backfill-terminal-oracle-hold-markers.test.js, tests/unit/scripts/oracle-hold-orphaned-marker-exit-predicate-check.test.js',
    expected_outcome: 'All 67 tests pass, including the new FR-1 archive-fallback and FR-3 verdict-release fixtures',
  },
  {
    step_number: 2,
    instruction: 'Query lookupConsultRowRecord() against a real archived consult row (e.g. 0b79e160-8589-4511-b84e-069191b20d45, cited by QF-20260903-052/-469)',
    expected_outcome: 'Resolves created_at from retention_archive.row_data since the row is no longer live -- verified live during EXEC',
  },
  {
    step_number: 3,
    instruction: 'Run node scripts/cron/batch-mint-sweep.mjs against the live database',
    expected_outcome: 'Completes with no errors, printing both "held=N" (existing detector output) and the new "verdict-check: checked=N released=N failed=N" line -- verified live during EXEC (checked=0/released=0/failed=0, since the FR-5 backfill had already cleared all pre-existing holds)',
  },
  {
    step_number: 4,
    instruction: 'Run node scripts/oracle-hold-orphaned-marker-exit-predicate-check.mjs against the live database',
    expected_outcome: 'PASS: zero orphaned markers -- verified live during EXEC',
  },
];

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, smoke_test_steps })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD key_changes and smoke_test_steps filled with real content.');
