#!/usr/bin/env node
/**
 * Daily delivery-verified canary for the chairman-email channel — SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001
 * FR-5/FR-6.
 *
 * Two modes, both invoked from .github/workflows/chairman-email-canary-cron.yml (an independent
 * GH Actions cron — NOT scripts/gauge-runner.mjs, which dies with the coordinator process):
 *
 *   node scripts/chairman-email-canary.mjs                  -- daily send + delivery verification
 *   node scripts/chairman-email-canary.mjs --check-freshness -- 6-hourly absence detection
 *
 * A GH Actions cron is best-effort; a dropped daily-send run looks identical to a passing run
 * from the outside. --check-freshness runs on a MORE frequent, independent schedule and detects
 * a missed/stale canary by freshness (absence), routing through the SAME alarm path as a real
 * send failure (lib/notifications/channel-health-recorder.js) rather than a separate mechanism.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { sendEmail } from '../lib/notifications/resend-adapter.js';
import { checkCanaryFreshness, recordAndEvaluate } from '../lib/notifications/channel-health-recorder.js';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';

const CHAIRMAN_EMAIL = process.env.CHAIRMAN_EMAIL || 'codestreetlabs@gmail.com';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Send the canary + verify delivery via a real provider-accepted id. On verified success, stamps
 * last_canary_verified_at (separate from the general health recorder's last_success_at, since
 * this specifically proves the CANARY path, not just that some send succeeded). A canary
 * failure is left to sendEmail()'s own internal recorder hook -- no separate mechanism needed.
 * @returns {Promise<{verified:boolean, result:object}>}
 */
export async function runCanary({ supabase = getSupabase(), send = sendEmail, now = new Date() } = {}) {
  const result = await send({
    to: CHAIRMAN_EMAIL,
    subject: 'Chairman-email channel canary',
    html: '<p>Automated daily delivery-verification canary. No action needed.</p>',
    text: 'Automated daily delivery-verification canary. No action needed.',
  }, { now });

  const verified = Boolean(result.success && !result.suppressed && result.providerMessageId);
  if (verified) {
    const { error } = await supabase
      .from('chairman_email_channel_health') // schema-lint-disable-line — new table (this SD's migration), chairman-apply-gated, not yet in the live snapshot
      .upsert({ id: 'singleton', last_canary_verified_at: now.toISOString(), updated_at: now.toISOString() }, { onConflict: 'id' });
    if (error) console.warn(`[chairman-email-canary] last_canary_verified_at stamp failed (non-fatal): ${error.message}`);
  }
  return { verified, result };
}

/**
 * Absence detection (FR-6): reads the current row, checks canary freshness, and if stale routes
 * a synthetic failure signal through the SAME alarm path recordAndEvaluate() uses for real send
 * failures -- a missed cron run is treated identically to an observed failure.
 * @returns {Promise<{stale:boolean, alarmResult:?object}>}
 */
export async function checkFreshnessAndAlert({ supabase = getSupabase(), notifyChairman, now = new Date() } = {}) {
  const { data: row } = await supabase.from('chairman_email_channel_health').select('*').eq('id', 'singleton').maybeSingle(); // schema-lint-disable-line — new table (this SD's migration), chairman-apply-gated, not yet in the live snapshot
  const { stale } = checkCanaryFreshness(row || {}, now);
  if (!stale) return { stale: false, alarmResult: null };

  let resolvedNotify = notifyChairman;
  if (!resolvedNotify) {
    const mod = await import('../lib/integrations/todoist/chairman-notify.js');
    resolvedNotify = mod.notifyChairman;
  }
  const alarmResult = await recordAndEvaluate(
    { supabase, notifyChairman: resolvedNotify },
    { success: false, errorCode: 'CANARY_STALE', errorMessage: 'Daily canary has not verified delivery within the expected freshness window (missed/dropped cron run).' },
    { now }
  );
  return { stale: true, alarmResult };
}

async function main() {
  enforceCliSendGuard({
    scriptName: 'scripts/chairman-email-canary.mjs',
    flags: [{ name: '--check-freshness' }],
  });
  const checkFreshness = process.argv.includes('--check-freshness');
  if (checkFreshness) {
    const { stale, alarmResult } = await checkFreshnessAndAlert();
    console.log(`[chairman-email-canary] freshness check: stale=${stale}${alarmResult ? ' alarmResult=' + JSON.stringify(alarmResult) : ''}`);
  } else {
    const { verified, result } = await runCanary();
    console.log(`[chairman-email-canary] canary run: verified=${verified} result=${JSON.stringify(result)}`);
  }
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('[chairman-email-canary] UNHANDLED: ' + (e?.message || e)); process.exit(0); });
}
