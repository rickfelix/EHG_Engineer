#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- fixes for the LEAD-TO-PLAN VALIDATION review
 * (row 22b5dac7-a3b2-4d15-8b6c-b3bf497040a2, CONDITIONAL_PASS).
 *
 * F1: strategic_objectives[0] still listed "quiet hours" among guards that "still apply"
 *     (pre-existing), missed by the earlier scope/key_changes/risks correction pass.
 * F3 (substantive): the quiet-hours mechanism citation named resolveAllowQuietHours (the
 *     CHAIRMAN-OVERRIDE resolver) and smsQuietWindowReleaseIso (a release-TIME helper) but
 *     never the actual in-window PREDICATE, isSmsQuietHour (chairman-et-wall-clock.js:138).
 *     Following the original citations literally risks shipping an inverted guard (treating
 *     the override resolver as the gate itself). Corrected to name the real composition
 *     already used elsewhere in this repo: `if (!allowQuietHours && isSmsQuietHour(now, zone))`
 *     (verified live at scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:339).
 * F4: smoke_test_steps had no quiet-hours step despite it being the only newly-wired
 *     mechanism and the SD's only medium-likelihood risk. Added one, including the exact
 *     06:00 ET boundary VALIDATION flagged (`hour >= 22 || hour < 6` -- the boundary sits at
 *     exactly the 06:00 fixed window).
 * F5: success_criteria[].measure were all the literal placeholder "[UNPOPULATED]".
 * key_changes[0] line-precision nit: the inWindow return is at :116, not :113 alone.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('strategic_objectives, key_changes, success_criteria, smoke_test_steps, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  // F1
  const strategic_objectives = [
    "Serve chairman ratification eb7e84b3 ('Michael should be able to send messages outside of the regular frequency slots. I authorize it') with an on-demand send path that reuses every existing fail-closed guard (recipient pin, identity, enable/disable, daily cap) and NEWLY wires a quiet-hours guard that does not yet exist in checkpoint-send.mjs (LEAD-phase Explore/VALIDATION finding).",
    "Fix the finished_at race Michael's own first live text exposed (ledger a8388820, 2026-09-14 22:00:03Z) so no future checkpoint text silently drops or misdates a feeder's counts.",
  ];

  // F3 + line-precision nit
  const key_changes = sdRow.key_changes.map((kc) => {
    if (kc.change.startsWith('Add an on-demand send path')) {
      return {
        ...kc,
        change: kc.change.replace('bypasses the fixed-window check at line 113', 'bypasses the fixed-window check at lines 113-116 (`if`/`return`)'),
      };
    }
    if (kc.change.startsWith('Wire a quiet-hours check')) {
      return {
        ...kc,
        change: "Wire a quiet-hours check into checkpoint-send.mjs's new on-demand path, using the SAME composition already live elsewhere in this repo -- `if (!allowQuietHours && isSmsQuietHour(now, chairmanZone)) return refusal('QUIET_HOURS', ...)` (verified live at scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:339) -- NOT resolveAllowQuietHours alone (that's the chairman-override resolver, not the gate) and NOT smsQuietWindowReleaseIso alone (that only computes a release timestamp for an already-detected quiet window). The actual in-window predicate is isSmsQuietHour (lib/time/chairman-et-wall-clock.js:138: `hour >= SMS_QUIET_START_HOUR || hour < SMS_QUIET_END_HOUR`, i.e. hour>=22 or hour<6) -- a citation naming the override resolver instead of this predicate risks an inverted guard (LEAD-TO-PLAN VALIDATION finding F3, confirmed by direct read). Confirmed by LEAD-phase Explore: checkpoint-send.mjs currently has ZERO references to quiet hours anywhere in its 254 lines -- the fixed 4 windows (06:00/10:00/14:00/18:00 ET) never fall inside 22:00-06:00 by construction (though 06:00 sits exactly on the boundary: the predicate is `hour>=22 || hour<6`, so hour===6 is NOT quiet -- worth a pinned boundary test), so this gap has never been exercised, but an arbitrary-minute on-demand invocation can.",
      };
    }
    return kc;
  });

  // F5
  const measureByCriterion = {
    "With a feeder run in flight at send time, the text uses the latest finished run for that feeder, never the placeholder (unit test reproducing the 2026-09-14 22:00Z race).": "A unit test seeding an in-flight row (finished_at NULL) plus an older finished row for the same feeder/et_date asserts the composed body uses the finished row's counts, never the in-flight placeholder.",
    "A feeder with no finished run today appears in the text as not yet run; no feeder disappears silently.": "A unit test with zero rows for one feeder asserts the composed body names that feeder as 'no run yet today' rather than omitting it from the text.",
    "The as-of reads in plain ET, and there is no raw ISO string in any body.": "A unit test asserting composeCheckpointBody's output matches a plain-ET pattern (e.g. /as of \\d{1,2}:\\d{2}(am|pm) ET/i) and does NOT match an ISO-8601 pattern.",
    "An on-demand send outside the windows delivers one text through Michael's identity, writes a ledger row marked on-demand, and refuses on pin mismatch, disabled, daily cap reached, or quiet hours.": "Five unit tests: on-demand success outside any fixed window; refusal on pin mismatch; refusal when disabled; refusal at cap; refusal inside the 22:00-06:00 ET quiet window (isSmsQuietHour composition), each asserting the specific refusal_code.",
    "The fixed-window behaviour and its existing tests are unchanged.": "The pre-existing checkpoint-send.test.js suite (fixed-window inert/dry-run/cap/pin/identity/dedup cases) passes unmodified after this SD's changes, proving no regression to the fixed-window path.",
  };
  const success_criteria = sdRow.success_criteria || [];
  const success_criteria_fixed = success_criteria.map((sc) => ({
    ...sc,
    measure: measureByCriterion[sc.criterion] || sc.measure,
  }));

  // F4
  const smoke_test_steps = [
    ...sdRow.smoke_test_steps,
    {
      step_number: 4,
      instruction: "Invoke the new on-demand send path at an ET minute-of-day inside 22:00-06:00 (e.g. 23:00 ET), with every other guard valid (enabled=true, pin matches, cap not exceeded)",
      expected_outcome: "The send refuses with a QUIET_HOURS-class refusal_code (composing `!allowQuietHours && isSmsQuietHour(now, zone)`, matching the live pattern at scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:339) -- and separately, at exactly 06:00 ET (the boundary the 4th fixed window sits on), the send does NOT refuse on quiet hours (isSmsQuietHour's predicate is hour>=22 || hour<6, so hour===6 is not quiet)",
    },
  ];

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ strategic_objectives, key_changes, success_criteria: success_criteria_fixed, smoke_test_steps })
    .eq('sd_key', SD_KEY);
  if (updErr) throw updErr;
  console.log('FIXED F1/F3/F4/F5 for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
