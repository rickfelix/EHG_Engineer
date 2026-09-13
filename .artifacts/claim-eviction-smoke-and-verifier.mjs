import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-FIX-CLAIM-EVICTION-001';
const { data: sd, error: readErr } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
if (readErr) throw readErr;

// SMOKE_TEST_SPECIFICATION_FAILED remediation: replace the generic auto-generated
// placeholder with a real LEAD Q9 30-second demo. Each step is independently
// runnable against this SD's actual deliverable (the claim_sd migration +
// worker-checkin self-claim guard), not a restatement of the scope prose.
const smoke_test_steps = [
  {
    step_number: 1,
    instruction: "Claim a quick_fixes row as session A with no pr_url/commit_sha set, then from session B call claim_sd to claim a DIFFERENT item (triggering A's eviction path on the first row).",
    expected_outcome: "The evicted quick_fixes row's status flips to 'open' and claiming_session_id is NULL in the SAME statement that cleared the claim -- query the row immediately after and see status='open', not the pre-fix 'in_progress'/NULL orphan shape."
  },
  {
    step_number: 2,
    instruction: "Repeat step 1, but first set pr_url on the quick_fixes row being evicted (simulating real shipped work), then trigger the eviction from session B.",
    expected_outcome: "claim_sd returns a refusal code and the row is untouched (status and claiming_session_id unchanged) -- the eviction does not fire against a row carrying real work."
  },
  {
    step_number: 3,
    instruction: "With session C already holding a live claim (SD or QF) via the DB, run worker-checkin.cjs's self-claim path for session C against an unrelated open SD/QF.",
    expected_outcome: "Session C does NOT self-claim the second item from any of the three producer steps (critical-qf-jump, merged-pool-self-claim, self-claim-qf) -- getMyClaims(supabase, 'C') already reports a live claim, so self-claim is skipped in all three, not just one."
  },
  {
    step_number: 4,
    instruction: "Run the existing QF-20260912-961 regression suite (stale-session-sweep-workitem-handback.test.js and sibling tests covering LEO_RELEASE_WORKITEM_RESET and the quick_fixes phantom-in_progress detector).",
    expected_outcome: "All QF-961 tests still pass unmodified -- LEO_RELEASE_WORKITEM_RESET still defaults ON ('off' is the only kill switch) and the quick_fixes phantom-in_progress detector still delegates to releaseWorkItemOnSessionEnd() with no duplicated reopen logic."
  },
  {
    step_number: 5,
    instruction: "Query the audit/log sink (session_lifecycle_events or the structured event this SD's migration emits) for the eviction performed in step 1.",
    expected_outcome: "A structured event row exists recording the eviction-with-reset (or, for step 2, the eviction-refusal), queryable after the fact -- verification never relies on a standing orphan-row COUNT (the live count is already 0 regardless of whether the fix is present)."
  }
];

// MECHANISM_CLAIM_UNVERIFIED remediation: the spine (scope field, written during the
// LEAD correction) asserts a mechanism about QF-20260912-961's already-shipped parts
// (a)/(b) -- lib/fleet/release-work-item.mjs and scripts/stale-session-sweep.cjs. Both
// claims independently verified live, right now, by reading the actual source (not
// trusted from the originating ticket or from QF-961's own PR description):
//   - lib/fleet/release-work-item.mjs:134 -- `return env.LEO_RELEASE_WORKITEM_RESET !== 'off';`
//     confirms the flag defaults ON (any value other than the literal string 'off' keeps
//     the reset path live).
//   - scripts/stale-session-sweep.cjs:3113-3114 -- the quick_fixes phantom-in_progress
//     detector destructures and calls `releaseWorkItemOnSessionEnd` from
//     lib/fleet/release-work-item.mjs, confirming the delegation (no duplicated reopen
//     predicate) asserted in the scope text.
const mechanism_verifications = [
  {
    verified_by: 'Alpha-3 (session 961a30d3-1a94-4f10-8b06-b48fa2306361)',
    verified_at: 'lib/fleet/release-work-item.mjs:134',
    note: "return env.LEO_RELEASE_WORKITEM_RESET !== 'off' -- confirms the flag defaults ON, matching the scope's claim about QF-20260912-961 part (a)."
  },
  {
    verified_by: 'Alpha-3 (session 961a30d3-1a94-4f10-8b06-b48fa2306361)',
    verified_at: 'scripts/stale-session-sweep.cjs:3113',
    note: "const { releaseWorkItemOnSessionEnd: releasePhantomQf } = await import('../lib/fleet/release-work-item.mjs') -- confirms the quick_fixes phantom-in_progress detector delegates to the shared helper, matching the scope's claim about QF-20260912-961 part (b)."
  }
];

const metadata = {
  ...sd.metadata,
  mechanism_verifications
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps, metadata })
  .eq('sd_key', SD_KEY);
if (writeErr) throw writeErr;
console.log('SD-LEO-INFRA-FIX-CLAIM-EVICTION-001: smoke_test_steps + mechanism_verifications applied.');
