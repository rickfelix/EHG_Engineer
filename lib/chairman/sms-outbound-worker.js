/**
 * Durable, claim-serialized, idempotent send/reconcile worker for the chairman outbound SMS
 * channel. SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-3.
 *
 * WHY: FR-1 makes every outbound chairman SMS a durable 'owed' obligation row (written before
 * any provider send, in sms_outbound_obligations). This worker turns those owed rows into
 * actual sends — exactly once, serialized across concurrent workers/sessions — and reconciles
 * undelivered/failed rows with a bounded retry then an alert, so nothing is ever silently lost
 * and no send is ever double-charged.
 *
 * DURABILITY / NO SESSION-LOCAL TIMERS: reconcileOutboundSms is a plain async function invoked
 * by a DURABLE runner (scripts/cron/sms-outbound-reconcile-sweep.mjs --once, or any cron /
 * periodic-process-registry entry). It holds NO setTimeout/setInterval/cron of its own, so a
 * fresh session can run it cold and pick up owed rows left behind by a session that died mid-send
 * (the F1 failure mode). Verified by the git-grep pin in the test file.
 *
 * SERIALIZATION: the claim is the SAME single-use conditional-UPDATE idiom already proven in
 * lib/chairman/sms-bridge.js (consumeSmsReply / handleInboundSmsReply): an atomic
 * `UPDATE ... SET status='sending', claimed_at=now WHERE id=? AND status='owed' AND claimed_at IS NULL
 * RETURNING id`. Two concurrent workers both issue it; the DB serializes on the row so exactly
 * one sees status='owed' and wins — the loser's predicate no longer matches and it claims
 * nothing, so provider.send is called at most once per owed row (no double-charge, TR-3).
 *
 * DELIVERY-TRUTH: a successful provider.send is a Twilio 201-ACCEPT (status 'queued') — this
 * worker stamps status='sent' + sent_at, NEVER 'delivered'. delivered_at is set ONLY by a
 * signature-valid MessageStatus=delivered status callback (api/webhooks/twilio-sms.js, FR-2).
 *
 * STUCK-STATE RECONCILE (SECURITY MEDIUM-1/2 — the two most common stuck states):
 *   - sent-no-callback (MEDIUM-2 / SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A FR-2): a status='sent'
 *     row whose delivered_at is still NULL after SENT_DELIVERY_TIMEOUT no longer blindly re-arms.
 *     It QUERIES Twilio directly by provider_message_id: confirmed 'delivered' stamps
 *     delivered_at directly (the callback was just lost/late); confirmed 'undelivered'/'failed'
 *     takes the normal bounded retry/alert path; a failed or ambiguous provider-check escalates
 *     to 'owed_escalate' (Solomon Pin #3 — never silently closed, never blindly re-armed).
 *   - sending-crash reaper (MEDIUM-1): a status='sending' row whose claimed_at is older than
 *     CLAIM_TIMEOUT was stranded by a worker that died between the claim and the terminal update.
 *     NO-DOUBLE-SEND GUARD: a row that already carries a provider_message_id (or sent_at) WAS
 *     sent before the crash, so it is routed to the sent-no-callback path (flipped to 'sent'),
 *     never re-sent; only a row with NO provider_message_id AND NO sent_at (never sent) is
 *     re-armed for a fresh send.
 *
 * SLEEP-WINDOW AT RELEASE (Solomon Pin #1): every re-arm-to-'owed' (retryOrAlert) stamps
 * not_before from smsQuietWindowReleaseIso(now) — a row re-armed at 9:58PM ET is held for the
 * next 6AM ET release, not fired at the very next sweep tick.
 *
 * DUPLICATE-SEND HISTORY (Solomon Pin #2): a resend (a row whose provider_message_id already
 * carries a prior SID) preserves that prior SID in prior_provider_message_ids before overwriting
 * it, so a late callback for the ORIGINAL send still resolves against this row instead of
 * silently no-op'ing — the exact mechanism behind the live 7-duplicate incident this SD fixes.
 *
 * BURST AVOIDANCE (SD-LEO-FIX-SMS-OUTBOUND-WORKER-001): an outage-recovery sweep used to claim
 * and send EVERY eligible owed row with no age check and no per-drain cap — live incident:
 * 22 sends in one minute across 4 kinds on 2026-08-21. voidStaleAndCollapseObligations now
 * voids non-decision rows older than DEFAULT_STALE_THRESHOLD_MS AND past their not_before
 * (reusing status='canceled', never a new status value — see CANCELED_STATUS, always with an
 * alert(row) fire so a void is never silent) and collapses same-kind duplicates to the newest;
 * decision_question rows are NEVER auto-voided by the staleness check — a stale one with a
 * decision_id is re-emitted as a fresh re-ask and the ORIGINAL is then superseded (never left to
 * re-emit again every subsequent sweep). Pass 2 additionally slices the oldest-first claimable
 * set to DEFAULT_BURST_CAP — the PRIMARY control, since the real incident had zero duplicate
 * kinds and collapse alone would not have bounded it.
 *
 * FAIL-SOFT (mechanism, still correct): if the table is absent the liveness probe
 * short-circuits and reconcileOutboundSms returns a no-op summary rather than throwing.
 *
 * BUT THE TABLE IS NOT ABSENT. This header previously asserted "while the STAGED
 * sms_outbound_obligations migration is unapplied … this is inert pre-apply". MEASURED
 * 2026-08-02: to_regclass resolves, 17 columns, 395 rows — and a to_regclass control on a
 * known table confirmed the probe works. So this path is LIVE, not inert, and has been for
 * some time. The fail-soft branch remains as a defensive measure; the claim that it is the
 * normal case does not. (SD-LEO-INFRA-DECISION-RESURFACE-GUARDS-001 FR-3 — the same false
 * claim was spread across MORE files than the first sweep found — correcting one door left the
 * others serving stale, and the second sweep's own count was also short. Non-test files that have
 * asserted it: this file, chairman-sms-gate/index.js (x2), chairman-morning-review-sweep.mjs,
 * sms-outbound-reconcile-sweep.mjs, adam-decision-scheduler-tick.mjs (:9 and :34 — the PRODUCTION
 * RUNNER, missed by the second sweep), api/webhooks/twilio-sms.js:114, sms-bridge.js:209,
 * sms-outbound-worker.js:175 and :301, sms-channel-health.js:6. Grep the CLAIM, not the file you
 * were sent to — and do not state a count you have not just re-counted.)
 */
import twilioProvider from '../messaging/providers/twilio-provider.js';
import { smsOutboundObligationsLive, enqueueChairmanSms } from './sms-bridge.js';
import { smsQuietWindowReleaseIso } from '../time/chairman-et-wall-clock.js';
import { resolveChairmanZone } from '../comms/adam-outbound/quiet-hours-extension.js';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BATCH_LIMIT = 25;
// SECURITY MEDIUM-2: a row that reaches status='sent' but never receives a delivery callback
// (TWILIO_STATUS_CALLBACK_URL unset, or Twilio never calls back) is reconciled by the
// sent-delivery-timeout pass — the safety net that makes delivery-truth fire even with no
// callback, so F1 is fully (not half) closed.
export const DEFAULT_SENT_DELIVERY_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
// SECURITY MEDIUM-1: a worker crash between the claim (status='sending') and the terminal update
// strands the row in 'sending' forever; the claim-timeout reaper re-selects it after this long.
export const DEFAULT_CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

// SD-LEO-FIX-SMS-OUTBOUND-WORKER-001: burst-avoidance (void stale, collapse duplicates, cap
// sends). See voidStaleAndCollapseObligations below for the full mechanism.
//
// SECURITY (EXEC-TO-PLAN review, SEC-5): this threshold MUST stay well above
// scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs's own trailing lookback window
// (SLA_WINDOW_MS + STALENESS_GRACE_MS, ~65min at time of writing). That sweep maps status=canceled
// to do_not_retry; if staleThresholdMs were ever set below the backstop's lookback, a voided
// heartbeat row would suppress its own backstop replacement fill instead of being backfilled.
export const DEFAULT_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6h — single global threshold (TR-2)
export const DEFAULT_BURST_CAP = 3; // TR-3 — the PRIMARY control for the burst incident (VAL-4)
// VAL-1/TR-1: the ONLY place the literal string 'canceled' is written in this SD's new code.
// The live CHECK constraint accepts ONLY this exact lowercase spelling — 'cancelled' (double-L)
// and 'CANCELED' both raise 23514 (measured). A single constant eliminates the spelling-hazard.
// SECURITY (SEC-4): exported so sms-channel-health.js imports it too, rather than carrying a
// second, unlinked literal — a single source across this SD's full changed surface, not just
// within this one file.
export const CANCELED_STATUS = 'canceled';
const VOIDED_STALE_PREFIX = 'voided_stale:';
const VOIDED_SUPERSEDED_PREFIX = 'voided_superseded_by:';
// SECURITY (SEC-2): a stale decision_question row's re-ask supersedes the original -- without
// this, the original stays owed+stale and re-emits again on EVERY subsequent sweep (proven by
// execution: 9 genuine decisions -> 15 sends and a growing owed queue across a few sweeps).
const RE_ASKED_PREFIX = 're_asked_as:';
const DECISION_KIND = 'decision_question';
// VAL-2: deliberately far above DEFAULT_BATCH_LIMIT (25) — this select must see the FULL owed
// backlog, not a page. Not "no limit" (a defensive upper bound is still good practice); if this
// generous limit is ever hit, a warning is logged so the truncation is visible, not silent.
const STALE_VOID_SELECT_LIMIT = 1000;

/**
 * SECURITY LOW: never log a chairman phone number in plaintext — last 4 digits only.
 * @param {string} phone
 * @returns {string} masked form e.g. '***4567'
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '<no-phone>';
  const last4 = phone.replace(/\D/g, '').slice(-4);
  return last4 ? `***${last4}` : '<redacted>';
}

/**
 * Default alert seam — fired when an obligation exhausts its bounded retry budget. Kept as an
 * injectable seam (opts.alert) so the durable runner can wire real chairman-email escalation
 * (lib/notifications) without coupling this module to the email stack; the default is a
 * fail-soft structured log so retry-exhaustion is never SILENT even with no injected alerter.
 * The recipient phone is MASKED to last-4 (SECURITY LOW).
 * @param {{id: string, recipient_phone: string, attempts: number, last_error?: string}} row
 */
function defaultAlert(row) {
  // eslint-disable-next-line no-console
  console.error(`[sms-outbound-worker] ALERT: obligation ${row.id} to ${maskPhone(row.recipient_phone)} exhausted retries (attempts=${row.attempts}, last_error=${row.last_error || 'undelivered'})`);
}

/**
 * Shared bounded-retry-or-alert for a reconcile-eligible row: under the attempt cap it is
 * re-armed to 'owed' (claim cleared) guarded by `.in('status', fromStatuses)` so a concurrent
 * worker cannot double-re-arm; at/over the cap it is alerted once (ALERTED: prefix guard) and
 * left terminal 'failed', SAME `.in('status', fromStatuses)` guard (QF-20260816-312 — without
 * it, a row that transitioned to 'delivered' via the callback path between select and this
 * update was clobbered back to a terminal 'failed', with delivered_at semantics lost and the
 * ALERTED short-circuit permanently skipping it thereafter). Returns the summary bucket to
 * increment.
 *
 * Solomon Pin #1 (sleep-window AT RELEASE, not just at enqueue): the re-arm stamps not_before
 * from smsQuietWindowReleaseIso(now) — null (immediate) outside the 10PM-6AM ET window, or the
 * next 6AM ET instant when `now` falls inside it. Without this, a row re-armed at 9:58PM ET kept
 * its stale/already-elapsed not_before and was immediately reclaimed by the very next sweep tick.
 * @returns {Promise<'retried'|'alerted'|'skipped'>}
 */
async function retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses, reason, now, zone, logger = console }) {
  if ((row.attempts || 0) >= maxAttempts) {
    if ((row.last_error || '').startsWith('ALERTED:')) return 'skipped';
    try { await alert(row); } catch { /* alert seam is best-effort */ }
    const { error: alertErr } = await supabase
      .from('sms_outbound_obligations')
      .update({ status: 'failed', last_error: `ALERTED: ${row.last_error || reason}` })
      .eq('id', row.id)
      .in('status', fromStatuses)
      .select('id');
    // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002: warn only on a genuine error. A zero-rows match with no
    // error is a legitimate lost race (a concurrent worker/webhook already moved the row) and is
    // silently absorbed, matching voidStaleAndCollapseObligations's existing idiom exactly — do
    // not manufacture a new false-alarm source on this row's next sweep.
    if (alertErr) {
      logger.warn?.(`[sms-outbound-worker] retryOrAlert alert-write UPDATE failed for ${row.id}: ${alertErr.message}`);
    }
    return 'alerted';
  }
  const { error: retryErr } = await supabase
    .from('sms_outbound_obligations')
    .update({ status: 'owed', claimed_at: null, claimed_by: null, not_before: smsQuietWindowReleaseIso(now, zone) })
    .eq('id', row.id)
    .in('status', fromStatuses)
    .select('id');
  if (retryErr) {
    logger.warn?.(`[sms-outbound-worker] retryOrAlert re-arm UPDATE failed for ${row.id}: ${retryErr.message}`);
  }
  // A zero-rows match here (no error) is a legitimate lost race — silently absorbed, no warning.
  return 'retried';
}

/**
 * Solomon Pin #3 (callback-loss backstop polarity): an obligation with no delivery callback AND
 * a failed/inconclusive provider-check goes to 'owed_escalate' — never silently closed, never
 * blindly re-armed. Fires the same best-effort alert seam as retryOrAlert so the operator is
 * never left unaware.
 */
async function escalate(supabase, row, alert, reason, logger = console) {
  try { await alert(row); } catch { /* alert seam is best-effort */ }
  const { error: escalateErr } = await supabase
    .from('sms_outbound_obligations')
    .update({ status: 'owed_escalate', last_error: reason })
    .eq('id', row.id)
    .eq('status', 'sent')
    .select('id');
  // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002: THE root-cause fix. Before this, a rejected write here
  // (e.g. the live status CHECK constraint not yet including 'owed_escalate') was silently
  // discarded — the row stayed status='sent' with last_error still NULL and was re-selected and
  // re-alerted on every subsequent sweep, permanently. Now a genuine error is logged loudly; a
  // zero-rows match with no error is a legitimate lost race (already moved by a concurrent
  // worker/webhook) and is silently absorbed, matching voidStaleAndCollapseObligations's idiom.
  if (escalateErr) {
    logger.warn?.(`[sms-outbound-worker] escalate UPDATE failed for ${row.id} (reason=${reason}): ${escalateErr.message} — row remains status='sent' and will be re-selected next sweep`);
  }
}

/**
 * SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 — burst-avoidance pre-pass. Runs BEFORE Pass 2's
 * batchLimit-capped owed select (VAL-2/C2), against its OWN dedicated wide select, so a backlog
 * larger than DEFAULT_BATCH_LIMIT is not silently left unvoided beyond row 25.
 *
 * FR-1: kind != decision_question rows older than staleThresholdMs are voided (status=canceled,
 * TR-1's single spelling authority) instead of being claimed for send. A row whose not_before is
 * still in the future (deliberately deferred -- e.g. the quiet-window release path) is never
 * void-eligible: it has not yet had its chance to send (EXEC-TO-PLAN TESTING review finding).
 *
 * FR-2/VAL-3: decision_question rows are NEVER auto-voided. A stale one WITH a decision_id is
 * re-emitted as a fresh re-ask (via the existing enqueueChairmanSms, dedupeKey=null so it is
 * never deduped against the stale original) and the ORIGINAL is then superseded (status=canceled,
 * re_asked_as: prefix) so it is not re-considered on the next sweep -- without this a single stale
 * decision re-emits again on EVERY subsequent sweep (EXEC-TO-PLAN SECURITY review, SEC-2: proven
 * by execution to turn 9 genuine decisions into 15 sends with the owed queue growing despite the
 * burst cap). A stale one WITHOUT a decision_id (measured live: 71% of decision_question rows)
 * has nothing to re-emit against and is left completely untouched — still owed, still eligible
 * for normal (burst-cap-bounded) sending.
 *
 * FR-3: over the SURVIVING (non-stale, non-decision) rows from the same select, groups by kind
 * and voids every row but the newest per group as superseded.
 *
 * TR-5: every UPDATE here binds and checks `error`, AND chains .select('id') to distinguish a
 * genuine write from a lost race (0 rows matched, e.g. a concurrent worker already moved the row)
 * — SECURITY SEC-3: without the .select(), a lost race is indistinguishable from success and the
 * summary counters silently over-report. A rejected write or a lost race excludes the row from
 * the voided/collapsed/re-emitted count and leaves it `owed` for the next sweep to reconsider.
 *
 * SECURITY SEC-1: a successful stale-void fires the injectable alert(row) seam — the same "never
 * silently dropped" contract retryOrAlert and escalate already honor for every other terminal
 * outcome in this file. Collapse-voids do NOT alert: a collapsed row is a genuine duplicate of the
 * newest survivor being sent regardless, so no information is lost.
 *
 * @returns {Promise<{voided: number, reEmitted: number, collapsed: number, writeErrors: number}>}
 */
async function voidStaleAndCollapseObligations(supabase, { now, staleThresholdMs, alert, logger }) {
  const result = { voided: 0, reEmitted: 0, collapsed: 0, writeErrors: 0 };

  const { data: rows, error: selectErr } = await supabase
    .from('sms_outbound_obligations')
    .select('id, kind, decision_id, recipient_phone, body, created_at, not_before')
    .eq('status', 'owed')
    .order('created_at', { ascending: true })
    .limit(STALE_VOID_SELECT_LIMIT);
  if (selectErr) {
    logger.warn?.(`[sms-outbound-worker] voidStaleAndCollapseObligations: select failed (${selectErr.message}) — skipping this pass`);
    return result;
  }
  if (rows && rows.length === STALE_VOID_SELECT_LIMIT) {
    logger.warn?.(`[sms-outbound-worker] voidStaleAndCollapseObligations: owed backlog >= ${STALE_VOID_SELECT_LIMIT} rows — this pass may be truncated; re-run sooner.`);
  }

  const staleCutoff = now - staleThresholdMs;
  const surviving = [];
  // Mirrors Pass 2's own claimable predicate exactly: a row is only eligible for anything (void
  // OR collapse-as-superseded OR re-ask) once its not_before has actually elapsed.
  const notBeforeElapsed = (row) => !row.not_before || new Date(row.not_before).getTime() <= now;
  const isStaleAndDue = (row) => new Date(row.created_at).getTime() < staleCutoff && notBeforeElapsed(row);

  for (const row of rows || []) {
    // FR-2/VAL-3: decision_question rows are NEVER voided by the staleness path and NEVER
    // collapse-candidates, regardless of staleness — checked FIRST, before the staleness branch
    // below, so a FRESH decision row is excluded from `surviving` (and thus from the by-kind
    // collapse step) just as reliably as a stale one.
    if (row.kind === DECISION_KIND) {
      if (isStaleAndDue(row) && row.decision_id) {
        const reEmitRes = await enqueueChairmanSms(supabase, {
          recipientPhone: row.recipient_phone, kind: row.kind, body: row.body,
          decisionId: row.decision_id, dedupeKey: null,
        });
        if (reEmitRes.enqueued) {
          const { data: supersededRows, error: supersedeErr } = await supabase
            .from('sms_outbound_obligations')
            .update({ status: CANCELED_STATUS, last_error: `${RE_ASKED_PREFIX}${reEmitRes.obligationId}` })
            .eq('id', row.id)
            .eq('status', 'owed')
            .select('id');
          if (supersedeErr) {
            logger.warn?.(`[sms-outbound-worker] re-ask supersede UPDATE failed for ${row.id}: ${supersedeErr.message} — original stays owed and will be reconsidered next sweep`);
            result.writeErrors++;
          } else if (!supersededRows || supersededRows.length === 0) {
            logger.warn?.(`[sms-outbound-worker] re-ask supersede UPDATE matched 0 rows for ${row.id} — a concurrent worker moved it first`);
          }
          result.reEmitted++;
        } else {
          logger.warn?.(`[sms-outbound-worker] re-ask enqueue failed for stale decision obligation ${row.id}: ${reEmitRes.reason || 'unknown'}`);
        }
      }
      continue;
    }

    if (!isStaleAndDue(row)) { surviving.push(row); continue; }

    const { data: voidedRows, error: voidErr } = await supabase
      .from('sms_outbound_obligations')
      .update({ status: CANCELED_STATUS, last_error: `${VOIDED_STALE_PREFIX}${Math.round((now - new Date(row.created_at).getTime()) / 60000)}m` })
      .eq('id', row.id)
      .eq('status', 'owed')
      .select('id');
    if (voidErr) {
      logger.warn?.(`[sms-outbound-worker] stale-void UPDATE failed for ${row.id}: ${voidErr.message}`);
      result.writeErrors++;
      surviving.push(row); // fail-soft: not voided, still eligible — reconsidered next sweep
    } else if (!voidedRows || voidedRows.length === 0) {
      surviving.push(row); // lost race (SEC-3): a concurrent worker already moved this row — not voided by THIS call
    } else {
      result.voided++;
      try { await alert(row); } catch { /* alert seam is best-effort */ }
    }
  }

  // FR-3: same-kind collapse over the survivors (staleness-void already excluded decision_question).
  const byKind = new Map();
  for (const row of surviving) {
    const list = byKind.get(row.kind) || [];
    list.push(row);
    byKind.set(row.kind, list);
  }
  for (const group of byKind.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const newest = group[group.length - 1];
    for (const dup of group.slice(0, -1)) {
      const { data: collapsedRows, error: collapseErr } = await supabase
        .from('sms_outbound_obligations')
        .update({ status: CANCELED_STATUS, last_error: `${VOIDED_SUPERSEDED_PREFIX}${newest.id}` })
        .eq('id', dup.id)
        .eq('status', 'owed')
        .select('id');
      if (collapseErr) {
        logger.warn?.(`[sms-outbound-worker] collapse UPDATE failed for ${dup.id}: ${collapseErr.message}`);
        result.writeErrors++;
      } else if (collapsedRows && collapsedRows.length > 0) {
        result.collapsed++;
      } // else: lost race (SEC-3) — not collapsed by THIS call, no counter bump
    }
  }

  return result;
}

/**
 * Reconcile the outbound SMS obligation queue: retry-or-alert terminal-failure rows, then claim
 * and send owed rows exactly once. Idempotent (a delivered row is never touched) and serialized
 * (concurrent workers never double-send).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service_role client
 * @param {{provider?: object, workerId?: string, maxAttempts?: number, batchLimit?: number,
 *   alert?: Function, now?: number, sentDeliveryTimeoutMs?: number, claimTimeoutMs?: number,
 *   statusCallbackUrl?: string, logger?: object, resolveChairmanZone?: Function,
 *   staleThresholdMs?: number, burstCap?: number}} [opts]
 *   resolveChairmanZone: injectable (Date) => Promise<{zone, source}>, default the real
 *   FR-2 resolver (SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-4) -- tests should inject a stub
 *   to avoid a live Supabase read.
 *   staleThresholdMs/burstCap: SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 TR-2/TR-3 overrides.
 * @returns {Promise<{ran: boolean, reason?: string, claimed: number, sent: number,
 *   failed: number, retried: number, alerted: number, skipped: number, reaped: number,
 *   sentTimedOut: number, escalated: number, confirmedDelivered: number, voided: number,
 *   reEmitted: number, collapsed: number, unconfigured: number}>}
 */
export async function reconcileOutboundSms(supabase, opts = {}) {
  const {
    provider = twilioProvider,
    workerId = `worker-${process.pid || 'x'}-${Math.random().toString(36).slice(2, 8)}`,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    batchLimit = DEFAULT_BATCH_LIMIT,
    alert = defaultAlert,
    now = Date.now(),
    sentDeliveryTimeoutMs = DEFAULT_SENT_DELIVERY_TIMEOUT_MS,
    claimTimeoutMs = DEFAULT_CLAIM_TIMEOUT_MS,
    statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL || '',
    logger = console,
    staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
    burstCap = DEFAULT_BURST_CAP,
  } = opts;

  const summary = { ran: false, claimed: 0, sent: 0, failed: 0, retried: 0, alerted: 0, skipped: 0, reaped: 0, sentTimedOut: 0, escalated: 0, confirmedDelivered: 0, voided: 0, reEmitted: 0, collapsed: 0, unconfigured: 0 };

  // FR-1 fail-soft: inert while the STAGED table is absent (never throws).
  if (!(await smsOutboundObligationsLive(supabase))) {
    return { ...summary, reason: 'table_absent' };
  }
  summary.ran = true;

  const nowIso = new Date(now).toISOString();
  // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-4, TR-2): resolved ONCE per sweep invocation
  // (never inside retryOrAlert's per-row loop -- see TR-2) and threaded through every re-arm
  // below. resolveChairmanZone never throws (fails safe to America/New_York).
  const { zone: chairmanZone } = await (opts.resolveChairmanZone || resolveChairmanZone)(new Date(now));

  // MEDIUM-2 (approach b + loud log): with no callback URL configured, delivery-truth can only
  // come from the sent-delivery-timeout safety net below. Log loudly so the operator knows the
  // callback path is disabled (fail-soft — never throws).
  if (!statusCallbackUrl) {
    logger.warn?.('[sms-outbound-worker] TWILIO_STATUS_CALLBACK_URL is unset — delivery callbacks are DISABLED; sent rows are reconciled only by the sent-delivery-timeout safety net.');
  }

  // ---- Pass 1: reconcile terminal-failure rows (bounded retry, then alert) ----
  // An undelivered/failed row under the attempt cap is re-armed to 'owed' (claim cleared) so the
  // send pass re-attempts it; at/over the cap it is left 'failed' and alerted — never silently
  // dropped (FR-3).
  const { data: failedRows } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, attempts, last_error, status')
    .in('status', ['undelivered', 'failed'])
    .limit(batchLimit);

  for (const row of failedRows || []) {
    const outcome = await retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses: ['undelivered', 'failed'], reason: 'undelivered', now, zone: chairmanZone, logger });
    summary[outcome]++;
  }

  // ---- Pass 1b: sending-crash reaper (SECURITY MEDIUM-1) ----
  // A status='sending' row whose claimed_at is older than the claim-timeout was stranded by a
  // worker that died between the claim and the terminal update.
  const { data: stuckSending } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, attempts, last_error, status, claimed_at, provider_message_id, sent_at')
    .eq('status', 'sending')
    .limit(batchLimit);

  for (const row of stuckSending || []) {
    // Only reap rows whose claim has genuinely timed out — an active worker's fresh claim is left alone.
    if (!row.claimed_at || new Date(row.claimed_at).getTime() > (now - claimTimeoutMs)) { summary.skipped++; continue; }

    if (row.provider_message_id || row.sent_at) {
      // NO-DOUBLE-SEND GUARD: this row WAS already sent before the crash (the provider returned a
      // SID). Route it to the sent-delivery-timeout path — flip to 'sent' (never re-send). If
      // sent_at was never persisted, best-estimate it from claimed_at so the timeout pass can age it.
      const { error: reapErr } = await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'sent', sent_at: row.sent_at || row.claimed_at || nowIso })
        .eq('id', row.id)
        .eq('status', 'sending')
        .select('id');
      // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002: warn on a genuine error; a zero-rows match with no
      // error is a legitimate lost race (silently absorbed, matching this file's own idiom).
      if (reapErr) {
        logger.warn?.(`[sms-outbound-worker] sending-crash reaper UPDATE failed for ${row.id}: ${reapErr.message} — row remains status='sending', will be re-reaped next sweep once the claim ages out again`);
      }
      summary.reaped++;
    } else {
      // Never sent (no SID, no sent_at) — safe to re-arm for a fresh send (bounded), or alert at cap.
      const outcome = await retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses: ['sending'], reason: 'sending_crash_timeout', now, zone: chairmanZone, logger });
      summary[outcome === 'retried' ? 'reaped' : outcome]++;
    }
  }

  // ---- Pass 1c: sent-no-callback delivery-timeout (SECURITY MEDIUM-2 / FR-2) ----
  // A status='sent' row whose delivered_at is still NULL after the sent-delivery-timeout never
  // got a delivery callback. FR-2: query Twilio directly by provider_message_id instead of
  // blindly re-arming — re-owe happens ONLY on a provider-CONFIRMED non-delivery. Solomon Pin #3:
  // a failed/inconclusive provider-check (not a confirmed answer either way) escalates to
  // 'owed_escalate', never silently closed and never blindly re-armed.
  const { data: sentRows } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, attempts, last_error, status, sent_at, delivered_at, provider_message_id')
    .eq('status', 'sent')
    .is('delivered_at', null)
    .limit(batchLimit);

  // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002 (FR-2): mirrors Pass 2's existing
  // SD-LEO-INFRA-FLEET-DEAD-MAN-001 guard. Without this, an unconfigured/down Twilio provider
  // makes provider.checkMessageStatus throw for every eligible row below, which escalate()
  // treats as Pin #3's "provider-check failed" case — dead-lettering rows into owed_escalate's
  // zero-exit-path terminal state due to a transient/local misconfiguration, not a genuine
  // delivery problem. Skip only THIS pass untouched (unlike Pass 2's own guard, this must NOT
  // return from reconcileOutboundSms — Pass 2's claim+send below is independent and must still
  // run even when the provider was unconfigured for this specific pass' check-status calls).
  const pass1cProviderConfigured = provider.isConfigured ? provider.isConfigured() : true;
  if (!pass1cProviderConfigured && (sentRows || []).length > 0) {
    logger.warn?.(`[sms-outbound-worker] provider unconfigured — skipping ${sentRows.length} sent-no-callback row(s) untouched (twilio_not_configured)`);
    summary.unconfigured += sentRows.length;
  }

  for (const row of (pass1cProviderConfigured ? (sentRows || []) : [])) {
    // Within the timeout (still awaiting a legitimate callback) — leave it alone.
    if (!row.sent_at || new Date(row.sent_at).getTime() > (now - sentDeliveryTimeoutMs)) { summary.skipped++; continue; }

    if (!row.provider_message_id) {
      // No SID to check against — cannot confirm either way. Escalate rather than guess.
      await escalate(supabase, row, alert, 'sent_no_delivery_callback_no_provider_message_id', logger);
      summary.escalated++;
      continue;
    }

    let checkedStatus;
    let checkedDateUpdated;
    try {
      const check = await provider.checkMessageStatus(row.provider_message_id);
      checkedStatus = check.status;
      checkedDateUpdated = check.dateUpdated;
    } catch (err) {
      // The provider-check itself failed — Pin #3's literal "no callback AND a failed
      // provider-check" case. Escalate, never silently closed.
      await escalate(supabase, row, alert, `provider_check_failed:${err?.message || 'unknown'}`, logger);
      summary.escalated++;
      continue;
    }

    if (checkedStatus === 'delivered') {
      // The callback was lost/late but Twilio confirms delivery — stamp delivered-truth
      // directly. Never re-owe a message that actually delivered.
      // QF-20260729-286: prefer Twilio's own date_updated (the true delivery-confirmation
      // time) over this poll tick's `now` -- this backstop only runs periodically (observed
      // ~60-90min apart), so stamping `nowIso` understated true delivery time by up to the
      // sweep interval, sometimes over 11 hours (measured live 2026-07-29). Fall back to
      // nowIso if Twilio's field is absent or unparseable -- an approximate truthful stamp
      // beats no stamp at all, and this is strictly no worse than the pre-fix behavior.
      const parsedDeliveredAt = checkedDateUpdated ? new Date(checkedDateUpdated) : null;
      const deliveredAtIsValid = parsedDeliveredAt && !Number.isNaN(parsedDeliveredAt.getTime());
      const deliveredAtIso = deliveredAtIsValid ? parsedDeliveredAt.toISOString() : nowIso;
      // SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3: this write site is independent of
      // applyOwedDeliveryTruth (lib/chairman/owed-delivery-truth.js) — Pass 1c has never routed
      // through it, so the discriminator is stamped directly here, not via that shared writer.
      // carrier_poll = Twilio's own date_updated was usable; local_clock_fallback = it was
      // absent/unparseable and this poll tick's own clock was used instead.
      const deliveryStatusSource = deliveredAtIsValid ? 'carrier_poll' : 'local_clock_fallback';
      let { error: deliveredErr } = await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'delivered', delivered_at: deliveredAtIso, delivery_status_source: deliveryStatusSource })
        .eq('id', row.id)
        .eq('status', 'sent')
        .select('id');
      // PLAN_VERIFICATION VAL-C2/REGRESSION: a missing delivery_status_source column makes
      // PostgREST reject the WHOLE update (PGRST204), not just that one field — so pre-migration,
      // delivered_at/status never get stamped either. Retry without the new column so the core
      // delivered-truth write still lands while the column is unapplied.
      if (deliveredErr?.code === 'PGRST204') {
        // count-truncation-diff-lint: bounded by a primary-key .eq('id', ...), so at most one row
        // can ever match — the literal .limit(1) makes that visible, matching this file's own
        // pre-existing convention.
        ({ error: deliveredErr } = await supabase
          .from('sms_outbound_obligations')
          .update({ status: 'delivered', delivered_at: deliveredAtIso })
          .eq('id', row.id)
          .eq('status', 'sent')
          .select('id')
          .limit(1));
      }
      // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002: warn on a genuine error; a zero-rows match with no
      // error is a legitimate lost race (silently absorbed, matching this file's own idiom).
      if (deliveredErr) {
        logger.warn?.(`[sms-outbound-worker] confirmedDelivered stamp UPDATE failed for ${row.id}: ${deliveredErr.message} — Twilio confirms delivery but the local ledger was not updated, row remains status='sent'`);
      }
      // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002 (pre-existing, unchanged by this SD): confirmedDelivered
      // counts that TWILIO confirmed the delivery, not that the local write succeeded — a write
      // failure is surfaced via the warn() above instead. The PGRST204 retry above is what actually
      // fixes VAL-C2 (pre-migration, this write no longer fails on every single poll cycle).
      summary.confirmedDelivered++;
    } else if (checkedStatus === 'undelivered' || checkedStatus === 'failed') {
      // Provider-CONFIRMED non-delivery (never blind) — the normal bounded retry/alert path.
      const outcome = await retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses: ['sent'], reason: 'sent_no_delivery_callback_provider_confirmed', now, zone: chairmanZone, logger });
      summary[outcome === 'retried' ? 'sentTimedOut' : outcome]++;
    } else {
      // Twilio itself reports a non-terminal status despite our own timeout having elapsed —
      // genuinely ambiguous. Escalate rather than silently retry or silently close.
      await escalate(supabase, row, alert, `provider_check_ambiguous_status:${checkedStatus}`, logger);
      summary.escalated++;
    }
  }

  // ---- Pre-Pass-2: void stale non-decision obligations, collapse same-kind duplicates ----
  // SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 FR-1/FR-2/FR-3. Runs BEFORE Pass 2's owed select below,
  // against its own wide select (VAL-2) — so Pass 2's select naturally reflects the post-void/
  // collapse state (voided rows no longer carry status='owed').
  const voidCollapseResult = await voidStaleAndCollapseObligations(supabase, { now, staleThresholdMs, alert, logger });
  summary.voided = voidCollapseResult.voided;
  summary.reEmitted = voidCollapseResult.reEmitted;
  summary.collapsed = voidCollapseResult.collapsed;

  // ---- Pass 2: claim + send owed rows (serialized, exactly once, capped to burstCap) ----
  // QF-20260720-287: prior_provider_message_ids (Solomon Pin #2, database/migrations/
  // 20260718_sms_outbound_obligations_STAGED.sql) is chairman-gated STAGED and was never
  // actually applied live, though the base table + every other column WAS. A missing column
  // fails this WHOLE select (error 42703, data:null) rather than degrading per-row, so
  // (owed||[]) silently emptied claimable on every sweep — a total send outage on the gated
  // path, live-verified: claimed:0/sent:0 fleet-wide since this SD's code merged, masked only
  // by the direct-Twilio workaround. Detect the column once and drop it from every touchpoint
  // (this select, the claim-UPDATE's own RETURNING select, and the 'sent' write below) when
  // absent — the Pin #2 duplicate-SID history feature is simply inert pre-apply, matching the
  // fail-soft contract this table's own migration file documents; core claim+send is restored.
  const OWED_SELECT_COLUMNS = 'id, recipient_phone, body, attempts, decision_id, not_before, media_url, provider_message_id, prior_provider_message_ids';
  let { data: owed, error: owedErr } = await supabase
    .from('sms_outbound_obligations')
    .select(OWED_SELECT_COLUMNS)
    .eq('status', 'owed')
    .order('created_at', { ascending: true })
    .limit(batchLimit);
  let hasPriorSidColumn = true;
  if (owedErr && owedErr.code === '42703') {
    hasPriorSidColumn = false;
    ({ data: owed } = await supabase
      .from('sms_outbound_obligations')
      .select(OWED_SELECT_COLUMNS.replace(', prior_provider_message_ids', ''))
      .eq('status', 'owed')
      .order('created_at', { ascending: true })
      .limit(batchLimit));
  }
  const claimSelectColumns = hasPriorSidColumn
    ? 'id, recipient_phone, body, attempts, media_url, provider_message_id, prior_provider_message_ids'
    : 'id, recipient_phone, body, attempts, media_url, provider_message_id';

  // not_before honored: a row queued inside the 10PM-6AM ET sleep window is not eligible until
  // its not_before elapses (FR-3 / sleep-window). Filtered here so an un-due row is never claimed.
  //
  // SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 FR-4 (VAL-4 — the PRIMARY burst control): already
  // oldest-first via the .order() above, so a plain slice keeps the longest-waiting rows.
  // Anything beyond the cap stays status='owed' and is naturally reconsidered next sweep — no
  // new state, no new column.
  const claimable = (owed || [])
    .filter((r) => !r.not_before || new Date(r.not_before).getTime() <= now)
    .slice(0, burstCap);

  // FR-2 (SD-LEO-INFRA-FLEET-DEAD-MAN-001): the dead-coordinator alert's own narrow
  // edge-trigger makes exactly ONE off-host send attempt per outage. When that attempt hit
  // an unconfigured Twilio account, the pre-fix code still claimed the row, burned an
  // attempts slot, and left the ONLY retry path to Pass 1 -- one full sweep later, off-host,
  // with no scheduled trigger to make it happen. Checking config presence before claiming
  // anything means an unconfigured outage leaves every owed row completely untouched
  // (still 'owed', attempts unchanged) instead of consuming retry budget it can't spend.
  // provider.isConfigured is optional -- test doubles that omit it are treated as configured.
  const providerConfigured = provider.isConfigured ? provider.isConfigured() : true;

  if (!providerConfigured) {
    if (claimable.length > 0) {
      logger.warn?.(`[sms-outbound-worker] provider unconfigured — skipping ${claimable.length} owed row(s) untouched (twilio_not_configured)`);
    }
    // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002 (FR-2): += , not = -- Pass 1c's isConfigured guard
    // above may have already contributed to summary.unconfigured in this same sweep; a bare
    // assignment here would silently clobber that count instead of adding to it.
    summary.unconfigured += claimable.length;
    return summary;
  }

  for (const row of claimable) {
    // Atomic single-use claim — the serialization point. A concurrent worker that already
    // claimed this row flipped status off 'owed', so this UPDATE matches 0 rows and we skip it
    // (no send, no double-charge).
    const { data: claimed } = await supabase
      .from('sms_outbound_obligations')
      .update({ status: 'sending', claimed_at: nowIso, claimed_by: workerId })
      .eq('id', row.id)
      .eq('status', 'owed')
      .is('claimed_at', null)
      .select(claimSelectColumns);

    if (!claimed || claimed.length === 0) {
      summary.skipped++;
      continue; // lost the claim race — the other worker owns this send
    }
    summary.claimed++;

    const c = claimed[0];
    const attempts = (c.attempts || 0) + 1;
    let result;
    try {
      result = await provider.send({ to: c.recipient_phone, body: c.body, mediaUrl: c.media_url });
    } catch (err) {
      result = { status: 'failed', reason: err?.message || 'provider_threw' };
    }

    if (!result || result.status === 'failed') {
      // Send failed — mark failed (reconcile pass will retry until the cap), release the claim.
      // STATUS GUARD (adversarial-review finding, SECURITY sub-agent): this write is conditioned
      // on the row still being 'sending' — the exact status THIS claim just set. If a concurrent
      // webhook callback for a prior SID already moved the row to 'delivered'/'canceled' while the
      // send was in flight, this update matches zero rows instead of clobbering that outcome.
      const { error: sendFailedErr } = await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'failed', attempts, last_error: (result && result.reason) || 'provider_failed', claimed_at: null, claimed_by: null })
        .eq('id', row.id)
        .eq('status', 'sending')
        .select('id');
      // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002: warn on a genuine error; a zero-rows match with no
      // error is a legitimate lost race (silently absorbed, matching this file's own idiom).
      if (sendFailedErr) {
        logger.warn?.(`[sms-outbound-worker] send-failure UPDATE failed for ${row.id}: ${sendFailedErr.message} — row remains status='sending', will be reaped by the crash-timeout pass`);
      }
      summary.failed++;
    } else {
      // 201-ACCEPT (queued/sent). This is NOT delivery — delivered_at is set only by the FR-2
      // status callback. Stamp the Twilio SID so that callback can key delivery-truth to this row.
      //
      // FR-3 / Solomon Pin #2: this is a RESEND whenever c.provider_message_id already carries a
      // prior SID (the row went through a re-arm-to-owed cycle since it was last sent). Overwriting
      // provider_message_id in place — the pre-fix behavior — silently orphans that prior SID: a
      // late-arriving callback for it then matches zero rows and no-ops even if the original send
      // actually delivered, producing a REAL duplicate SMS to the chairman. Preserve it in
      // prior_provider_message_ids so applyOwedDeliveryTruth (api/webhooks/twilio-sms.js) can still
      // resolve a late callback against this row by either SID.
      const priorSid = c.provider_message_id;
      const priorHistory = Array.isArray(c.prior_provider_message_ids) ? c.prior_provider_message_ids : [];
      const priorProviderMessageIds = (priorSid && priorSid !== result.provider_message_id)
        ? [...priorHistory, priorSid]
        : priorHistory;
      // STATUS GUARD: same reasoning as the failure branch above — a concurrent callback for a
      // prior SID that already stamped 'delivered'/'canceled' while this send was in flight wins;
      // this completion write becomes a no-op instead of overwriting it back to 'sent'.
      const { error: sendCompleteErr } = await supabase
        .from('sms_outbound_obligations')
        .update({
          status: 'sent',
          provider_message_id: result.provider_message_id || null,
          ...(hasPriorSidColumn ? { prior_provider_message_ids: priorProviderMessageIds } : {}),
          sent_at: nowIso,
          attempts,
        })
        .eq('id', row.id)
        .eq('status', 'sending')
        .select('id');
      // SD-LEO-FIX-SMS-OUTBOUND-WORKER-002 (the "money path"): warn on a genuine error -- Twilio
      // already accepted this send (a real message went out) but the local ledger failed to
      // record it, which without this check would silently strand the row in 'sending' and risk
      // a duplicate resend once the crash-timeout reaper reconsiders it. A zero-rows match with
      // no error is a legitimate lost race (silently absorbed, matching this file's own idiom).
      if (sendCompleteErr) {
        logger.warn?.(`[sms-outbound-worker] send-success UPDATE failed for ${row.id} (SID ${result.provider_message_id}): ${sendCompleteErr.message} — Twilio accepted the send but the local ledger was not updated; row remains status='sending'`);
      }
      summary.sent++;
    }
  }

  return summary;
}

export default reconcileOutboundSms;
