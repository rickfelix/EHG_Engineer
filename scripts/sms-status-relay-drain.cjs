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
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const DRAIN_LIMIT = Number(process.env.SMS_STATUS_RELAY_DRAIN_LIMIT) || 50;
const STALL_ROWS = Number(process.env.SMS_STATUS_RELAY_DRAIN_STALL_ROWS) || 20;
const STALL_MINUTES = Number(process.env.SMS_STATUS_RELAY_DRAIN_STALL_MINUTES) || 15;

/** FR-6 enable gate — the drain is inert until status-callback relay traffic is expected. */
function isDrainEnabled() {
  const v = String(process.env.SMS_STATUS_RELAY_DRAIN_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

// QF-20260830-603: intermittent native libuv abort (win32 UV_HANDLE_CLOSING) observed on
// runs where the drain is INERT (env unset) — i.e. before getSupabase() is even reached.
// require('@supabase/supabase-js') was unconditional at module load; deferring it into
// getSupabase() means the ~100% common pre-cutover inert path never touches that module's
// async-handle setup at all, shrinking the surface for whatever native teardown race is
// firing. Root-causing the libuv assertion itself is out of scope (never diagnose a native
// abort from two log lines) — see the abnormal-exit witness below for the other half of the
// two-sided fix contract (make the abort VISIBLE if it recurs, instead of eliminating it).
function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // drain is the TRUSTED side (reads staging, writes obligations)
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key);
}

// QF-20260830-603: abnormal-exit witness. A native abort kills the process before the JS
// fail-soft handler runs, so the durable evidence must be written OUTSIDE the DB round-trip
// too (a DB write could race the same kill). A local marker file is near-instant and
// synchronous: present at tick-start, removed at clean tick-end. A marker still present at
// the START of the NEXT tick means the prior tick never finished cleanly — logged loudly
// rather than silently retried, per the fix contract's "visible, not silent" requirement.
const TICK_MARKER_PATH = path.join(__dirname, '..', '.artifacts', 'sms-status-relay-drain-tick.marker');
function checkAbnormalExitWitness() {
  try {
    if (fs.existsSync(TICK_MARKER_PATH)) {
      const staleAt = fs.readFileSync(TICK_MARKER_PATH, 'utf8').trim();
      console.warn(`[sms-status-relay-drain] ABNORMAL EXIT DETECTED: previous tick started at ${staleAt} but never finished cleanly (likely a native abort or process kill mid-tick).`);
    }
  } catch (e) {
    console.error(`[sms-status-relay-drain] abnormal-exit witness check failed (non-fatal): ${(e && e.message) || e}`);
  }
}
function markTickStarted() {
  try {
    fs.mkdirSync(path.dirname(TICK_MARKER_PATH), { recursive: true });
    fs.writeFileSync(TICK_MARKER_PATH, new Date().toISOString());
  } catch (e) {
    console.error(`[sms-status-relay-drain] tick-start marker write failed (non-fatal): ${(e && e.message) || e}`);
  }
}
function markTickFinished() {
  try {
    fs.rmSync(TICK_MARKER_PATH, { force: true });
  } catch (e) {
    console.error(`[sms-status-relay-drain] tick-finish marker clear failed (non-fatal): ${(e && e.message) || e}`);
  }
}

// QF-20260830-922: append-only completion witness. Coordinator live-run measurement (10
// controlled runs) proved the native abort exits NON-ZERO (code 127) AFTER the drain's work
// has already completed and printed its output — so a supervisor watching only the exit code
// misclassifies a SUCCESSFUL tick as a failure (and 127 specifically misdirects debugging
// toward a nonexistent "command not found" path problem). The start/finish marker above proves
// nothing here: it is CLEARED on the very completion this witness needs to survive. An
// append-only log — never truncated, never cleared — lets an external observer (see
// scripts/run-with-exit-witness.cjs) correlate "did THIS run's pid append a completion entry
// after it started" against the process's own exit code, to tell teardown-abort-after-
// completion (work succeeded, abort is cosmetic) apart from a genuine mid-drain death.
const COMPLETION_LOG_PATH = path.join(__dirname, '..', '.artifacts', 'sms-status-relay-drain-completions.ndjson');
function markTickCompleted() {
  try {
    fs.mkdirSync(path.dirname(COMPLETION_LOG_PATH), { recursive: true });
    fs.appendFileSync(COMPLETION_LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid }) + '\n');
  } catch (e) {
    console.error(`[sms-status-relay-drain] completion-log append failed (non-fatal): ${(e && e.message) || e}`);
  }
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
  checkAbnormalExitWitness();
  markTickStarted();
  if (!isDrainEnabled()) {
    console.log('[sms-status-relay-drain] SMS_STATUS_RELAY_DRAIN_ENABLED not set — inert (pre-cutover no-op).');
    markTickFinished();
    markTickCompleted();
    return;
  }
  const supabase = getSupabase();
  if (DRY_RUN) {
    console.log('[sms-status-relay-drain] --dry-run: enabled, no drain performed.');
    await checkBacklogStall(supabase);
    markTickFinished();
    markTickCompleted();
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
  markTickFinished();
  markTickCompleted();
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

module.exports = {
  isDrainEnabled, getSupabase, checkBacklogStall, main,
  TICK_MARKER_PATH, checkAbnormalExitWitness, markTickStarted, markTickFinished,
  COMPLETION_LOG_PATH, markTickCompleted,
};
