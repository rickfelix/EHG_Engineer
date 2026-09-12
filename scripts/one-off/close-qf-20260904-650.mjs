// QF-20260904-650 self-claimed via /checkin, then VERIFIED against current main before
// (re-)implementing (VERIFY-FIRST -- flagged needs_verify by the check-in handshake): the
// exact defect described (scripts/lib/engagement-buckets.mjs classifySessionBucket returning
// ENGAGED for a claimed, live-heartbeat, tool-frozen session because the `isClaimed` return
// preceded the `wedged` check) was ALREADY FIXED on main by commit
// 45bdc6e0e45a7506129146d6b41989dd103a5a0f ("fix(SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001):
// ZOMBIE outranks ENGAGED for a wedged claim (FR-2)"), PR #8305, merged 2026-09-06T02:15:35Z --
// under a DIFFERENT SD than this QF, 6 days before this QF's own "Started" implementation
// timestamp (2026-09-11T20:14:29-04:00) recorded by whichever session began work on it today.
//
// Independently confirmed by direct code read of scripts/lib/engagement-buckets.mjs on current
// main: `wedged` is checked (`if (wedged) return 'ZOMBIE';`) BEFORE the `isClaimed` ENGAGED
// return, exactly mirroring lib/fleet/genuine-worker.mjs's liveFleetWorkers filter, exactly as
// this QF's own "FIX SHAPE: MOVE ONE BRANCH" section prescribed. The negative test this QF's
// own text named as the one that "would have caught this" already exists verbatim in
// tests/unit/engagement-buckets.test.js line 136, titled "CORRECTED DEFECT (QF-20260904-650): a
// LIVE, claimed, tool-frozen session classifies ZOMBIE, never ENGAGED" -- the superseding SD's
// own test suite cites this exact QF by id. Ran the full suite: 45/45 passing on current main,
// including that test and the companion reproduction test at line 151 (3 live+idle beside 3
// live+claimed+wedged -> zombie=3, never zombie=0, matching this QF's own measured 09-04 report
// shape).
//
// Closing via the canonical setQuickFixStatus writer (never a raw .update()).
//
// Run once: node scripts/one-off/close-qf-20260904-650.mjs
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
const COMMIT_SHA = '45bdc6e0e45a7506129146d6b41989dd103a5a0f';

async function main() {
  const now = new Date().toISOString();
  const result = await setQuickFixStatus(supabase, 'QF-20260904-650', {
    status: 'completed',
    branch_name: 'feat/SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001',
    commit_sha: COMMIT_SHA,
    pr_url: PR_URL,
    tests_passing: true,
    uat_verified: true,
    verified_by: ACTOR,
    verification_notes: 'Verified against current main before implementing (row was flagged '
      + 'needs_verify by the check-in handshake, "in_progress" with an implementation-started '
      + 'timestamp of 2026-09-11T20:14:29-04:00 but no code changes on disk): the defect this QF '
      + `describes was already fixed by commit ${COMMIT_SHA} (PR #8305, `
      + '"fix(SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001): ZOMBIE outranks ENGAGED for a wedged '
      + 'claim (FR-2)"), merged 2026-09-06T02:15:35Z -- 6 days before this QF\'s own recorded start '
      + 'time, under a different SD. Confirmed on current main: scripts/lib/engagement-buckets.mjs '
      + 'classifySessionBucket checks `if (wedged) return \'ZOMBIE\';` BEFORE the isClaimed ENGAGED '
      + 'return, exactly the one-branch move this QF prescribed, mirroring liveFleetWorkers\' '
      + '!isKnownWedged filter. tests/unit/engagement-buckets.test.js:136 is titled "CORRECTED '
      + 'DEFECT (QF-20260904-650): a LIVE, claimed, tool-frozen session classifies ZOMBIE, never '
      + 'ENGAGED" -- the superseding SD\'s own test suite names this exact QF. Full suite: 45/45 '
      + 'passing, including that test and the line-151 reproduction of this QF\'s own measured '
      + '09-04 report shape (3 live+idle beside 3 live+claimed+wedged -> zombie=3). No new '
      + 'implementation needed; closing out with this evidence rather than reimplementing a '
      + 'shipped fix.',
    completed_at: now,
    disposition: 'premise_resolved',
    disposition_reason_code: 'fix_shipped; defect was already fixed by commit ' + COMMIT_SHA
      + ' (PR #8305, SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001, merged 2026-09-06T02:15:35Z) '
      + '6 days before this QF\'s own start timestamp -- confirmed live on current main by direct '
      + 'code read and full test suite pass (45/45); the superseding SD\'s own test at '
      + 'engagement-buckets.test.js:136 names this QF by id',
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
