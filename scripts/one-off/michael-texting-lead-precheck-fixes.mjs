#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- LEAD-TO-PLAN precheck fixes:
 * real smoke_test_steps + mechanism_verifications metadata for every file:line cited in
 * the spine. Every citation below was confirmed by direct read of
 * scripts/michael/checkpoint-send.mjs (254 lines, full file) in this worktree.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const smoke_test_steps = [
    {
      step_number: 1,
      instruction: "With an in-flight (unfinished) row for a feeder alongside an older FINISHED row for the same feeder/et_date in michael_feeder_runs, invoke runCheckpointSend's readProducingFeederCounts (or the composed unit test reproducing the 2026-09-14 22:00Z race)",
      expected_outcome: "The feeder's count in the composed body comes from the finished row, never the in-flight placeholder -- reproducing and closing the exact race Michael's own first live text hit",
    },
    {
      step_number: 2,
      instruction: "Call composeCheckpointBody with an asOf value drawn from a real finished_at timestamp",
      expected_outcome: "The rendered body contains a plain-ET time (e.g. 'as of 12:30pm ET'), never a raw ISO-8601 string like '2026-09-14T22:00:03.000Z'",
    },
    {
      step_number: 3,
      instruction: "Invoke the new on-demand send path outside any fixed ET window (e.g. at a minute-of-day that fails inWindow()) with valid guards (enabled=true, pin matches, cap not exceeded, quiet hours not active)",
      expected_outcome: "The send proceeds (does not return the inert/outside_et_window result), and separately, the same on-demand call with an invalid guard (wrong pin, or cap already at 4) still refuses exactly like a fixed-window call would",
    },
  ];

  const mechanism_verifications = [
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:113' },
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:82-93' },
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:61-74' },
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:76-80' },
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:127' },
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:145' },
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:166' },
    { verified_by: 'LEAD-Claude-45924f8d', verified_at: 'scripts/michael/checkpoint-send.mjs:181' },
  ];

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      smoke_test_steps,
      metadata: { ...sdRow.metadata, mechanism_verifications },
    })
    .eq('sd_key', SD_KEY);
  if (updErr) throw updErr;
  console.log('UPDATED smoke_test_steps + mechanism_verifications for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
