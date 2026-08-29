#!/usr/bin/env node
/**
 * @wire-check-exempt: invoked exclusively from .github/workflows/chairman-hourly-heartbeat-backstop-cron.yml
 * (GHA `run:` step) — never via a package.json script or a static JS import. Same architectural shape as
 * scripts/hooks/ and lib/ship/ in wire-check-gate.js's KNOWN_DYNAMIC_PATTERNS (harness/workflow-invoked,
 * no static reachability from any in-scope entry point).
 *
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
 *      fills) created since the current DUE SLOT's instant (QF-20260828-650: fixed ET slots —
 *      SLOT_HOURS_ET = [6,9,12,15,18,21] — replaced the original trailing-lookback-window design
 *      after the chairman moved the routine heartbeat cadence off a rolling window entirely; see
 *      SLOT_HOURS_ET's doc comment for the full supersession history).
 *   2. Classifies coverage via an explicit status-decision table over ALL 8 statuses in the DDL
 *      CHECK (PLAN-phase TESTING sub-agent finding G1: mere row existence must not count as
 *      "filled" — a stuck status='owed' row is enqueued-but-never-delivered, exactly the
 *      failure mode this backstop exists to catch).
 *   3. On UNFILLED, ENQUEUES ONLY via enqueueChairmanSms (lib/chairman/sms-bridge.js) —
 *      DELIBERATELY NOT sendChairmanSMS's inline dispatch. EXEC-phase SECURITY sub-agent review
 *      (sub_agent_execution_results id=094291c6-3266-4875-abf9-6b9a877785be, SEC-H1,
 *      merge-blocking) found this GHA workflow's env block — copied from the enqueue-only
 *      morning-brief/morning-review precedents — carries NO Twilio credentials. Calling
 *      sendChairmanSMS anyway would reach makeDefaultSender's inline reconcileOutboundSms with
 *      no way to actually dispatch: the reconciler's unfiltered `status='owed'` claim (no kind
 *      scoping) would then burn retry attempts and PERMANENTLY DEAD-LETTER unrelated owed rows
 *      (e.g. a legitimate morning_brief obligation) precisely during the machine-off outage
 *      this SD exists to cover — the opposite of durable. Explicit quiet-hours gating
 *      (isSmsQuietHour, chairman-zone-aware, matching the drop-not-queue behavior already
 *      established for heartbeats) is therefore done HERE rather than inherited from
 *      sendChairmanSMS's rubric, since that pipeline is no longer invoked.
 *   4. Uses its OWN distinct kind (heartbeat_status_backstop) and a PER-SLOT dedupeKey (QF-
 *      20260828-650, coordinator directive c56e93cc rider a — no millisecond suffix; a slot's
 *      coverage state is intentionally singular, so the dedupe_key UNIQUE constraint on
 *      sms_outbound_obligations is itself the guard against a near-simultaneous double-enqueue
 *      for the same slot), paired with a GHA concurrency group. It never shares a key/kind
 *      namespace with the live heartbeat path.
 *
 * The resulting 'owed' obligation is drained by whatever credentialed process next calls
 * sendChairmanSMS for any reason (the reconciler claims any owed row, unscoped by kind) — this
 * is the SAME dispatch dependency the already-shipped morning-brief/morning-review sweeps have,
 * not a new one. A backstop SMS sitting owed until a credentialed process drains it is strictly
 * safer than an uncredentialed GHA job actively burning through -- and dead-lettering -- other
 * obligations it has no business touching.
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
import { enqueueChairmanSms } from '../../lib/chairman/sms-bridge.js';
import { resolveQuietHoursContext } from '../../lib/comms/adam-outbound/quiet-hours-extension.js';
import { etHourWindowUtc, isSmsQuietHour } from '../../lib/time/chairman-et-wall-clock.js';

export const SD_KEY = 'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';
export const ACTIVATION_TRIGGER = '.github/workflows/chairman-hourly-heartbeat-backstop-cron.yml';
export const LIVE_KIND = 'heartbeat_status';
export const BACKSTOP_KIND = 'heartbeat_status_backstop';

// Coarse pre-filter only. The real quiet-hours authority is the explicit isSmsQuietHour check
// below (22:00-06:00 chairman-zone). DELIBERATELY WIDER than the quiet-hours window by one hour
// on each side (05:00-23:00, not 06:00-22:00) — mirroring QF-20260722-277's identical rationale
// for the morning-brief sweep: buffers GHA scheduled-workflow lag so a tick nominally due just
// before the quiet-hours boundary, but that actually fires a few minutes late, is still
// evaluated by the real (reachable) isSmsQuietHour check against its ACTUAL fire time rather
// than being silently dropped by an over-tight pre-filter. If this band exactly matched the
// quiet-hours boundary, the explicit check below would be unreachable dead code.
const WINDOW_START_ZONE_HOUR = 5;
const WINDOW_END_ZONE_HOUR = 23;

// A single named constant used by classifyRowCoverage's owed/sending branch (PLAN-phase
// TESTING sub-agent finding G4): "how long is a stuck live-owed/sending row allowed to sit
// before the backstop treats coverage as still unfilled?" (a fresh in-flight row gets a grace
// period; a stale one does not count as coverage). It is NOT consulted for failed/undelivered
// rows (those are always unfilled, any age) or for a null row (see the due-slot read in main()).
export const STALENESS_GRACE_MS = 5 * 60 * 1000;

// EXEC-phase TESTING sub-agent finding F1 (merge-blocking): an earlier revision of this file
// used a fixed CALENDAR-hour bucket ([HH:00, HH+1:00)) for the coverage read. That bucket is
// EMPTY BY CONSTRUCTION at the top of every hour (the GHA cron's first tick runs at :00), so
// classifyRowCoverage(null) unconditionally returned 'unfilled' and the sweep sent a spurious
// backstop SMS at the start of every awake hour regardless of live-path health — live data
// shows the real heartbeat lands anywhere across the hour (measured minute-of-hour spread:
// :00s=36, :10s=54, :20s=64, :30s=47, :40s=60, :50s=55 across 316 rows), so a calendar bucket
// can never reliably contain it near the boundary. FIX: read relative to the DUE SLOT instant
// (see SLOT_HOURS_ET below), not a fixed calendar-hour bucket — never empty purely because of
// where the clock happens to sit relative to an artificial boundary.
//
// QF-20260828-188 (leg 1, now superseded): chairman verbal 2026-08-28 ~06:4x ET (ratification
// 9eebe200) moved the routine heartbeat SMS from hourly to a 3-hourly TRAILING-WINDOW cadence
// (SLA_WINDOW_MS=3h), which this file implemented. QF-20260828-650: chairman ratification
// 7010e20f (23:12:51Z, CLAUDE_ADAM.md:273) superseded that AGAIN, same day, moving the routine
// heartbeat to FIXED ET SLOTS (6/9/12/15/18/21) rather than a rolling window — Adam's slot cron
// is armed and chairman-confirmed. Coordinator directive c56e93cc (binding, two Solomon riders):
// RETARGET chosen over RETIRE (rider (b)'s retire-only-if condition — first fixing/verifying
// scripts/adam-quiet-tick.mjs's now-stale 175min/3-hourly overdue check — is a comparable-or-
// larger unit of work with more moving parts than retargeting this already-understood file).
// Rider (a): dedupe keys must be PER-SLOT, not per-window — see dedupeKey construction in
// main() below (no millisecond suffix; a slot's coverage state is intentionally singular).
export const SLOT_HOURS_ET = [6, 9, 12, 15, 18, 21];

/**
 * The most recently-due slot hour at-or-before `zoneHour`, or undefined if `zoneHour` is before
 * the first slot (SLOT_HOURS_ET[0]) — i.e. no slot has come due yet today.
 * @param {number} zoneHour
 * @returns {number|undefined}
 */
export function mostRecentDueSlotHour(zoneHour) {
  let due;
  for (const slot of SLOT_HOURS_ET) {
    if (slot <= zoneHour) due = slot;
  }
  return due;
}

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
 *
 * EXEC-phase TESTING sub-agent finding F6 (merge-blocking, discovered after the SEC-H1
 * enqueue-only pivot): for the BACKSTOP'S OWN kind, an owed/sending row must NOT expire into
 * 'unfilled' after STALENESS_GRACE_MS. Enqueueing is this sweep's entire deliverable — there is
 * no credentialed dispatcher in this process to ever move it past 'owed' during a genuine
 * outage (that is the whole point of enqueue-only). Applying the live-path staleness grace to
 * the backstop's OWN row meant every 15-minute tick during a sustained outage re-classified its
 * own still-owed prior attempt as stale and enqueued ANOTHER one — a growing pile of duplicate
 * obligations that would all deliver as a delivery burst once a credentialed process eventually
 * drained the queue, the opposite of what this SD exists to prevent. `ownKind: true` is passed
 * ONLY for the backstop's own kind's row; the live path's staleness/grace behavior (a stuck live
 * send genuinely warrants a backstop fill after the grace period) is unchanged.
 * @param {{status?: string, created_at?: string}|null} row the most recent row for one kind,
 *   within the trailing lookback window (or null if none exists)
 * @param {Date} now
 * @param {{ownKind?: boolean}} [opts] ownKind=true when `row` is this sweep's OWN prior kind
 * @returns {'filled'|'in_flight'|'unfilled'|'do_not_retry'}
 */
export function classifyRowCoverage(row, now, { ownKind = false } = {}) {
  if (!row || !row.status) return 'unfilled';
  const { status } = row;
  if (status === 'sent' || status === 'delivered') return 'filled';
  if (status === 'canceled' || status === 'owed_escalate') return 'do_not_retry';
  if (status === 'owed' || status === 'sending') {
    if (ownKind) return 'in_flight'; // F6 fix: never re-enqueue merely because our own prior attempt hasn't been dispatched yet.
    const ageMs = row.created_at ? now.getTime() - new Date(row.created_at).getTime() : Infinity;
    return ageMs < STALENESS_GRACE_MS ? 'in_flight' : 'unfilled';
  }
  return 'unfilled'; // undelivered | failed — a terminal failure signal, always retry (own or live).
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
 * Reads the most recent obligation row for `kind` created since `sinceIso` — the current DUE
 * SLOT's instant (see mostRecentDueSlotHour/main() above), not a fixed lookback duration.
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

/**
 * Minimal, honest content — never a fabricated all-good (FR-4). Includes hourKey (EXEC-phase
 * TESTING sub-agent finding N2, now the per-slot label under QF-20260828-650): during a
 * sustained outage, a fresh fill happens roughly once per due slot — without a distinguishing
 * label every one of those recovery-burst messages would be byte-identical and the chairman
 * could not tell which slots were actually covered.
 */
export function buildBackstopBody({ liveVerdict, backstopVerdict, hourKey }) {
  // QF-20260828-188 (leg 1): was "hourly heartbeat check-in" — self-described a cadence the
  // ratified contract (9eebe200) retired same-day. "routine" names the SMS class, not a cadence,
  // so this body never drifts out of sync with the live contract again.
  return `[backstop ${hourKey}] Still here — routine heartbeat check-in (no live heartbeat reached for this slot; live=${liveVerdict}, prior-backstop=${backstopVerdict}).`;
}

export { etHourWindowUtc };

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const now = deps.now instanceof Date ? deps.now : (Number.isFinite(deps.now) ? new Date(deps.now) : new Date());
  const enqueue = deps.enqueue || enqueueChairmanSms;
  const resolveQuietHours = deps.resolveQuietHoursContext || resolveQuietHoursContext;
  const log = (obj) => logger.log?.(`[hourly-heartbeat-backstop] ${JSON.stringify(obj)}`);

  if (args.help) { logger.log?.('chairman-hourly-heartbeat-backstop-sweep --once [--dry-run]'); return { exitCode: 0, action: 'help' }; }

  const recipientPhone = env.CHAIRMAN_PHONE;
  if (!recipientPhone) {
    log({ action: 'inert', reason: 'chairman_phone_unset' });
    return { exitCode: 0, action: 'inert', reason: 'chairman_phone_unset' };
  }

  const { allowQuietHours, chairmanZone } = await resolveQuietHours(now);

  // nowHourKey is this tick's own zone-hour label, used only to derive zoneHour and the coarse
  // window gate below — NOT the coverage-read/dedupe label (that's slotKey, derived after the
  // due-slot lookup a few lines down).
  const { hourKey: nowHourKey } = etHourWindowUtc(now, chairmanZone);
  const zoneHour = Number(nowHourKey.slice(-2));
  if (zoneHour >= WINDOW_END_ZONE_HOUR || zoneHour < WINDOW_START_ZONE_HOUR) {
    log({ action: 'inert', reason: 'outside_coarse_window', zone_hour: zoneHour });
    return { exitCode: 0, action: 'inert', reason: 'outside_coarse_window' };
  }

  // EXEC-phase SECURITY sub-agent finding (SEC-H1 remediation): this sweep no longer calls
  // sendChairmanSMS, so its rubric-gate quiet-hours check is no longer inherited for free.
  // Explicit chairman-zone-aware quiet-hours gate, reusing the existing isSmsQuietHour rather
  // than reimplementing (matches the drop-not-queue behavior already established for
  // heartbeat-class sends; a chairman-authorized allowQuietHours override still applies).
  if (!allowQuietHours && isSmsQuietHour(now, chairmanZone)) {
    log({ action: 'inert', reason: 'quiet_hours', zone_hour: zoneHour });
    return { exitCode: 0, action: 'inert', reason: 'quiet_hours' };
  }

  // QF-20260828-650: fixed ET slots replace the 3-hourly trailing window. `dueSlotHour` is the
  // most-recently-due slot at-or-before this tick's zone hour; undefined means no slot has come
  // due yet today (zoneHour is inside the coarse window but before SLOT_HOURS_ET[0]).
  const dueSlotHour = mostRecentDueSlotHour(zoneHour);
  if (dueSlotHour === undefined) {
    log({ action: 'inert', reason: 'before_first_slot', zone_hour: zoneHour });
    return { exitCode: 0, action: 'inert', reason: 'before_first_slot' };
  }
  // slotKey reuses nowHourKey's date prefix ("YYYY-MM-DDT") with the DUE slot's hour, not the
  // current zone hour — e.g. at zone hour 14, nowHourKey="2026-07-18T14" but dueSlotHour=12
  // yields slotKey="2026-07-18T12". This is the per-tick label AND the per-slot dedupe basis.
  const slotKey = `${nowHourKey.slice(0, -2)}${String(dueSlotHour).padStart(2, '0')}`;
  const hourKey = slotKey; // downstream naming (log fields, buildBackstopBody arg) unchanged

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) { logger.error?.(`[hourly-heartbeat-backstop] supabase client unavailable: ${err.message}`); return { exitCode: 2, action: 'no_supabase' }; }

  // The due slot's UTC instant, derived from this tick's own hour-start (etHourWindowUtc's
  // startIso) offset backward by the zone-hour gap to the due slot — same DST-approximation
  // tolerance already accepted elsewhere in this module (etHourWindowUtc's own docstring).
  const { startIso: nowHourStartIso } = etHourWindowUtc(now, chairmanZone);
  const dueSlotInstantMs = new Date(nowHourStartIso).getTime() - (zoneHour - dueSlotHour) * 60 * 60 * 1000;
  const sinceIso = new Date(dueSlotInstantMs).toISOString();
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
  const backstopVerdict = classifyRowCoverage(backstopRow, now, { ownKind: true }); // F6 fix
  const hourVerdict = combineHourVerdict(liveVerdict, backstopVerdict);

  if (hourVerdict !== 'unfilled') {
    log({ action: 'no_send', reason: hourVerdict, live_verdict: liveVerdict, backstop_verdict: backstopVerdict, hour_key: hourKey });
    return { exitCode: 0, action: 'no_send', summary: { reason: hourVerdict, liveVerdict, backstopVerdict, hourKey } };
  }

  const body = (deps.buildBackstopBody || buildBackstopBody)({ liveVerdict, backstopVerdict, hourKey });
  // QF-20260828-650 (coordinator directive c56e93cc, rider a): PER-SLOT, no millisecond suffix —
  // a slot's coverage state is intentionally singular, so the dedupe_key UNIQUE constraint
  // (onConflict: 'dedupe_key', ignoreDuplicates: true — see enqueueChairmanSms) is itself the
  // guard against a near-simultaneous double-enqueue for the SAME slot, replacing the old
  // ms-timestamp defense-in-depth that the trailing-window design needed (every tick was its own
  // window, so a live key HAD to be unique per attempt; a slot is unique per due-time instead).
  const dedupeKey = `${BACKSTOP_KIND}:${hourKey}`;

  if (args.dryRun) {
    log({ action: 'dry_run', dedupe_key: dedupeKey, hour_key: hourKey, body_len: body.length });
    return { exitCode: 0, action: 'dry_run', summary: { dedupeKey, hourKey, bodyLength: body.length } };
  }

  // Owed-state enqueue ONLY (SEC-H1 remediation, see file header) — the pre-existing
  // sms-outbound-worker / any live sendChairmanSMS caller owns the actual provider dispatch.
  const enq = await enqueue(supabase, { recipientPhone, kind: BACKSTOP_KIND, body, decisionId: null, dedupeKey });
  // EXEC-phase TESTING sub-agent finding F7: a genuine enqueue failure (e.g. table_absent_or_
  // error) must be distinguishable in logs/action from the benign no-op reasons used elsewhere
  // (outside_coarse_window, quiet_hours, read_error, deduped) — a silently-failing backstop is
  // exactly the failure class this SD exists to eliminate.
  const action = enq.enqueued ? 'enqueued' : (enq.deduped ? 'deduped' : 'enqueue_error');

  // PII-safe: log outcome/reason only — never the recipient phone or the body text.
  log({
    action,
    obligation_id: enq.obligationId || null,
    reason: enq.reason || null,
    dedupe_key: dedupeKey,
    hour_key: hourKey,
  });
  return {
    exitCode: 0,
    action,
    summary: { enqueued: !!enq.enqueued, deduped: !!enq.deduped, reason: enq.reason || null, dedupeKey, hourKey, bodyLength: body.length, obligationId: enq.obligationId || null },
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
