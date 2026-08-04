#!/usr/bin/env node
/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-3) — the dispatcher for the chairman SMS leg.
 *
 * scripts/drive-report-sms.mjs had ZERO callers: no CLI, no workflow, nothing imported it but its
 * own test. Same defect class as TR-1's producer, one leg over — armed logic with no dispatcher
 * is indistinguishable from logic that always passes, and the failure is silent because absence
 * has no error message.
 *
 * ── IT DOES NOT SEND. IT ENQUEUES. ────────────────────────────────────────────────────────
 * The most important decision in this file, and it is not a preference. The fleet already has
 * ONE chairman-SMS path: enqueueChairmanSms writes an obligation to sms_outbound_obligations and
 * the pre-existing sms-outbound-worker owns delivery truth (provider accept vs. actual delivered
 * callback, retries, the sleep-window batch). chairman-morning-brief-sweep says it outright: it
 * "never sends via the provider directly".
 *
 * Handing sendDriveSms a Twilio client would have created a SECOND representation of "the
 * chairman was texted" — one with its own retry semantics, blind to the delivery reconciliation,
 * and bypassing the sleep-window queueing. So `send` here is a function that ENQUEUES.
 *
 * ── WHICH LAYER OWNS IDEMPOTENCE: THE BRIDGE, DECIDED EXPLICITLY ──────────────────────────
 * sendDriveSms has its own findSent/recordSent hooks and they are deliberately NOT used. They
 * are optional, and they would need a store this job does not have. MEASURED instead:
 * sms_outbound_obligations.dedupe_key is `TEXT UNIQUE` and enqueueChairmanSms upserts with
 * ignoreDuplicates, so a duplicate enqueue is a no-op AT THE DATABASE, durably and across
 * processes — which a per-run in-memory hook can never be. Two idempotence layers disagreeing is
 * worse than one that holds, so there is one, and the key names the window and the recipient.
 *
 * ── notBefore = 06:00 ET, WHICH SIDESTEPS A DISCREPANCY RATHER THAN PICKING A SIDE ────────
 * MEASURED, and the two sources disagree: sms_outbound_obligations' own DDL comment says the
 * sleep window is "10PM-6AM ET", while isWithinChairmanQuietWindow (resend-adapter.js) implements
 * 23:00-05:00 ET. The drive window opens at 05:00 ET, which is OUTSIDE the implemented window
 * and INSIDE the documented one. Rather than decide which is authoritative — not my call, and a
 * wrong guess texts the chairman while he is asleep — every obligation is queued not_before
 * 06:00 ET, which is safe under BOTH readings and costs nothing for a daily morning report. The
 * discrepancy is reported separately; it is not silently resolved here.
 *
 * ── A MISSING REPORT IS ITSELF THE SIGNAL (TR-3) ──────────────────────────────────────────
 * When no fresh report exists the SMS says exactly that. Suppressing it would make a dead
 * instrument indistinguishable from a healthy quiet day — and the whole point of a drive report
 * is that someone notices when it stops. The missing/stale body is its own closed-vocabulary
 * formatter, so no free text reaches the wire on that path either.
 *
 * LIVES IN scripts/cron/ because it WRITES (an obligation row). The FR-7 propose-only scan
 * forbids that under lib/drive-loop.
 */

import { sendDriveSms, VERDICTS } from '../drive-report-sms.mjs';
import { etParts, windowKey } from './drive-report-sweep.mjs';

export const SMS_KIND = 'drive_report';
export const DELIVER_AT_ET_HOUR = 6;

// NOTE: there is deliberately NO age-based staleness constant here any more. An earlier version
// gated on "past 2x cadence" and that is exactly what let yesterday's report through as fresh.
// Freshness is decided by IDENTITY (run_id === this window's key); age is only ever REPORTED, in
// the missing/stale body. Leaving a 2x-cadence constant in place would read as a policy that is
// no longer in force.

/**
 * The ET hour by which the producer's window (05:00-08:59 ET) has definitively closed.
 *
 * ── WHY THIS EXISTS: A NEAR-MISS THAT WOULD HAVE BEEN INVISIBLE ───────────────────────────
 * The first version of this sweep sent whatever report was newest, gated only on the 2x-cadence
 * staleness rule. In EST the cron's other DST line fires at 05:00 ET — BEFORE the producer has
 * run — and YESTERDAY's report is only ~24h old, well inside the 48h breach. So it read as
 * FRESH, and the sweep enqueued YESTERDAY'S NUMBERS under TODAY'S dedupe key. Because
 * dedupe_key is UNIQUE and scoped to the day, every later tick carrying today's real report was
 * then deduped away.
 *
 * The chairman would have received yesterday's drive score every single day, forever, with
 * plausible numbers, no error and nothing in any log to notice. A wrong reading that renders as
 * normal is the worst failure shape an instrument can have — worse than silence, which at least
 * prompts someone to ask.
 *
 * The fix is to stop inferring freshness from AGE and require IDENTITY: the report must be the
 * one for THIS window. And "not produced yet" must be distinguishable from "the window closed
 * without one" — the first is not a signal, the second is.
 */
export const PRODUCER_WINDOW_CLOSE_ET_HOUR = 9;

/**
 * Idempotence key. Names the WINDOW and the RECIPIENT: one obligation per chairman per report
 * day, so every later tick in the self-healing window is a database-level no-op.
 */
export function dedupeKeyFor(runId, recipientPhone) {
  return `${SMS_KIND}:${runId}:${recipientPhone}`;
}

/**
 * 06:00 ET on the calendar day of `nowMs`, as an ISO string. See the header — safe under both
 * readings of the sleep window.
 */
export function notBeforeFor(nowMs) {
  const { year, month, day } = etParts(nowMs);
  // Resolve the ET wall-clock hour to an instant by probing both plausible UTC offsets. Doing
  // this with a hardcoded -04:00/-05:00 is the DST bug TR-1 exists to not have.
  for (const offset of ['-04:00', '-05:00']) {
    const candidate = new Date(`${year}-${month}-${day}T0${DELIVER_AT_ET_HOUR}:00:00${offset}`);
    if (etParts(candidate.getTime()).hour === DELIVER_AT_ET_HOUR) return candidate.toISOString();
  }
  throw new Error('notBeforeFor(): could not resolve 06:00 ET to an instant — refusing rather than guessing an offset');
}

/**
 * How old the newest report is, in hours, or null when there is none or its stamp is unusable.
 * Null and 0 are different facts here — "never produced" versus "produced this instant" — so an
 * unparseable stamp reports null rather than collapsing to a number.
 */
export function ageHoursOf(report, nowMs) {
  const t = Date.parse(report?.generated_at);
  return Number.isFinite(t) ? (nowMs - t) / 3_600_000 : null;
}

/**
 * Turn a drive_reports row into the closed set of facts the SMS may carry. Returns null when the
 * row cannot supply them, so the caller sends the missing/stale signal rather than a zero.
 */
export function factsFromReport(report) {
  const score = report?.drive_score;
  const value = score?.score?.value;
  const possible = score?.possible;
  if (!Number.isFinite(value) || !Number.isFinite(possible)) return null;

  // The capacity verdict comes from leg 4 when it was measurable. UNKNOWN is a real member of
  // VERDICTS, so an unmeasured leg is SAID rather than defaulted to something reassuring.
  const raw = score?.capacity_verdict;
  const verdict = VERDICTS.includes(raw) ? raw : 'UNKNOWN';

  return {
    score: value,
    possible,
    verdict,
    unavailableLegs: Array.isArray(score?.unavailable_legs) ? score.unavailable_legs.length : 0,
    unownedBlockers: Number.isFinite(score?.unowned_blockers) ? score.unowned_blockers : 0,
  };
}

/**
 * @param {object} o
 * @param {number} o.nowMs
 * @param {() => Promise<object|null>} o.findLatestReport
 * @param {(args:object) => Promise<object>} o.enqueue enqueueChairmanSms, bound to a client
 * @param {string[]} o.recipients E.164
 */
export async function runDriveSmsSweep({ nowMs, findLatestReport, enqueue, recipients = [], log = () => {} } = {}) {
  if (typeof findLatestReport !== 'function' || typeof enqueue !== 'function') {
    throw new Error('runDriveSmsSweep(): findLatestReport and enqueue must be injected — a sweep whose send is hidden cannot be tested for whether it sent twice');
  }

  const runId = windowKey(nowMs);
  const report = await findLatestReport();

  // FRESHNESS IS IDENTITY, NOT AGE. The report must be the one produced for THIS window — see
  // PRODUCER_WINDOW_CLOSE_ET_HOUR for the near-miss that made this the rule.
  const isTodays = !!report && report.run_id === runId;

  let missing = null;
  let facts = null;

  if (isTodays) {
    facts = factsFromReport(report);
    // A row that exists but cannot supply numbers is NOT a usable report. Falling through to a
    // zero here would be the false-zero this SD keeps guarding against, one level up.
    if (!facts) missing = { ageHours: ageHoursOf(report, nowMs) };
  } else if (etParts(nowMs).hour < PRODUCER_WINDOW_CLOSE_ET_HOUR) {
    // NOT-YET-PRODUCED IS NOT A SIGNAL. The producer's window is still open, so enqueueing now
    // would burn the day's dedupe key on a message that is merely EARLY — and because that key
    // is UNIQUE, the real score could never replace it. Reported explicitly so no caller can
    // read it as a send.
    log(`waiting: no report for ${runId} yet, and the producer window is still open`);
    return { sent: false, waiting: 'producer_window_still_open', run_id: runId, recipients: 0, enqueued: [] };
  } else {
    // The window closed without a report for this run. NOW it is a signal, and TR-3 requires it
    // be said out loud: a dead instrument must not look like a healthy quiet day.
    missing = { ageHours: ageHoursOf(report, nowMs) };
  }

  const notBefore = notBeforeFor(nowMs);
  const enqueued = [];

  const result = await sendDriveSms({
    facts: facts ?? undefined,
    missing: missing ?? null,
    recipients,
    runId,
    // The bridge is the sender. It also owns idempotence via dedupe_key UNIQUE, so a repeated
    // tick returns {enqueued:false, deduped:true} and nothing is written twice.
    send: async (to, body) => {
      const r = await enqueue({ recipientPhone: to, kind: SMS_KIND, body, dedupeKey: dedupeKeyFor(runId, to), notBefore });
      enqueued.push({ to, deduped: !!r?.deduped, obligationId: r?.obligationId ?? null });
      if (r && r.enqueued === false && !r.deduped) {
        // A refusal that is not a dedupe is a real failure. Throwing beats returning a shape a
        // caller could mistake for success — the whole leg exists so someone HEARS about this.
        throw new Error(`runDriveSmsSweep(): enqueue refused for a recipient (${r.reason || 'unknown reason'})`);
      }
      return r;
    },
  });

  log(missing ? `enqueued MISSING/STALE signal for ${runId}` : `enqueued drive score for ${runId}`);
  return { ...result, run_id: runId, signal: missing ? 'missing_or_stale' : 'score', not_before: notBefore, enqueued };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('drive-report-sms-sweep: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  if (!process.env.CHAIRMAN_PHONE) {
    // Refuse rather than resolve to zero recipients: sendDriveSms treats an empty list as a
    // failed run, but failing HERE names the missing secret instead of the symptom.
    throw new Error('drive-report-sms-sweep: CHAIRMAN_PHONE is required — a send to nobody is a failed run, not a quiet success');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const { enqueueChairmanSms } = await import('../../lib/chairman/sms-bridge.js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const out = await runDriveSmsSweep({
    nowMs: Date.now(),
    recipients: [process.env.CHAIRMAN_PHONE],
    findLatestReport: async () => {
      const { data } = await supabase
        .from('drive_reports')
        // run_id IS LOAD-BEARING, not decoration: freshness is decided by identity
        // (report.run_id === today's window key), so omitting it here would make isTodays
        // permanently false and every day would report MISSING. A column the code reads and the
        // query does not fetch is undefined, never an error.
        .select('id, run_id, generated_at, drive_score')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enqueue: (args) => enqueueChairmanSms(supabase, args),
    log: (m) => console.log(`[drive-report-sms-sweep] ${m}`),
  });

  console.log(JSON.stringify({ ...out, body: undefined, results: undefined }));
}
