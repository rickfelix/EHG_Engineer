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

import { sendDriveSms, factsFromReport } from '../drive-report-sms.mjs';
// QF-20260807-118: canonical cross-platform entry guard. The hand-rolled
// `file://${process.argv[1]}`.replace(...) form this replaces NEVER fired on Windows — and the
// widened class-guard lint found this file only after that blind spot was closed.
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { etParts, windowKey } from './drive-report-sweep.mjs';
import { LAST_RUN_FIELD } from '../../lib/drive-loop/report-posture.js';

export const SMS_KIND = 'drive_report';
export const DELIVER_AT_ET_HOUR = 6;

/**
 * This leg's OWN liveness registration — separate from the producer's.
 *
 * ── WHY A SECOND KEY AND NOT THE PRODUCER'S ───────────────────────────────────────────────
 * FR-7's staleness alarm watches a periodic_process_registry row. The producer registers and
 * stamps one; until now this sweep registered nothing. So "producer healthy, SMS leg dead"
 * left the alarm GREEN while the chairman received nothing and nobody was told — the exact
 * armed-with-no-dispatcher class this SD exists to retire, one leg over, and it would have
 * been invisible precisely because the OTHER leg was working. Found by the SECURITY sub-agent.
 *
 * The interval is DAILY like the producer's: one obligation per report day.
 */
export const SMS_SD_KEY = 'SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B-sms';
export const SMS_ACTIVATION_TRIGGER = '.github/workflows/drive-report-sms-cron.yml';
export const SMS_EXPECTED_INTERVAL_SECONDS = 24 * 60 * 60;

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
  if (!Number.isFinite(t)) return null;
  // CLAMPED AT ZERO. generated_at is stamped from the PRODUCER's wall clock and compared here
  // against a DIFFERENT runner's — so a report can legitimately read as a few seconds in the
  // future, and a badly-skewed writer by much more. A negative age is a clock disagreement, not
  // a negative duration. Before the clamp this propagated into formatMissingBody and threw, on
  // the missing branch only, so the alarm broke exactly when it had something to say.
  return Math.max(0, (nowMs - t) / 3_600_000);
}

/**
 * RE-EXPORTED, NOT DEFINED HERE — moved to ../drive-report-sms.mjs by
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D.
 *
 * It was always the reading half of a pair whose writing half (formatBody) lives there, and it
 * imported VERDICTS back out of that module to do its job. A SECOND consumer now needs it — the
 * Adam SessionStart hook, which must turn the same row into the same facts — and importing THIS
 * file to get it would pull a cron dispatcher, its sibling sweep and report-posture onto a
 * 1500ms session-start budget. The alternative, re-deriving the read in the hook, is the two-
 * representations failure this SD family exists to prevent: the hook and the SMS would then be
 * free to disagree about what the score says while both looking correct.
 *
 * The re-export is deliberate rather than a compatibility shim to delete later: this file's
 * callers and tests import it from here, and that is a fine place to import it from.
 */
export { factsFromReport };

/**
 * @param {object} o
 * @param {number} o.nowMs
 * @param {() => Promise<object|null>} o.findLatestReport
 * @param {(args:object) => Promise<object>} o.enqueue enqueueChairmanSms, bound to a client
 * @param {string[]} o.recipients E.164
 */
export async function runDriveSmsSweep({ nowMs, findLatestReport, enqueue, findObligation = null, register = null, stamp = null, recipients = [], log = () => {} } = {}) {
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
    // zero here would be the false-zero this SD keeps guarding against, one level up. UNUSABLE
    // rather than STALE, because the producer RAN — it is the score that is unreadable, which is
    // a different cause pointing at a different remedy.
    if (!facts) missing = { kind: 'UNUSABLE', ageHours: ageHoursOf(report, nowMs) };
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
    const age = ageHoursOf(report, nowMs);
    missing = { kind: age === null ? 'NONE' : 'STALE', ageHours: age };
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
      const dedupeKey = dedupeKeyFor(runId, to);
      const r = await enqueue({ recipientPhone: to, kind: SMS_KIND, body, dedupeKey, notBefore });

      if (r && r.enqueued === false && !r.deduped) {
        // A refusal that is not a dedupe is a real failure. Throwing beats returning a shape a
        // caller could mistake for success — the whole leg exists so someone HEARS about this.
        throw new Error(`runDriveSmsSweep(): enqueue refused for a recipient (${r.reason || 'unknown reason'})`);
      }

      // A DEDUPE IS ONLY BENIGN IF THE ROW HOLDING THE KEY IS OURS.
      //
      // dedupe_key is a GLOBAL UNIQUE namespace and other callers pass keys straight through
      // (scripts/adam-chairman-decision.mjs -> chairman-sms-gate -> enqueueChairmanSms). Our key
      // is deterministic and therefore guessable, so a foreign row occupying it — crafted OR
      // accidental — makes every tick report "deduped", which we treated as the self-healing
      // window working. The chairman silently gets nothing and the job exits 0.
      //
      // Not privilege escalation: anyone who can write that table is already inside the trust
      // boundary. It is a SILENT-SUPPRESSION primitive, and silence is the one failure this leg
      // must never produce. So a dedupe is verified, not assumed. (SECURITY F3.)
      let verified = null;
      if (r?.deduped && typeof findObligation === 'function') {
        const existing = await findObligation(dedupeKey);
        verified = existing?.kind === SMS_KIND;
        if (!verified) {
          throw new Error(`runDriveSmsSweep(): dedupe key ${dedupeKey} is held by a foreign obligation `
            + `(kind=${JSON.stringify(existing?.kind ?? null)}) — this run sent NOTHING and must not report success`);
        }
      }

      enqueued.push({ to, deduped: !!r?.deduped, dedupe_verified: verified, obligationId: r?.obligationId ?? null });
      return r;
    },
  });

  // Stamped only after the enqueue actually succeeded — a failed run must leave this leg's own
  // alarm armed. Register BEFORE stamping: registerArmedMachinery upserts last_fired_at NULL, so
  // the reverse order erases the stamp every run. Same trap as the producer's, same ordering.
  if (register) {
    const reg = await register({ activationTrigger: SMS_ACTIVATION_TRIGGER, expectedIntervalSeconds: SMS_EXPECTED_INTERVAL_SECONDS });
    if (reg && reg.ok === false) log(`registry: registration failed (${reg.error}) — continuing; the SMS matters more than its bookkeeping`);
  }
  if (stamp) await stamp({ field: LAST_RUN_FIELD, at: new Date(nowMs).toISOString() });

  log(missing ? `enqueued MISSING/STALE signal for ${runId}` : `enqueued drive score for ${runId}`);
  return { ...result, run_id: runId, signal: missing ? 'missing_or_stale' : 'score', not_before: notBefore, enqueued };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
if (isMainModule(import.meta.url)) {
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
  const { registerArmedMachinery, armedProcessKey } = await import('../../lib/machinery-class/armed-registration.js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const smsProcessKey = armedProcessKey(SMS_SD_KEY);

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
        // SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4: cadence='scheduled' is a BACKSTOP alongside
        // the run_id identity check above — without it, an hourly row's different run_id would
        // make isTodays false and this sweep would report a false STALE alarm to the chairman
        // instead of correctly finding the daily row one query away.
        .select('id, run_id, generated_at, drive_score')
        .eq('cadence', 'scheduled')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enqueue: (args) => enqueueChairmanSms(supabase, args),
    // Reads back the row holding our dedupe key, so a benign dedupe is distinguishable from a
    // foreign obligation squatting on it (F3).
    findObligation: async (dedupeKey) => {
      const { data } = await supabase.from('sms_outbound_obligations').select('id, kind').eq('dedupe_key', dedupeKey).maybeSingle();
      return data || null;
    },
    register: (opts) => registerArmedMachinery(supabase, { sd_key: SMS_SD_KEY }, opts),
    stamp: async ({ field, at }) => {
      const { error } = await supabase.from('periodic_process_registry').update({ [field]: at }).eq('process_key', smsProcessKey);
      if (error) console.warn(`[drive-report-sms-sweep] stamp failed: ${error.message}`);
    },
    log: (m) => console.log(`[drive-report-sms-sweep] ${m}`),
  });

  // enqueued[] carries recipient phone numbers; stripped so delivery bookkeeping never prints a
  // number into a log that outlives the run (F10). The counts are what an operator needs.
  console.log(JSON.stringify({
    ...out,
    body: undefined,
    results: undefined,
    enqueued: (out.enqueued || []).map((e) => ({ deduped: e.deduped, dedupe_verified: e.dedupe_verified, obligationId: e.obligationId })),
  }));
}
