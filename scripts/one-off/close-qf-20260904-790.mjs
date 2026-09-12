// QF-20260904-790 self-claimed via /checkin, then VERIFIED against current main before
// (re-)implementing (VERIFY-FIRST -- flagged needs_verify): the exact defect described
// (lib/adam/outbound-silence-watchdog.js building its live-target set from
// claude_sessions.heartbeat_at ALONE, so a dead-loop seat with a fresh heartbeat was probed
// and, on repeat, escalated at severity HIGH as a channel-health breach) was ALREADY FIXED on
// main by commit 87e047a0eddd30c79469039f518731f7b10b012d ("fix(SD-LEO-INFRA-LOOP-LIVENESS-
// DISCRIMINATOR-001): watchdog excludes dead-loop targets (FR-3)"), PR #8305, merged
// 2026-09-06 -- under a different SD, 6 days before this QF's own recorded implementation-
// start timestamp (2026-09-11T20:21:47-04:00).
//
// Independently confirmed by direct code read of lib/adam/outbound-silence-watchdog.js on
// current main: the claude_sessions query is widened to `session_id, heartbeat_at,
// last_tool_at, loop_state, metadata` (the code's own comment cites "QF-20260904-790 FR-3" by
// name), a DEAD-LOOP set is computed via classifyLoopLiveness and excluded from liveIds before
// any probing/escalation, and — beyond this QF's own ask — a SECURITY-hardened
// `deadLoopSuppressed` array makes the suppression itself observable rather than silent (a
// harder bar than this QF requested: "not probed, not escalated ... surfaced as a seat-
// liveness signal"). tests/unit/adam/outbound-silence-watchdog.test.js names this exact QF in
// 3 passing test titles (lines 220, 239, 259) plus a SEC-3 control test; full suite 19/19
// passing on current main.
//
// Closing via the canonical setQuickFixStatus writer (never a raw .update()).
//
// Run once: node scripts/one-off/close-qf-20260904-790.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const { setQuickFixStatus } = require('../../lib/quick-fix/status-writer.cjs');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ACTOR = 'Alpha-2 (autonomous fleet worker, session 689a1237-33b7-406f-9772-668958b289d6)';
const PR_URL = 'https://github.com/rickfelix/EHG_Engineer/pull/8305';
const COMMIT_SHA = '87e047a0eddd30c79469039f518731f7b10b012d';

async function main() {
  const now = new Date().toISOString();
  const result = await setQuickFixStatus(supabase, 'QF-20260904-790', {
    status: 'completed',
    branch_name: 'feat/SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001',
    commit_sha: COMMIT_SHA,
    pr_url: PR_URL,
    tests_passing: true,
    uat_verified: true,
    verified_by: ACTOR,
    verification_notes: 'Verified against current main before implementing (row was flagged '
      + 'needs_verify by the check-in handshake, "in_progress" with an implementation-started '
      + 'timestamp of 2026-09-11T20:21:47-04:00 but no code changes on disk): the defect this QF '
      + `describes was already fixed by commit ${COMMIT_SHA} (PR #8305, `
      + '"fix(SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001): watchdog excludes dead-loop targets '
      + '(FR-3)"), merged 2026-09-06, 6 days before this QF\'s own recorded start time, under a '
      + 'different SD. Confirmed on current main: lib/adam/outbound-silence-watchdog.js widens '
      + 'its claude_sessions query to include last_tool_at/loop_state/metadata (the code comment '
      + 'names "QF-20260904-790 FR-3" by id), computes a DEAD-LOOP set via classifyLoopLiveness, '
      + 'and excludes it from liveIds before probing/escalation -- plus a SECURITY-hardened '
      + 'deadLoopSuppressed observability array exceeding this QF\'s own ask. '
      + 'tests/unit/adam/outbound-silence-watchdog.test.js names this exact QF in 3 test titles '
      + '(lines 220, 239, 259); full suite 19/19 passing. No new implementation needed; closing '
      + 'out with this evidence rather than reimplementing a shipped fix.',
    completed_at: now,
    disposition: 'premise_resolved',
    disposition_reason_code: 'fix_shipped; defect was already fixed by commit ' + COMMIT_SHA
      + ' (PR #8305, SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001, merged 2026-09-06, same '
      + 'parent SD as sibling QF-20260904-650/FR-2) 6 days before this QF\'s own start timestamp '
      + '-- confirmed live on current main by direct code read and full test suite pass (19/19); '
      + 'the superseding SD\'s own test suite names this QF by id in 3 places',
    disposed_by: ACTOR,
    disposed_at: now,
  }, { logger: console, fromStatus: 'in_progress' });
  console.log('CLOSED:', JSON.stringify(result));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
