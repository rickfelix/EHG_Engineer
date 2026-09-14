#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- corrects a self-caught citation error.
 * The prior mechanism_verifications entry cited SMS_QUIET_START_HOUR/END_HOUR and
 * resolveAllowQuietHours as both living at lib/comms/adam-outbound/quiet-hours-extension.js:20-21.
 * Direct re-verification found: SMS_QUIET_START_HOUR/END_HOUR are actually defined in
 * lib/time/chairman-et-wall-clock.js:20-21 (not quiet-hours-extension.js at all -- that file's
 * line 16 only references them in a docblock comment); resolveAllowQuietHours is exported at
 * quiet-hours-extension.js:77, not :20-21. Both corrected citations re-verified via direct grep
 * before writing.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('key_changes, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const key_changes = sdRow.key_changes.map((kc) =>
    kc.change.startsWith('Wire a quiet-hours check')
      ? {
          ...kc,
          change: "Wire a quiet-hours check into checkpoint-send.mjs's new on-demand path, reusing the existing live mechanism (lib/comms/adam-outbound/quiet-hours-extension.js:77's resolveAllowQuietHours; lib/time/chairman-et-wall-clock.js:20-21's SMS_QUIET_START_HOUR=22/SMS_QUIET_END_HOUR=6 constants and :158's smsQuietWindowReleaseIso) rather than building a new one. Confirmed by LEAD-phase Explore: checkpoint-send.mjs currently has ZERO references to quiet hours anywhere in its 254 lines -- the fixed 4 windows (06:00/10:00/14:00/18:00 ET) never fall inside 22:00-06:00 by construction, so this gap has never been exercised, but an arbitrary-minute on-demand invocation can.",
        }
      : kc
  );

  const mechanism_verifications = (sdRow.metadata?.mechanism_verifications || []).map((v) =>
    v.verified_at === 'lib/comms/adam-outbound/quiet-hours-extension.js:20-21'
      ? { ...v, verified_at: 'lib/comms/adam-outbound/quiet-hours-extension.js:77' }
      : v
  );

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, metadata: { ...sdRow.metadata, mechanism_verifications } })
    .eq('sd_key', SD_KEY);
  if (updErr) throw updErr;
  console.log('CORRECTED quiet-hours citations for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
