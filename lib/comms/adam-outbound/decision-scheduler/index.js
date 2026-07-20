/**
 * Adam decision-scheduler tick — SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001 (Part 2 of
 * adam-outbound wiring; Part 1 = the chairman-sms-gate + rubric, live in PR #6241).
 *
 * Wires the already-shipped away-bridge (lib/comms/adam-outbound/away-bridge/index.js,
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-E) to real seams: an owedStore adapter over
 * sms_outbound_obligations, a presence signal, the live chairman-sms-gate sender, and
 * the existing chairman decision-email escalation path. away-bridge itself is NOT
 * modified (TR-1) -- this module is purely the wiring layer.
 *
 * FAIL-SOFT (TR-2): sms_outbound_obligations is a STAGED migration, not yet applied to
 * the live DB. getOwedDecisions() returns [] (never throws) while the table is absent,
 * reusing the existing smsOutboundObligationsLive() liveness probe. Once applied, the
 * SAME code path reads real rows -- but see the column-mapping caveat below.
 *
 * COLUMN-MAPPING CAVEAT (real, documented, not a silent gap): sms_outbound_obligations
 * has NO `answered`, `resurfaceCount`, or `resurfacedThisWindow` columns -- `status`
 * tracks SMS delivery, not decision-answered state, and `attempts` is provider
 * send-attempts, not away-bridge re-surfaces. This adapter transforms the columns that
 * DO exist (id -> owedId, body -> message.body, decision_id threaded to the escalation
 * seam) and filters to decision rows only (kind='decision_question' AND decision_id IS
 * NOT NULL). The answered-derivation and durable re-surface bookkeeping that the STAGED
 * schema has no columns for are EXPLICITLY DEFERRED to the chairman-apply follow-up
 * under the same named ARMED activation trigger (see scripts/cron/adam-decision-scheduler-tick.mjs)
 * -- never silently assumed to arrive "for free" once the table is live.
 *
 * PRESENCE SIGNAL (accepted limitation, documented not hidden): {now, lastInputAt} is
 * resolved from the most recent claude_sessions.heartbeat_at across active sessions.
 * Fleet worker sessions heartbeat roughly every ~2s and are near-continuously active, so
 * this signal makes away-bridge's isAway() near-ALWAYS false -- the tick will near-NEVER
 * fire a re-surface with today's only available fleet-wide signal. This degrades toward
 * UNDER-firing (the safe direction for a LOW-priority resilience backstop), never toward
 * spamming the chairman. A real chairman-terminal-presence signal is a future
 * enhancement, explicitly out of scope here.
 */
import { smsOutboundObligationsLive } from '../../../chairman/sms-bridge.js';
import { sendChairmanSMS } from '../chairman-sms-gate/index.js';
import { escalateChairmanDecision } from '../../../chairman/record-pending-decision.mjs';
import { processOwedDecisions, isAway } from '../away-bridge/index.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: getOwedDecisions maps EVERY
// decision-question obligation into the away-bridge resurface set — the query does not filter
// to still-outstanding rows, so this grows with obligation history; a read silently capped at
// the PostgREST 1000-row max would silently drop owed decisions. Paginate (fail-open preserved).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../../../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

const DECISION_KIND = 'decision_question';

/**
 * Build the owedStore adapter over sms_outbound_obligations.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {{getOwedDecisions: () => Promise<Array>, markResurfaced: (id: string) => Promise<void>}}
 */
export function buildOwedStore(supabase) {
  return {
    async getOwedDecisions() {
      const live = await smsOutboundObligationsLive(supabase);
      if (!live) return [];
      try {
        const data = await fapPaginate(() => supabase
          .from('sms_outbound_obligations')
          .select('id, decision_id, body, status')
          .eq('kind', DECISION_KIND)
          .not('decision_id', 'is', null)
          .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
        // COLUMN-MAPPING CAVEAT (see module header): no backing column for
        // answered/resurfaceCount/resurfacedThisWindow. Deferred defaults chosen so
        // away-bridge's policy still runs safely: answered=false (never silently drop a
        // real owed decision), resurfaceCount=0 / resurfacedThisWindow=false (never
        // silently skip -- correct behavior is deferred to the chairman-apply follow-up,
        // not faked here).
        return data.map((row) => ({
          owedId: row.id,
          decisionId: row.decision_id,
          message: { body: row.body, decisionId: row.decision_id },
          answered: false,
          resurfaceCount: 0,
          resurfacedThisWindow: false,
        }));
      } catch {
        return [];
      }
    },
    async markResurfaced() {
      // COLUMN-MAPPING CAVEAT: no durable sink for resurfacedThisWindow in the STAGED
      // schema -- deferred to the chairman-apply follow-up. Intentionally a no-op today
      // (documented, not silent) rather than writing to a column that doesn't exist.
    },
  };
}

/**
 * Resolve the fleet-wide presence context from claude_sessions.heartbeat_at.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{now: number, lastInputAt: number|null}>}
 */
export async function resolvePresenceContext(supabase) {
  const now = Date.now();
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('heartbeat_at')
      .order('heartbeat_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0 || !data[0].heartbeat_at) {
      return { now, lastInputAt: null };
    }
    const lastInputAt = Date.parse(data[0].heartbeat_at);
    return { now, lastInputAt: Number.isFinite(lastInputAt) ? lastInputAt : null };
  } catch {
    return { now, lastInputAt: null };
  }
}

/**
 * Build a sender wrapping the live chairman-sms-gate.
 * @returns {(message: object) => Promise<void>}
 */
function buildSender() {
  return async (message) => {
    await sendChairmanSMS(
      { decisionId: message.decisionId, body: message.body, type: 'decision' },
      {},
      {}
    );
  };
}

/**
 * Build an escalateEmail seam wrapping the existing chairman decision-email pipeline.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {(owed: object) => Promise<void>}
 */
function buildEscalateEmail(supabase) {
  return async (owed) => {
    if (!owed || !owed.decisionId) return;
    await escalateChairmanDecision(supabase, owed.decisionId);
  };
}

/**
 * Run one decision-scheduler tick: wire the away-bridge to real seams and process owed
 * decisions once. Fail-soft throughout (TR-2) -- never throws.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} [opts] - injectable seams for tests: {owedStore, sender, escalateEmail, presence}
 * @returns {Promise<{ran: boolean, results: Array}>}
 */
export async function runDecisionSchedulerTick(supabase, opts = {}) {
  try {
    const owedStore = opts.owedStore || buildOwedStore(supabase);
    const sender = opts.sender || buildSender();
    const escalateEmail = opts.escalateEmail || buildEscalateEmail(supabase);
    const context = opts.presence || (await resolvePresenceContext(supabase));

    const results = await processOwedDecisions(context, { owedStore, sender, escalateEmail });
    return { ran: true, results };
  } catch (err) {
    return { ran: false, results: [], error: (err && err.message) || String(err) };
  }
}

export { isAway };
