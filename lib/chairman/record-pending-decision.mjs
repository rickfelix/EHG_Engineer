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

const COLUMN_RECOMMENDATIONS = new Set(['proceed', 'pivot', 'fix', 'kill', 'pause']);

const __dirname = dirname(fileURLToPath(import.meta.url));
// SD-LEO-INFRA-LEAN-DECISION-EMAIL-001: the on-demand escalation now sends the LEAN, decision-specific
// email (the decision's real title/context/recommendation, no hourly status block) — NOT the full
// exec-summary. adam-exec-summary.mjs remains the hourly/scheduled summary path.
const ADAM_DECISION_EMAIL = resolve(__dirname, '../../scripts/adam-decision-email.mjs');

/**
 * SD-LEO-INFRA-ADAM-ESCALATION-DETERMINISM-001 FR-1 — PURE, deterministic predicate: should recording
 * this decision IMMEDIATELY fire the standout chairman-escalation email? True only for a genuine Adam
 * escalation: raisedBy==='adam' AND (a routed stuck-question OR an Adam-flagged blocking decision).
 * Deliberately structural — there is NO 'is the chairman in-session' input, so the email no longer
 * depends on in-session judgment or the hourly cron. Exported for unit testing.
 * @param {{decisionType?:string, blocking?:boolean, raisedBy?:string}} o
 * @returns {boolean}
 */
export function shouldAutoEscalate({ decisionType, blocking, raisedBy } = {}) {
  if (raisedBy !== 'adam') return false;
  return decisionType === 'session_question' || blocking === true;
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
 *  a read error as an empty window) to match this file's existing fail-soft escalation philosophy. */
async function getEscalationWindowCounts(supabase) {
  const since = new Date(Date.now() - RATE_CAP_WINDOW_MS).toISOString();
  const { data } = await supabase.from('chairman_decisions').select('brief_data').gte('created_at', since);
  const rows = data || [];
  return {
    emails: rows.filter(r => r.brief_data?.escalation_email_sent_at).length,
    digests: rows.filter(r => r.brief_data?.digest_sent_at).length,
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
export async function escalateChairmanDecision(supabase, decisionId, { spawn = defaultSpawnEscalationEmail } = {}) {
  if (!supabase || !decisionId) return { escalated: false, error: 'supabase and decisionId required' };
  try {
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
    if (emails >= RATE_CAP_MAX_EMAILS) {
      if (digests > 0) {
        console.log(`SUPPRESSED_RATE_CAP decision=${decisionId} emails_this_hour=${emails}`);
        return { escalated: false, suppressed: 'rate_cap' };
      }
      spawn(decisionId); // ONE digest for the whole rolling window, in place of another standout email
      const merged = { ...(live?.brief_data || {}), digest_sent_at: new Date().toISOString() };
      await supabase.from('chairman_decisions').update({ brief_data: merged }).eq('id', decisionId);
      return { escalated: true, digest: true };
    }

    spawn(decisionId); // fire-and-forget standout LEAN decision email (leads with this decision)
    const merged = { ...(live?.brief_data || {}), escalation_email_sent_at: new Date().toISOString() };
    await supabase.from('chairman_decisions').update({ brief_data: merged }).eq('id', decisionId);
    return { escalated: true };
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
 * @param {string} [opts.raisedBy] - who raised it; 'adam' triggers the deterministic escalation email
 * @param {Function} [opts._spawnEscalation] - test seam: inject the email-spawn
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
  _spawnEscalation,
} = {}) {
  if (!supabase) return { recorded: false, error: 'supabase client is required' };
  if (!title) return { recorded: false, error: 'title is required' };

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

  // FR-2: DETERMINISTIC escalation — an Adam session_question/blocking decision fires the standout
  // [ACTION NEEDED - ADAM] email IMMEDIATELY on creation, no in-session/availability gate and no
  // waiting for the hourly cron. Fail-soft: an escalation error never fails the durable record.
  let escalated = false;
  if (id && shouldAutoEscalate({ decisionType, blocking, raisedBy })) {
    const r = await escalateChairmanDecision(supabase, id, _spawnEscalation ? { spawn: _spawnEscalation } : {});
    escalated = r.escalated === true;
  }
  return { recorded: true, id, escalated };
}
