#!/usr/bin/env node
/**
 * SMS status-staging drain runner — SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-6.
 * Mirrors scripts/sms-relay-drain.cjs exactly, one table over.
 *
 * THE GAP THIS PREVENTS: drainSmsStatusStaging() (lib/chairman/sms-bridge.js) has zero
 * production call sites unless this runner is armed and scheduled — the exact defect class
 * the inbound relay's drain shipped with and needed a whole follow-on SD to fix
 * (SD-LEO-FEAT-WIRE-DRAINSMSRELAYSTAGING-SCHEDULED-001). This SD lands the runner + cron in
 * the SAME PR as the drain function.
 *
 * FR-6: NO-OP unless SMS_STATUS_RELAY_DRAIN_ENABLED is truthy — stays inert pre-cutover.
 * FR-6: FAIL-SOFT — a drain error logs and exits 0; the next cron tick retries. The durable
 *       alarm for a PERSISTENT stall is the backlog-stall signal, not a red CI run.
 *       (schema_not_ready outcomes are a SPECIAL case of this — see FR-3 AC-6: the drain
 *       itself already leaves those rows undrained, so they surface here too, same alarm.)
 *
 * Usage: node scripts/sms-status-relay-drain.cjs [--dry-run]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');
const DRAIN_LIMIT = Number(process.env.SMS_STATUS_RELAY_DRAIN_LIMIT) || 50;
const STALL_ROWS = Number(process.env.SMS_STATUS_RELAY_DRAIN_STALL_ROWS) || 20;
const STALL_MINUTES = Number(process.env.SMS_STATUS_RELAY_DRAIN_STALL_MINUTES) || 15;

/** FR-6 enable gate — the drain is inert until status-callback relay traffic is expected. */
function isDrainEnabled() {
  const v = String(process.env.SMS_STATUS_RELAY_DRAIN_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // drain is the TRUSTED side (reads staging, writes obligations)
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key);
}

/** Surface a stall signal when staged rows pile up undrained (persistent-failure alarm). */
async function checkBacklogStall(supabase) {
  try {
    const cutoff = new Date(Date.now() - STALL_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from('sms_status_staging')
      .select('id', { count: 'exact', head: true })
      .is('drained_at', null)
      .lt('received_at', cutoff);
    if ((count || 0) > STALL_ROWS) {
      console.warn(`[sms-status-relay-drain] STALL: ${count} staged rows undrained > ${STALL_MINUTES}m (threshold ${STALL_ROWS}) — drain may be stopped, or the delivery_status_source column migration has not landed yet`);
    }
  } catch (e) {
    console.error(`[sms-status-relay-drain] backlog-stall check failed (non-fatal): ${(e && e.message) || e}`);
  }
}

async function main() {
  if (!isDrainEnabled()) {
    console.log('[sms-status-relay-drain] SMS_STATUS_RELAY_DRAIN_ENABLED not set — inert (pre-cutover no-op).');
    return;
  }
  const supabase = getSupabase();
  if (DRY_RUN) {
    console.log('[sms-status-relay-drain] --dry-run: enabled, no drain performed.');
    await checkBacklogStall(supabase);
    return;
  }
  try {
    // ESM module imported into this CommonJS runner via dynamic import().
    const { drainSmsStatusStaging } = await import('../lib/chairman/sms-bridge.js');
    const result = await drainSmsStatusStaging(supabase, { limit: DRAIN_LIMIT });
    if (result && result.drained > 0) {
      const tally = {};
      for (const r of result.results || []) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
      // NO SMS body text — only the drained count + the per-outcome tally.
      console.log(`[sms-status-relay-drain] drained=${result.drained} tally=${JSON.stringify(tally)}`);
    }
  } catch (e) {
    // Fail-soft: log + do NOT crash; the next cron tick retries. Persistent failure is caught
    // by the backlog-stall signal below, not a red run.
    console.error(`[sms-status-relay-drain] drain error (fail-soft, retry next tick): ${(e && e.message) || e}`);
  }
  await checkBacklogStall(supabase);
}

if (require.main === module) {
  main()
    .then(async () => {
      // Stamp on every successful tick, including the pre-cutover no-op and --dry-run paths —
      // the tick still ran to completion, which is the proof-of-life this registry row exists
      // to record. Mirrors sms-relay-drain.cjs's identical pattern. Non-fatal: a stamp failure
      // must never turn an otherwise-successful drain tick into a red run.
      try {
        const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
        await stampLastFired(getSupabase(), 'standard_loop:sms-status-relay-drain');
      } catch (err) {
        console.error(`[sms-status-relay-drain] stampLastFired failed (non-fatal): ${err.message}`);
      }
    })
    .then(() => process.exit(0))
    .catch((e) => {
      // main() is already fail-soft; guard the shell too so a transient never reds the host.
      console.error(`[sms-status-relay-drain] fatal (fail-soft exit 0): ${(e && e.message) || e}`);
      process.exit(0);
    });
}

module.exports = { isDrainEnabled, getSupabase, checkBacklogStall, main };
