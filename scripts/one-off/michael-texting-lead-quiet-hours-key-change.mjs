#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- adds the quiet-hours key_change item
 * (Explore finding) and its mechanism_verifications citations. Both files' cited content
 * (function names, constants) were confirmed present via direct read before writing:
 * lib/comms/adam-outbound/quiet-hours-extension.js (SMS_QUIET_START_HOUR=22,
 * SMS_QUIET_END_HOUR=6, resolveAllowQuietHours) and lib/time/chairman-et-wall-clock.js
 * (smsQuietWindowReleaseIso).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('key_changes, risks, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const key_changes = [
    ...sdRow.key_changes,
    {
      change: "Wire a quiet-hours check into checkpoint-send.mjs's new on-demand path, reusing the existing live mechanism (lib/comms/adam-outbound/quiet-hours-extension.js's resolveAllowQuietHours, SMS_QUIET_START_HOUR=22/SMS_QUIET_END_HOUR=6; lib/time/chairman-et-wall-clock.js's smsQuietWindowReleaseIso) rather than building a new one. Confirmed by LEAD-phase Explore: checkpoint-send.mjs currently has ZERO references to quiet hours anywhere in its 254 lines -- the fixed 4 windows (06:00/10:00/14:00/18:00 ET) never fall inside 22:00-06:00 by construction, so this gap has never been exercised, but an arbitrary-minute on-demand invocation can.",
      impact: "Without this, an on-demand send authorized by ratification eb7e84b3 ('outside the regular frequency slots') could fire during the chairman's quiet hours, which the ratification never authorized.",
    },
  ];

  const risks = [
    ...sdRow.risks,
    {
      risk: "The on-demand path could ship without a quiet-hours check at all if PLAN/EXEC assume (as the SD's own original scope text mistakenly implied) that this guard already exists in checkpoint-send.mjs.",
      impact: "medium",
      likelihood: "medium",
      mitigation: "PLAN must include an explicit FR/test scenario for quiet-hours refusal on the on-demand path, and EXEC must cite lib/comms/adam-outbound/quiet-hours-extension.js + lib/time/chairman-et-wall-clock.js directly rather than assuming an existing internal guard.",
    },
  ];

  const mechanism_verifications = [
    ...(sdRow.metadata?.mechanism_verifications || []),
    { verified_by: 'LEAD-Explore-45924f8d', verified_at: 'lib/comms/adam-outbound/quiet-hours-extension.js:20-21' },
    { verified_by: 'LEAD-Explore-45924f8d', verified_at: 'lib/time/chairman-et-wall-clock.js:158' },
  ];

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, risks, metadata: { ...sdRow.metadata, mechanism_verifications } })
    .eq('sd_key', SD_KEY);
  if (updErr) throw updErr;
  console.log('UPDATED key_changes/risks/mechanism_verifications for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
