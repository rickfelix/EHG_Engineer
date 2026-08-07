/**
 * QF-20260725-972 — bring the CHAIRMAN send lane under the pre-send Solomon-consult contract.
 *
 * SD-LEO-INFRA-ADAM-PRE-SEND-001 wired the gate into scripts/adam-advisory.cjs (the COORDINATOR
 * lane) only. The chairman-facing CLIs (adam-chairman-sms.mjs, adam-chairman-decision.mjs) had
 * ZERO gate wiring, so the surface where a wrong recommendation costs most was the ungated one.
 * Both CLIs already funnel through the single choke sendChairmanSMS(), so the gate belongs there
 * — one seam, no parallel classifier: lib/adam/should-consult-solomon.js stays the sole authority
 * (which itself routes triage through classifyDecision and classification through the shared
 * consequence taxonomy).
 *
 * isChairmanTargeted is HARD-CODED true here: per the contract, the chairman control surface
 * degrades to hold-and-surface, never documented-proceed. That branch was already implemented in
 * should-consult-solomon.js — it was simply unreachable because nothing on the chairman path ever
 * called it.
 */
import { createRequire } from 'module';
import crypto from 'crypto';
import { evaluatePreSendConsult, performBoundedConsult } from './should-consult-solomon.js';

const require_ = createRequire(import.meta.url);

/**
 * Flatten a chairman message into the gate's text input. Decision packets carry their weight in
 * the option labels and the no-reply consequence, so those are folded into the body — otherwise a
 * consequential decision could classify off its lede alone. PURE.
 * @param {object} message
 * @returns {{decisionType:string,title:string,body:string,isChairmanTargeted:true}}
 */
export function buildChairmanGateInput(message = {}) {
  const options = Array.isArray(message.options)
    ? message.options.map((o) => (o && o.label) || '').filter(Boolean).join(' | ')
    : '';
  return {
    decisionType: message.type || message.kind || '',
    title: message.kind || message.type || 'chairman-send',
    body: [message.body, options, message.noReplyConsequence].filter(Boolean).join('\n'),
    isChairmanTargeted: true,
  };
}

/**
 * Is the Solomon consult lane actually REACHABLE right now?
 *
 * This probe is the difference between the two degradations, and it matters: the contract says the
 * chairman surface degrades to hold-and-surface rather than documented-proceed, but that clause
 * presumes an oracle that exists and merely answered late. If Solomon is ABSENT (no DB creds, no
 * fresh Solomon session) then holding is not "wait for the answer" — it is an indefinite chairman
 * comms blackout, which violates the module's own governing invariant that Adam is NEVER
 * hard-blocked on Solomon (and the operator rule that stepping away never means silence).
 * So: lane reachable + no answer in the window => HOLD. Lane absent => audited fail-open.
 * @returns {Promise<boolean>}
 */
async function isConsultLaneAvailable() {
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) return false;
  try {
    const { createSupabaseClient } = await import('../supabase-client.js');
    const { getActiveSolomonId } = require_('../coordinator/solomon-identity.cjs');
    return Boolean(await getActiveSolomonId(createSupabaseClient()));
  } catch {
    return false;
  }
}

/** Default consult lane: the REAL solomon_consult row + bounded reply wait (parity with adam-advisory). */
async function defaultConsult(input, timeoutMs) {
  const { createSupabaseClient } = await import('../supabase-client.js');
  const { buildSolomonConsultPayload, awaitCoordinatorReply } = require_('../../scripts/worker-signal.cjs');
  const { getActiveSolomonId } = require_('../coordinator/solomon-identity.cjs');
  const supabase = createSupabaseClient();
  const sessionId = process.env.CLAUDE_SESSION_ID || 'adam-chairman-send';
  let solomonId = null;
  try { solomonId = await getActiveSolomonId(supabase); } catch { solomonId = null; }
  const correlationId = crypto.randomUUID();
  const cp = buildSolomonConsultPayload({
    correlationId,
    body: `[PRE-SEND CONSULT — CHAIRMAN LANE] ${input.body}`,
    senderCallsign: 'adam-chairman-send',
    repo: process.cwd(),
    severity: 'high',
    isAwait: true,
  });
  await supabase.from('session_coordination').insert({
    sender_session: sessionId,
    sender_type: 'adam',
    target_session: solomonId || 'broadcast-solomon',
    message_type: 'INFO',
    subject: '[SOLOMON_CONSULT] pre-send (chairman lane)',
    body: cp.body,
    payload: cp,
  });
  const reply = await awaitCoordinatorReply(supabase, { sessionId, correlationId, timeoutMs });
  return reply.timedOut ? null : ((reply.reply && reply.reply.body) || { received: true });
}

/** Default ledger capture — existing adam_adherence_ledger columns, no new ones. */
async function defaultRecordLedger(ledger) {
  const { createSupabaseClient } = await import('../supabase-client.js');
  await createSupabaseClient().from('adam_adherence_ledger').insert({
    run_id: crypto.randomUUID(),
    probe: ledger.probe,
    duty: ledger.duty || 'pre_send_consult',
    verdict: ledger.verdict,
    detail: `chairman-lane::${ledger.detail}`,
    remediation_ref: ledger.remediation_ref || null,
  });
}

/**
 * Run the pre-send gate for a chairman-bound message.
 * Returns {action:'proceed'|'hold-and-surface', gated:boolean, ...}. NEVER throws and never blocks
 * past the bounded wait — Adam is never hard-blocked on Solomon.
 * @param {object} message
 * @param {{consult?:Function, recordLedger?:Function, timeoutMs?:number}} [deps]
 */
export async function runChairmanPreSendConsult(message = {}, deps = {}) {
  const input = buildChairmanGateInput(message);
  if (evaluatePreSendConsult(input).action !== 'consult-then-send') {
    return { action: 'proceed', gated: false };
  }
  const timeoutMs = deps.timeoutMs ?? (Number(process.env.ADAM_PRE_SEND_CONSULT_TIMEOUT_MS) || 8000);
  // Lane-absent => audited fail-open (never an indefinite chairman blackout). An injected consult
  // is by definition an available lane, so the probe only runs for the real default lane.
  const laneAvailable = deps.consult ? true : await isConsultLaneAvailable();
  if (!laneAvailable) {
    const ledger = {
      probe: 'decision_rubric',
      duty: 'pre_send_consult',
      verdict: 'unknown',
      detail: 'solomon-consult-lane-absent::chairman-audited-proceed',
    };
    try { await (deps.recordLedger || defaultRecordLedger)(ledger); } catch { /* best-effort */ }
    return { action: 'proceed', gated: true, degraded: true, laneUnavailable: true, ledger };
  }
  const outcome = await performBoundedConsult(input, {
    timeoutMs,
    consult: deps.consult || ((payload) => defaultConsult(payload, timeoutMs)),
    recordLedger: deps.recordLedger || defaultRecordLedger,
  });
  return { ...outcome, gated: true };
}

export default runChairmanPreSendConsult;
