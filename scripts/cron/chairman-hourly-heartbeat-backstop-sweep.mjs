#!/usr/bin/env node
/**
 * Chairman hourly-heartbeat backstop sweep — SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001.
 *
 * ROOT CAUSE this covers: the live hourly heartbeat (chairman contract c3) fires ONLY via a
 * session-scoped harness CronCreate job (scripts/adam-startup-check.mjs ADAM_LOOPS entry
 * 'heartbeat-sms', cron '14 * * * *'), re-armed only when an /adam session starts. When the
 * host machine loses power (confirmed root cause: a hotel room cutting power on no-motion,
 * 2026-08-09 onward — not a software timer bug) every local session/cron dies with it, and the
 * hourly SLA breaks silently. Two slips were witnessed 2026-08-12/13 (2h14m, ~4.5h), driving
 * Adam self-score D8 (interface_clarity) to a 3-consecutive-cycle escalation.
 *
 * DELIBERATELY NOT a mirror of the morning-brief sweep's write-time UPSERT dedupe. LEAD-phase
 * due diligence (VALIDATION sub-agent) found that pattern has a MEASURED LIVE defect: two
 * independently-composed dedupe keys for the same duty (one code-composed, one LLM-prompted)
 * do not actually collide in production, and a shared key on kind=heartbeat_status would
 * suppress the ~44% of hours that legitimately carry >1 send (chairman replies). So this sweep
 * instead:
 *   1. READS sms_outbound_obligations for the MOST RECENT row per relevant kind
 *      (heartbeat_status = the live path, heartbeat_status_backstop = this sweep's own prior
 *      fills) created within the current chairman-zone hour.
 *   2. Classifies hour coverage via an explicit status-decision table over ALL 8 statuses in
 *      the DDL CHECK (PLAN-phase TESTING sub-agent finding G1: mere row existence must not
 *      count as "filled" — a stuck status='owed' row is enqueued-but-never-delivered, exactly
 *      the failure mode this backstop exists to catch).
 *   3. On UNFILLED, sends via the EXISTING sendChairmanSMS() gated pipeline (chairman-sms-gate)
 *      — never a raw enqueueChairmanSms() call — so quiet-hours (chairman-zone-aware, not a
 *      hardcoded ET check), the pre-send safety rubric, and inline dispatch-and-verify
 *      (reconcileOutboundSms) are all inherited for free. This closes the LEAD-phase-found gap
 *      that the morning-brief precedent has no measured always-on dispatcher for owed rows.
 *   4. Uses its OWN distinct kind (heartbeat_status_backstop) and a millisecond-timestamped
 *      dedupeKey (never a plain per-hour counter — avoids a same-key collision between two
 *      near-simultaneous ticks, which would otherwise surface as a false transport-failure
 *      alert per chairman-sms-gate/index.js's softFailed handling) as defense-in-depth against
 *      this sweep's own overlapping runs, paired with a GHA concurrency group. It never shares
 *      a key/kind namespace with the live heartbeat path.
 *
 * OUT OF SCOPE (deliberately, per LEAD-phase risk findings): scripts/adam-chairman-sms.mjs,
 * scripts/adam-startup-check.mjs, and the morning-brief/morning-review sweeps are unmodified.
 *
 * Usage:
 *   node scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs --once
 *   node scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs --once --dry-run
 *
 * Env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required),
 *      CHAIRMAN_PHONE (recipient — inert if unset, matching adam-chairman-sms.mjs/sms-bridge).
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { sendChairmanSMS } from '../../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { resolveQuietHoursContext } from '../../lib/comms/adam-outbound/quiet-hours-extension.js';
import { etHourWindowUtc } from '../../lib/time/chairman-et-wall-clock.js';

export const SD_KEY = 'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';
export const ACTIVATION_TRIGGER = '.github/workflows/chairman-hourly-heartbeat-backstop-cron.yml';
export const LIVE_KIND = 'heartbeat_status';
export const BACKSTOP_KIND = 'heartbeat_status_backstop';

// Coarse pre-filter only (not the quiet-hours authority — sendChairmanSMS's rubric gate is).
// Avoids pointless GHA runs outside plausible awake hours; the real quiet-hours enforcement is
// inherited from the existing gate below.
const WINDOW_START_ZONE_HOUR = 6;
const WINDOW_END_ZONE_HOUR = 22;

// A single named constant used by classifyRowCoverage's owed/sending branch (PLAN-phase
// TESTING sub-agent finding G4): "how long is a stuck live-owed/sending row allowed to sit
// before the backstop treats coverage as still unfilled?" (a fresh in-flight row gets a grace
// period; a stale one does not count as coverage). It is NOT consulted for failed/undelivered
// rows (those are always unfilled, any age) or for a null row (see LOOKBACK_MS below).
export const STALENESS_GRACE_MS = 5 * 60 * 1000;

// EXEC-phase TESTING sub-agent finding F1 (merge-blocking): an earlier revision of this file
// used a fixed CALENDAR-hour bucket ([HH:00, HH+1:00)) for the coverage read. That bucket is
// EMPTY BY CONSTRUCTION at the top of every hour (the GHA cron's first tick runs at :00), so
// classifyRowCoverage(null) unconditionally returned 'unfilled' and the sweep sent a spurious
// backstop SMS at the start of every awake hour regardless of live-path health — live data
// shows the real heartbeat lands anywhere across the hour (measured minute-of-hour spread:
// :00s=36, :10s=54, :20s=64, :30s=47, :40s=60, :50s=55 across 316 rows), so a calendar bucket
// can never reliably contain it near the boundary. FIX: read a TRAILING window ("was there
// coverage in roughly the last hour", not "in this fixed calendar hour") — timezone-agnostic
// by construction (a pure duration subtracted from `now`), never empty purely because of where
// the clock happens to sit relative to an artificial boundary. SLA_WINDOW_MS is the actual SLA
// (an hourly heartbeat); STALENESS_GRACE_MS is added as the same buffer already used for the
// in-flight grace check, so the two concepts stay consistent with one one another.
export const SLA_WINDOW_MS = 60 * 60 * 1000;
export const LOOKBACK_MS = SLA_WINDOW_MS + STALENESS_GRACE_MS;

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/**
 * Status-decision table (PLAN-phase TESTING sub-agent finding G1), over all 8 statuses in the
 * sms_outbound_obligations DDL CHECK: owed, sending, sent, delivered, undelivered, failed,
 * canceled, owed_escalate.
 * @param {{status?: string, created_at?: string}|null} row the most recent row for one kind,
 *   within the current hour window (or null if none exists)
 * @param {Date} now
 * @returns {'filled'|'in_flight'|'unfilled'|'do_not_retry'}
 */
export function classifyRowCoverage(row, now) {
  if (!row || !row.status) return 'unfilled';
  const { status } = row;
  if (status === 'sent' || status === 'delivered') return 'filled';
  if (status === 'canceled' || status === 'owed_escalate') return 'do_not_retry';
  // owed | sending | undelivered | failed
  const ageMs = row.created_at ? now.getTime() - new Date(row.created_at).getTime() : Infinity;
  if ((status === 'owed' || status === 'sending') && ageMs < STALENESS_GRACE_MS) return 'in_flight';
  return 'unfilled'; // stale owed/sending, or a terminal failure (undelivered/failed) — send.
}

/**
 * Combine the live-path and backstop's-own-prior-fill verdicts for the current hour into a
 * single decision. 'filled' or 'in_flight' on EITHER side means no send this tick;
 * 'do_not_retry' on either side also means no send (escalation machinery already engaged);
 * otherwise unfilled (the FR-1 case this sweep exists for).
 * @param {'filled'|'in_flight'|'unfilled'|'do_not_retry'} liveVerdict
 * @param {'filled'|'in_flight'|'unfilled'|'do_not_retry'} backstopVerdict
 */
export function combineHourVerdict(liveVerdict, backstopVerdict) {
  if (liveVerdict === 'filled' || backstopVerdict === 'filled') return 'filled';
  if (liveVerdict === 'do_not_retry' || backstopVerdict === 'do_not_retry') return 'do_not_retry';
  if (liveVerdict === 'in_flight' || backstopVerdict === 'in_flight') return 'in_flight';
  return 'unfilled';
}

/**
 * Reads the most recent obligation row for `kind` created within the trailing lookback window
 * [sinceIso, now] (see LOOKBACK_MS/F1 above — deliberately NOT a fixed calendar-hour bucket).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function fetchLatestRowForKind(supabase, kind, sinceIso) {
  const { data, error } = await supabase
    .from('sms_outbound_obligations')
    .select('id,status,created_at')
    .eq('kind', kind)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { row: null, error };
  return { row: data && data[0] ? data[0] : null, error: null };
}

/** Minimal, honest last-hour content — never a fabricated all-good (FR-4). */
export function buildBackstopBody({ liveVerdict, backstopVerdict }) {
  return `[backstop] Still here — hourly heartbeat check-in (no live heartbeat reached this hour; live=${liveVerdict}, prior-backstop=${backstopVerdict}).`;
}

export { etHourWindowUtc };

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const now = deps.now instanceof Date ? deps.now : (Number.isFinite(deps.now) ? new Date(deps.now) : new Date());
  const send = deps.send || sendChairmanSMS;
  const resolveQuietHours = deps.resolveQuietHoursContext || resolveQuietHoursContext;
  const log = (obj) => logger.log?.(`[hourly-heartbeat-backstop] ${JSON.stringify(obj)}`);

  if (args.help) { logger.log?.('chairman-hourly-heartbeat-backstop-sweep --once [--dry-run]'); return { exitCode: 0, action: 'help' }; }

  const recipientPhone = env.CHAIRMAN_PHONE;
  if (!recipientPhone) {
    log({ action: 'inert', reason: 'chairman_phone_unset' });
    return { exitCode: 0, action: 'inert', reason: 'chairman_phone_unset' };
  }

  const { allowQuietHours, chairmanZone } = await resolveQuietHours(now);

  // Coarse pre-filter only — see file header. Real quiet-hours enforcement is inherited from
  // sendChairmanSMS's rubric gate below, using the SAME chairmanZone just resolved. hourKey is
  // a readable per-tick label for logs/dedupeKey only — it does NOT bound the coverage read
  // (see LOOKBACK_MS/F1 above: the coverage read is a trailing window, not this calendar hour).
  const { hourKey } = etHourWindowUtc(now, chairmanZone);
  const zoneHour = Number(hourKey.slice(-2));
  if (zoneHour >= WINDOW_END_ZONE_HOUR || zoneHour < WINDOW_START_ZONE_HOUR) {
    log({ action: 'inert', reason: 'outside_coarse_window', zone_hour: zoneHour });
    return { exitCode: 0, action: 'inert', reason: 'outside_coarse_window' };
  }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) { logger.error?.(`[hourly-heartbeat-backstop] supabase client unavailable: ${err.message}`); return { exitCode: 2, action: 'no_supabase' }; }

  const sinceIso = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const fetchRow = deps.fetchLatestRowForKind || fetchLatestRowForKind;
  const [{ row: liveRow, error: liveErr }, { row: backstopRow, error: backstopErr }] = await Promise.all([
    fetchRow(supabase, LIVE_KIND, sinceIso),
    fetchRow(supabase, BACKSTOP_KIND, sinceIso),
  ]);

  // Read-error branch (PLAN-phase TESTING sub-agent finding G3): fail CLOSED (no send) — an
  // unreadable ledger must never be treated as license to send, since the ledger read is the
  // only signal preventing a double-send.
  if (liveErr || backstopErr) {
    log({ action: 'inert', reason: 'read_error', live_error: liveErr?.message || null, backstop_error: backstopErr?.message || null });
    return { exitCode: 0, action: 'inert', reason: 'read_error' };
  }

  const liveVerdict = classifyRowCoverage(liveRow, now);
  const backstopVerdict = classifyRowCoverage(backstopRow, now);
  const hourVerdict = combineHourVerdict(liveVerdict, backstopVerdict);

  if (hourVerdict !== 'unfilled') {
    log({ action: 'no_send', reason: hourVerdict, live_verdict: liveVerdict, backstop_verdict: backstopVerdict, hour_key: hourKey });
    return { exitCode: 0, action: 'no_send', summary: { reason: hourVerdict, liveVerdict, backstopVerdict, hourKey } };
  }

  const body = (deps.buildBackstopBody || buildBackstopBody)({ liveVerdict, backstopVerdict });
  // Millisecond-timestamped, never a plain per-hour key — see file header for why (avoids a
  // same-key UPSERT collision between two near-simultaneous ticks surfacing as a false
  // transport-failure alert).
  const dedupeKey = `${BACKSTOP_KIND}:${hourKey}:${now.getTime()}`;

  if (args.dryRun) {
    log({ action: 'dry_run', dedupe_key: dedupeKey, hour_key: hourKey, body_len: body.length });
    return { exitCode: 0, action: 'dry_run', summary: { dedupeKey, hourKey, bodyLength: body.length } };
  }

  // recipientPhone rides on `message` (matching makeDefaultSender's read of
  // message.recipientPhone || process.env.CHAIRMAN_PHONE) — NOT on `context`, which
  // sendChairmanSMS never forwards to the sender.
  const message = { type: 'status', body, kind: BACKSTOP_KIND, dedupeKey, recipientPhone };
  const context = { now, allowQuietHours, chairmanZone };
  const result = await send(message, context);

  // PII-safe: log outcome/reason only — never the recipient phone or the body text.
  log({
    action: result.sent ? 'sent' : 'no_send',
    reason: result.reason || null,
    held: !!result.held,
    transport_failed: !!result.transportFailed,
    dedupe_key: dedupeKey,
    hour_key: hourKey,
  });
  return {
    exitCode: 0,
    action: result.sent ? 'sent' : 'no_send',
    summary: { sent: !!result.sent, held: !!result.held, transportFailed: !!result.transportFailed, reason: result.reason || null, dedupeKey, hourKey, bodyLength: body.length },
  };
}

/** Windows-safe termination (mirrors chairman-morning-brief-sweep.mjs::gracefulExit). */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent — natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('chairman-hourly-heartbeat-backstop-sweep fatal:', err.message); return gracefulExit(2); });
}
