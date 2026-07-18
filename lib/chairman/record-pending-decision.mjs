/**
 * lib/chairman/record-pending-decision.mjs — durable proxy for ephemeral
 * chairman questions. SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001 FR-4.
 *
 * Inserts a chairman_decisions row (status='pending') so a question that today
 * only lives in an AskUserQuestion prompt / coordinator escalation also lands
 * in the unified decision queue (chairman_unified_decisions branch 4).
 *
 * CONSTITUTIONAL: this RECORDS a pending decision; it never decides one.
 *
 * Schema notes (probed live 2026-06-11):
 *   NOT NULL without default: lifecycle_stage (int), decision, decision_type,
 *     status (default 'pending'). venture_id becomes nullable with the
 *     20260611_chairman_decision_queue migration (session questions are
 *     ventureless) — pre-migration, pass options.ventureId or the insert fails.
 *   CHECK constraints: decision must be in the allowed list ('pending' is
 *     valid); recommendation column only allows proceed/pivot/fix/kill/pause —
 *     free-text recommendations therefore go into brief_data, and the column is
 *     only set when the value is one of the allowed enums.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isWithinChairmanQuietWindow } from '../notifications/resend-adapter.js';
import { isFixtureVenture } from './chairman-actionable.mjs';
// SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 (Part 1): the LIVE caller of the built-not-wired
// chairman-SMS hardening tree. escalateChairmanDecision is the single decision funnel every
// escalation path already flows through, so wiring the gate here routes ALL chairman decisions
// through the rubric/format gate (child C) + rubric-engine (child A) with one chokepoint.
import { sendChairmanSMS } from '../comms/adam-outbound/chairman-sms-gate/index.js';

/**
 * Best-effort GATED chairman-SMS attempt (SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 Part 1).
 * Runs AFTER the guaranteed email escalation. The gate is RUBRIC fail-CLOSED: a decision whose
 * message fails the format/rubric (or whose rubric is unavailable) is HELD — no SMS is sent — while
 * the email (already fired) remains the non-regressing live fallback. The TRANSPORT is fail-SOFT
 * (durable owed-state absent pre-migration => email covers delivery). This never throws into the
 * escalation path: the email is the guarantee, the gated SMS is the added structural enforcement.
 * @returns {Promise<{attempted:boolean, sent?:boolean, held?:boolean, reason?:string}>}
 */
async function attemptGatedChairmanSms(briefData = {}, decisionId, opts = {}) {
  try {
    const message = {
      type: briefData.decision_type || briefData.type || 'decision',
      body: briefData.question || briefData.summary || briefData.decision_text || briefData.title || '',
      options: briefData.options,
      replyInstruction: briefData.reply_instruction,
      authority: briefData.authority,
      noReplyConsequence: briefData.no_reply_consequence || briefData.noReplyConsequence,
      recipientPhone: briefData.chairman_phone || process.env.CHAIRMAN_PHONE || null,
      decisionId,
      // Idempotent durable enqueue (SECURITY defense-in-depth): keyed on the decision so a
      // re-invocation cannot create a duplicate owed row, independent of the upstream CAS.
      dedupeKey: decisionId ? `decision_question:${decisionId}` : null,
    };
    const res = await sendChairmanSMS(message, opts.context || {}, opts.gateOpts || {});
    return { attempted: true, sent: !!res.sent, held: !!res.held, reason: res.reason };
  } catch (err) {
    // Never let the gated-SMS attempt disturb the guaranteed email path.
    return { attempted: true, sent: false, held: true, reason: `gate_error: ${err.message}` };
  }
}

const COLUMN_RECOMMENDATIONS = new Set(['proceed', 'pivot', 'fix', 'kill', 'pause']);

const __dirname = dirname(fileURLToPath(import.meta.url));
// SD-LEO-INFRA-LEAN-DECISION-EMAIL-001: the on-demand escalation now sends the LEAN, decision-specific
// email (the decision's real title/context/recommendation, no hourly status block) — NOT the full
// exec-summary. adam-exec-summary.mjs remains the hourly/scheduled summary path.
const ADAM_DECISION_EMAIL = resolve(__dirname, '../../scripts/adam-decision-email.mjs');

/**
 * SD-LEO-INFRA-ADAM-ESCALATION-DETERMINISM-001 FR-1, widened by
 * SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-1 — PURE, deterministic predicate: should recording
 * this decision IMMEDIATELY fire the standout chairman-escalation email?
 *
 * ANY blocking pending decision escalates on creation REGARDLESS of raiser — the old
 * raisedBy==='adam' gate meant stage-gate/coordinator/eva producers of blocking decisions
 * structurally bypassed escalation, so a ready venture's pause never reached the chairman.
 * The adam+session_question path (a routed stuck-question) is preserved.
 * Deliberately structural — there is NO 'is the chairman in-session' input, so the email no longer
 * depends on in-session judgment or the hourly cron. Exported for unit testing.
 * @param {{decisionType?:string, blocking?:boolean, raisedBy?:string}} o
 * @returns {boolean}
 */
export function shouldAutoEscalate({ decisionType, blocking, raisedBy } = {}) {
  if (blocking === true) return true;
  return raisedBy === 'adam' && decisionType === 'session_question';
}

/**
 * Default fire-and-forget spawn of the standout LEAN decision email (adam-decision-email.mjs --decision <id>).
 * Detached + unref'd so it never blocks the caller; stdio ignored. Fail-soft — the email is a nudge,
 * the durable decision row is the source of truth. The decisionId leads the email so it carries THE
 * decision the chairman is being asked to make (not a generic 'approve N ventures').
 * @param {string} [decisionId]
 */
function defaultSpawnEscalationEmail(decisionId) {
  const args = [ADAM_DECISION_EMAIL];
  if (decisionId) args.push('--decision', decisionId);
  const child = nodeSpawn('node', args, { detached: true, stdio: 'ignore' });
  child.on('error', () => { /* fail-soft: the email is best-effort */ });
  if (typeof child.unref === 'function') child.unref();
}

// QF-20260703-905: escalation rate cap. The 165-decision flood specimen (QF-20260703-229's stall-
// detector defect) sent ~165 standout emails in 20 minutes and burned the entire daily Resend quota,
// killing both the heartbeat and alert channels for the rest of the day. Decision ROWS are always
// recorded regardless (recordPendingDecision inserts unconditionally) — only the EMAIL amplification
// is capped here: at most RATE_CAP_MAX_EMAILS standout emails per rolling hour, the rest fold into
// ONE digest email per window (further suppressions in the same window are logged, not re-sent).
const RATE_CAP_WINDOW_MS = 60 * 60 * 1000;
const RATE_CAP_MAX_EMAILS = 3;

/** Counts standout/digest emails already sent within the rolling rate-cap window. Fail-open (treats
 *  a read error as an empty window) to match this file's existing fail-soft escalation philosophy.
 *
 *  SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001 FR-1 (defect 1): count by ACTUAL send time
 *  (brief_data->>escalation_email_sent_at / digest_sent_at) within the last hour — NOT created_at.
 *  The old created_at filter made every decision created >1h ago invisible to the 3/hr cap even when
 *  emailed seconds ago (6 of 7 pending decisions in the flood incident were >1h old), so the cap read
 *  emails=0 and never folded an old-backlog burst into one digest. The send markers are always
 *  new Date().toISOString() UTC-Zulu strings, which sort lexicographically, so a text .gte on the
 *  JSONB path is a correct time comparison (invariant pinned by a unit test). Rows without the marker
 *  yield SQL NULL on the ->> path and are excluded by .gte. */
async function getEscalationWindowCounts(supabase) {
  const since = new Date(Date.now() - RATE_CAP_WINDOW_MS).toISOString();
  const [emailsRes, digestsRes] = await Promise.all([
    supabase.from('chairman_decisions').select('id').gte('brief_data->>escalation_email_sent_at', since),
    supabase.from('chairman_decisions').select('id').gte('brief_data->>digest_sent_at', since),
  ]);
  return {
    emails: (emailsRes?.data || []).length,
    digests: (digestsRes?.data || []).length,
  };
}

/**
 * FR-2/FR-3 — escalate a recorded chairman decision: fire the standout email ONCE (dedup on
 * brief_data.escalation_email_sent_at), then stamp the marker so a re-call is a no-op. Fail-soft:
 * any read/spawn/update error is swallowed so escalation never breaks the durable record. The
 * timeout watchdog is the EXISTING checkAndEscalateTimeouts poller (lib/eva/chairman-decision-timeout.js)
 * — the pending row this stamps is already tracked by it, so no new daemon is armed here.
 * @param {Object} supabase
 * @param {string} decisionId
 * @param {{spawn?:Function}} [opts] - inject spawn for tests
 * @returns {Promise<{escalated:boolean, deduped?:boolean, digest?:boolean, suppressed?:string, error?:string}>}
 */
export async function escalateChairmanDecision(supabase, decisionId, { spawn = defaultSpawnEscalationEmail, quietWindow = isWithinChairmanQuietWindow, gatedSms = attemptGatedChairmanSms } = {}) {
  if (!supabase || !decisionId) return { escalated: false, error: 'supabase and decisionId required' };
  try {
    // SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-3 — quiet-window check BEFORE any stamp/spawn.
    // Previously the marker was stamped at spawn while adam-decision-email.mjs exited inside the
    // 23:00-05:00 ET window without sending: the item was permanently marked sent but never delivered.
    // Inside the window we record NOTHING, leaving the row eligible so the scheduled SLA sweep
    // (scripts/cron/chairman-decision-sla-sweep.mjs) retries after the window opens.
    if (quietWindow()) {
      return { escalated: false, suppressed: 'quiet_window' };
    }

    // Dedup: one email per decision. Re-read the live marker before sending.
    const { data: live } = await supabase
      .from('chairman_decisions')
      .select('brief_data')
      .eq('id', decisionId)
      .maybeSingle();
    if (live?.brief_data?.escalation_email_sent_at) {
      return { escalated: false, deduped: true };
    }

    const { emails, digests } = await getEscalationWindowCounts(supabase);
    const overCap = emails >= RATE_CAP_MAX_EMAILS;
    if (overCap && digests > 0) {
      // A digest already went out this window — suppress further sends, no spawn.
      console.log(`SUPPRESSED_RATE_CAP decision=${decisionId} emails_this_hour=${emails}`);
      return { escalated: false, suppressed: 'rate_cap' };
    }

    // FR-2 (defect 2): ATOMIC stamp-before-spawn. Stamp the dedup marker via a conditional UPDATE
    // (CAS) that writes ONLY WHERE brief_data->>escalation_email_sent_at IS NULL, and spawn the email
    // ONLY if the update returned a row (we won the race). Postgres re-checks the predicate under the
    // row lock, so concurrent/cross-process callers for the SAME decision get exactly one winner —
    // closing the old read-then-spawn-then-stamp TOCTOU. FAIL-CLOSED: a DB error returns without
    // spawning (never emit an email we could not durably record). When over the standout cap and no
    // digest has gone out yet, THIS send becomes the single window digest (stamps digest_sent_at too);
    // the identical-digest race across DIFFERENT decisions is caught by the FR-3 send-choke debounce.
    // NOTE: the whole-blob write from the (stale) `live` read has a negligible clobber window — the
    // marker is the only field contested during escalation, and the .is(...null) filter is the true
    // mutual exclusion.
    const now = new Date().toISOString();
    const isDigest = overCap; // over the standout cap → this is the ONE digest, not another standout
    const merged = {
      ...(live?.brief_data || {}),
      escalation_email_sent_at: now,
      ...(isDigest ? { digest_sent_at: now } : {}),
    };
    const { data: won, error: casErr } = await supabase
      .from('chairman_decisions')
      .update({ brief_data: merged })
      .eq('id', decisionId)
      .is('brief_data->>escalation_email_sent_at', null)
      .select('id');
    if (casErr) return { escalated: false, error: casErr.message }; // fail-closed: do NOT spawn
    if (!won || won.length === 0) return { escalated: false, deduped: true }; // lost the CAS race

    spawn(decisionId); // won the CAS → fire exactly once (standout, or the single window digest)

    // SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 (Part 1): AFTER the guaranteed email, route the
    // decision through the built chairman-SMS gate (rubric/format fail-closed). This is the LIVE
    // caller that wires the hardening tree in. Best-effort + isolated: a rubric-held decision or a
    // gate error NEVER affects the email escalation above (already fired). Stamped into the return
    // so callers/tests can observe the gated-SMS outcome.
    const smsGate = await gatedSms(merged, decisionId, {});

    const base = isDigest ? { escalated: true, digest: true } : { escalated: true };
    return { ...base, smsGate };
  } catch (e) {
    return { escalated: false, error: e?.message || String(e) };
  }
}

/**
 * Record a pending chairman decision.
 * @param {Object} supabase - supabase client (service role)
 * @param {Object} opts
 * @param {string} opts.title - short question/title (stored in summary + brief_data.title)
 * @param {string} [opts.decisionType='session_question']
 * @param {Object|string} [opts.context] - context pack, stored as brief_data
 * @param {string} [opts.recommendation] - display-only default answer
 * @param {boolean} [opts.blocking=false]
 * @param {string} [opts.ventureId] - optional; session questions are ventureless
 * @param {number} [opts.lifecycleStage=0] - 0 = not a venture lifecycle decision
 * @param {string} [opts.raisedBy] - who raised it; any blocking decision (and adam session questions) escalates
 * @param {Function} [opts._spawnEscalation] - test seam: inject the email-spawn
 * @param {Function} [opts._quietWindow] - test seam: inject the quiet-window predicate
 * @returns {Promise<{recorded: boolean, id?: string, error?: string, escalated?: boolean}>}
 */
export async function recordPendingDecision(supabase, {
  title,
  decisionType = 'session_question',
  context,
  recommendation,
  blocking = false,
  ventureId = null,
  lifecycleStage = 0,
  raisedBy = null,
  allowFixture = false,
  _spawnEscalation,
  _quietWindow,
} = {}) {
  if (!supabase) return { recorded: false, error: 'supabase client is required' };
  if (!title) return { recorded: false, error: 'title is required' };

  // SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002 (FR-4): fixture ventures never enter the
  // chairman queue at source. Fail-open — a venture-lookup error must never drop a REAL
  // decision, so only a POSITIVE fixture identification skips the insert. Tests that
  // deliberately mint decisions on fixture ventures pass allowFixture: true.
  if (ventureId && !allowFixture) {
    try {
      const { data: v, error: vErr } = await supabase
        .from('ventures').select('id, name, is_demo').eq('id', ventureId).maybeSingle();
      if (!vErr && v && isFixtureVenture(v)) {
        console.log(`[record-pending-decision] fixture venture ${v.name} — decision "${title}" not recorded (allowFixture to override)`);
        // error is a descriptive skip reason so callers that branch on recorded/error
        // (e.g. stage-22's NC-7 loud-failure marker) report the guard, not an
        // "unknown insert failure" (adversarial-review W1).
        return { recorded: false, skipped_fixture: true, error: 'skipped: fixture venture is not chairman-actionable (pass allowFixture to override)' };
      }
    } catch { /* fail-open: lookup failure never blocks a real decision */ }
  }

  const briefData = {
    title,
    ...(recommendation ? { recommendation } : {}),
    ...(raisedBy ? { raised_by: raisedBy } : {}),
    context: context ?? null,
    recorded_via: 'record-pending-decision',
  };

  const row = {
    venture_id: ventureId,
    lifecycle_stage: lifecycleStage,
    decision: 'pending',           // NOT NULL; 'pending' is in the CHECK list
    decision_type: decisionType,   // NOT NULL, no CHECK — free text
    status: 'pending',
    summary: title,
    brief_data: briefData,
    blocking: !!blocking,
  };
  if (recommendation && COLUMN_RECOMMENDATIONS.has(recommendation)) {
    row.recommendation = recommendation; // column CHECK only allows these five
  }

  const res = await supabase.from('chairman_decisions').insert(row).select('id');
  if (res.error) {
    return { recorded: false, error: res.error.message };
  }
  const id = res.data?.[0]?.id;

  // FR-2: DETERMINISTIC escalation — any blocking decision (or an Adam session_question) fires the
  // standout email IMMEDIATELY on creation, no in-session/availability gate and no waiting for the
  // hourly cron. Fail-soft: an escalation error never fails the durable record.
  let escalated = false;
  if (id && shouldAutoEscalate({ decisionType, blocking, raisedBy })) {
    const escOpts = {};
    if (_spawnEscalation) escOpts.spawn = _spawnEscalation;
    if (_quietWindow) escOpts.quietWindow = _quietWindow;
    const r = await escalateChairmanDecision(supabase, id, escOpts);
    escalated = r.escalated === true;
  }
  return { recorded: true, id, escalated };
}
