// QF-20260903-557 claimed via self-claim, then VERIFIED against current main before
// implementing (VERIFY-FIRST — the row was aged past the freshness window): the exact
// defect described (lib/sub-agents/testing/index.js never assigns phase5.summary to
// results.summary; generateVerdict left justification NULL on zero-tests BLOCKED
// branches) was ALREADY FIXED on main by commit 1f9ed1d17dfdcd9577bb02f87c74661730f92f2f
// ("fix(testing): a blocking verdict must state why it blocks, enforced by invariant"),
// PR #8128, merged 2026-09-03T17:33:23Z -- BEFORE this QF was minted (2026-09-03T18:12:59Z).
//
// The row's own `reason` field already carried this exact finding (Solomon plan-of-day
// 12:44Z, relayed by Adam 9718415b): "fixed by 1f9ed1d17df before it was minted; needs
// close-out with that evidence, not a build." Independently confirmed by reading
// lib/sub-agents/testing/phases/phase5-verdict.js on current main: every blocking branch
// of generateVerdict sets `justification`, and assertBlockingVerdictExplained() throws a
// blocking verdict with no justification at construction time -- the exact structural
// invariant this QF asked for. The commit deliberately did NOT take the "obvious repair"
// this QF warned against (assigning phase5.summary onto results.summary, which computes
// to the content-free "0 of 0 tests passed" string on the zero-tests branch and would have
// silently defeated the PR-8110 guard) -- confirmed no such assignment exists in
// lib/sub-agents/testing/index.js. PR #8128 shipped 22 new tests (975 passing) asserting
// the invariant fires for BLOCKED/FAIL/FAILED and is wired, not merely exported.
//
// Closing via the canonical setQuickFixStatus writer (never a raw .update()).
//
// Run once: node scripts/one-off/close-qf-20260903-557.mjs
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

const ACTOR = 'Golf (autonomous fleet worker, session 81425e08-c5b5-4fde-bafc-f0b9d5e9c349)';
const PR_URL = 'https://github.com/rickfelix/EHG_Engineer/pull/8128';
const COMMIT_SHA = '1f9ed1d17dfdcd9577bb02f87c74661730f92f2f';
const MERGE_SHA = '3b59e8170855edf1452a81e0ce56dbfd163f1259';

async function main() {
  const now = new Date().toISOString();
  const result = await setQuickFixStatus(supabase, 'QF-20260903-557', {
    status: 'completed',
    branch_name: 'fix/testing-blocking-verdict-justification',
    commit_sha: MERGE_SHA,
    pr_url: PR_URL,
    tests_passing: true,
    uat_verified: true,
    verified_by: ACTOR,
    verification_notes: 'Verified against current main before implementing (row was aged past the '
      + 'freshness window): the defect this QF describes was already fixed by commit '
      + `${COMMIT_SHA} ("fix(testing): a blocking verdict must state why it blocks, enforced by `
      + `invariant"), ${PR_URL}, merged 2026-09-03T17:33:23Z -- before this QF was minted `
      + '(2026-09-03T18:12:59Z). Confirmed on current main: every blocking branch of generateVerdict '
      + '(lib/sub-agents/testing/phases/phase5-verdict.js) now sets `justification`, and '
      + 'assertBlockingVerdictExplained() throws at construction for any BLOCKED/FAIL/FAILED verdict '
      + 'with a null/empty justification -- the structural invariant this QF asked for. The fix did '
      + 'NOT take the harmful shortcut this QF warned against (assigning phase5.summary onto '
      + 'results.summary, which would read "0 of 0 tests passed" on the zero-tests branch and '
      + 'silently defeat the PR-8110 empty-evidence guard) -- confirmed no such assignment exists in '
      + 'lib/sub-agents/testing/index.js. PR #8128 shipped 22 new tests (975 passing) exercising the '
      + 'invariant. No new implementation needed; closing out with this evidence rather than '
      + 'reimplementing a shipped fix, per the row\'s own `reason` field (Solomon plan-of-day 12:44Z, '
      + 'relayed by Adam 9718415b).',
    completed_at: now,
    disposition: 'premise_resolved',
    disposition_reason_code: 'fix_shipped; defect was already fixed by commit ' + COMMIT_SHA
      + ' (PR #8128, merged 2026-09-03T17:33:23Z) before this QF was minted -- confirmed live on '
      + 'current main; close-out only, per coordinator/Solomon plan-of-day note already on the row',
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
