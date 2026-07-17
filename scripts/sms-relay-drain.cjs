#!/usr/bin/env node
/**
 * SMS relay-staging drain runner — SD-LEO-FEAT-WIRE-DRAINSMSRELAYSTAGING-SCHEDULED-001.
 *
 * THE GAP THIS CLOSES: drainSmsRelayStaging() (lib/chairman/sms-bridge.js) had ZERO
 * production call sites — after the Twilio webhook cutover, inbound chairman SMS replies
 * land in `sms_relay_staging` and are NEVER drained into `chairman_decisions` (the classic
 * registered-verifier-never-dispatched gap). This one-shot runner is the missing dispatch,
 * armed by `.github/workflows/sms-relay-drain-cron.yml` (mirrors coordinator-relay-drain.cjs).
 *
 * FR-2: NO-OP unless `SMS_RELAY_DRAIN_ENABLED` is truthy — stays inert PRE-cutover.
 * FR-2: FAIL-SOFT — a drain error logs and exits 0; the next cron tick retries. The durable
 *       alarm for a PERSISTENT stall is the FR-3 undrained-backlog signal, not a red CI run.
 * FR-3: one structured line per NON-EMPTY drain (count + per-outcome tally, NO SMS body text)
 *       + a "staged rows undrained > N for > M minutes" backlog-stall signal.
 *
 * Usage: node scripts/sms-relay-drain.cjs [--dry-run]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');
const DRAIN_LIMIT = Number(process.env.SMS_RELAY_DRAIN_LIMIT) || 50;
const STALL_ROWS = Number(process.env.SMS_RELAY_DRAIN_STALL_ROWS) || 20;       // FR-3 N
const STALL_MINUTES = Number(process.env.SMS_RELAY_DRAIN_STALL_MINUTES) || 15; // FR-3 M

/** FR-2 enable gate — the drain is inert until inbound relay traffic is expected. */
function isDrainEnabled() {
  const v = String(process.env.SMS_RELAY_DRAIN_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // drain is the TRUSTED side (reads staging, writes decisions)
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key);
}

/** FR-3: surface a stall signal when staged rows pile up undrained (persistent-failure alarm). */
async function checkBacklogStall(supabase) {
  try {
    const cutoff = new Date(Date.now() - STALL_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from('sms_relay_staging')
      .select('id', { count: 'exact', head: true })
      .is('drained_at', null)
      .lt('received_at', cutoff);
    if ((count || 0) > STALL_ROWS) {
      console.warn(`[sms-relay-drain] STALL: ${count} staged rows undrained > ${STALL_MINUTES}m (threshold ${STALL_ROWS}) — drain may be stopped`);
    }
  } catch (e) {
    console.error(`[sms-relay-drain] backlog-stall check failed (non-fatal): ${(e && e.message) || e}`);
  }
}

async function main() {
  if (!isDrainEnabled()) {
    console.log('[sms-relay-drain] SMS_RELAY_DRAIN_ENABLED not set — inert (pre-cutover no-op).');
    return;
  }
  const supabase = getSupabase();
  if (DRY_RUN) {
    console.log('[sms-relay-drain] --dry-run: enabled, no drain performed.');
    await checkBacklogStall(supabase);
    return;
  }
  try {
    // ESM module imported into this CommonJS runner via dynamic import().
    const { drainSmsRelayStaging } = await import('../lib/chairman/sms-bridge.js');
    const result = await drainSmsRelayStaging(supabase, { limit: DRAIN_LIMIT });
    if (result && result.drained > 0) {
      const tally = {};
      for (const r of result.results || []) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
      // NO SMS body text — only counts + per-outcome tally (answered/no_match/ambiguous/suspended).
      console.log(`[sms-relay-drain] drained=${result.drained} tally=${JSON.stringify(tally)}`);
    }
  } catch (e) {
    // FR-2 fail-soft: log + do NOT crash; the next cron tick retries. Persistent failure is
    // caught by the backlog-stall signal below, not a red run.
    console.error(`[sms-relay-drain] drain error (fail-soft, retry next tick): ${(e && e.message) || e}`);
  }
  await checkBacklogStall(supabase);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      // main() is already fail-soft; guard the shell too so a transient never reds the host.
      console.error(`[sms-relay-drain] fatal (fail-soft exit 0): ${(e && e.message) || e}`);
      process.exit(0);
    });
}

module.exports = { isDrainEnabled, getSupabase, checkBacklogStall, main };
