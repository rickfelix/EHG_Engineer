#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- LEAD-phase correction.
 *
 * Explore's LEAD-phase review found the SD's own scope text overstated an existing guard:
 * it lists "the 22:00-06:00 ET chairman quiet hours" among guards that "still apply" to
 * on-demand sends, implying checkpoint-send.mjs already enforces it. A full read of the
 * 254-line file confirms ZERO references to quiet hours anywhere in it -- the mechanism is
 * real and live elsewhere (lib/comms/adam-outbound/quiet-hours-extension.js,
 * lib/time/chairman-et-wall-clock.js, wired into Adam's lib/chairman/sms-outbound-worker.js)
 * but was never wired into Michael's checkpoint-send verb. The original Tier-2 PRD flagged
 * this as only a SHOULD, never implemented, invisible until now because none of the 4 fixed
 * windows fall inside 22:00-06:00 by construction. Corrects the scope to require BUILDING
 * this guard, not merely preserving it.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const scope = `- An on-demand send path for Michael outside the fixed windows: an explicit on-demand invocation (for example --now with a reason) that sends one checkpoint text immediately. The fixed-window schedule stays as is.
- Every existing guard still applies to on-demand sends: the recipient pin read fresh from michael_checkpoint_send_enabled (config_key recipient_pin), Michael's own MICHAEL_TWILIO_ identity, the enable/disable row, and a daily cap counting both kinds, and a ledger row per attempt with a slot value marking it on-demand.
- CORRECTED at LEAD (Explore finding, 2026-09-14): the 22:00-06:00 ET chairman quiet hours is NOT currently enforced anywhere in scripts/michael/checkpoint-send.mjs -- a full read of the file found zero references to quiet hours. The mechanism is real and live elsewhere (lib/comms/adam-outbound/quiet-hours-extension.js's resolveAllowQuietHours, lib/time/chairman-et-wall-clock.js's smsQuietWindowReleaseIso), used by Adam's SMS outbound worker, but was never wired into Michael's checkpoint-send verb -- the original Tier-2 PRD flagged this as only a SHOULD, and it went unimplemented because none of the 4 fixed windows (06:00/10:00/14:00/18:00 ET) ever fall inside 22:00-06:00 by construction, so the gap was never exercised. This SD must NEWLY WIRE a quiet-hours check into the on-demand path (an arbitrary-minute invocation can land inside 22:00-06:00 ET, unlike the fixed windows) by reusing the existing resolveAllowQuietHours/smsQuietWindowReleaseIso mechanism -- not merely "preserve" a guard that does not yet exist there.
- Content fix: read only feeder runs with finished_at set (finished_at IS NOT NULL is the only unambiguous completion signal -- michael_feeder_runs.status has no literal 'finished' value, and 'skipped' is dual-purpose: claimAttempt writes it as the START placeholder status before a run finishes, but a feeder's run() can also legitimately return 'skipped' as a final outcome, so filtering on status alone is wrong), taking the latest FINISHED attempt per feeder for the ET date. A feeder with no finished run today is named in the text as "no run yet today" instead of vanishing. The as-of renders in plain ET, for example "as of 12:30pm ET", and when counts come from different times the text says so.
- Optional: move the fixed-window send a few minutes after its producing feeders' slot, so the race closes at the source.
- Out of scope: inbound reply handling, threshold-gated alert content, and any change to Adam's SMS lane.`;

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ scope })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('CORRECTED scope for', SD_KEY, '(quiet-hours guard: NEW, not existing)');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
