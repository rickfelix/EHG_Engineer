/**
 * Away-bridge — SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-E (Layer 3, parent FR-5).
 *
 * Wired to real seams by lib/comms/adam-outbound/decision-scheduler/index.js
 * (SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001), invoked by
 * scripts/cron/adam-decision-scheduler-tick.mjs.
 *
 * A presence-gated re-surfacer for OWED, UNANSWERED chairman DECISIONS.
 *
 *   - 'away' is computed from the FLEET-WIDE last terminal-INPUT time (not the reply latency
 *     of any single message), so the bridge never re-surfaces a decision the chairman is
 *     mid-read on (no away-flap).
 *   - It governs DECISIONS ONLY. Heartbeats/status follow their own schedule and are NEVER
 *     suppressed or driven by presence.
 *   - When away, an owed-but-unanswered decision is re-surfaced with a 'Still pending:' prefix,
 *     IDEMPOTENTLY (once per window, keyed on the owed-deliverable id), until it is ANSWERED —
 *     not merely until presence returns.
 *   - After K re-surfaces with no answer it escalates to the ONE-EMAIL channel, not more texts.
 *   - Owed-state comes from child -B (delivery-reconcile) via an injectable owedStore; the
 *     quiet-hours auto-default clock-pause is honored so overnight defaults never apply silently.
 *
 * Every seam (presence, owed-store, re-surface sender, email escalator, clock) is injectable so
 * unit tests run with zero live I/O.
 */

const DEFAULT_AWAY_MS = 15 * 60 * 1000; // 15 min with no fleet-wide terminal input => away
const DEFAULT_K = 3; // re-surfaces before escalating to email

/**
 * 'away' from fleet-wide last terminal-input time (NOT per-message reply latency).
 * @param {object} context - { now:number, lastInputAt:number, awayThresholdMs? }
 * @returns {boolean}
 */
export function isAway(context = {}) {
  const now = Number.isFinite(context.now) ? context.now : null;
  const last = Number.isFinite(context.lastInputAt) ? context.lastInputAt : null;
  if (now === null || last === null) return false; // unknown presence => treat as present (never text blindly)
  const threshold = Number.isFinite(context.awayThresholdMs) ? context.awayThresholdMs : DEFAULT_AWAY_MS;
  return now - last > threshold;
}

/**
 * Process owed decisions once: re-surface / escalate / drop per policy.
 * @param {object} context - presence + quiet-hours state (see isAway)
 * @param {object} opts - { owedStore, sender, escalateEmail, K? }
 *   owedStore.getOwedDecisions(): Promise<Array<{owedId, message, answered?, resurfaceCount?, resurfacedThisWindow?}>>
 *   owedStore.markResurfaced(owedId): Promise<void>
 *   sender(message): Promise<void>   // re-surface send
 *   escalateEmail(owed): Promise<void>
 * @returns {Promise<Array<{owedId:string, action:string}>>}
 */
export async function processOwedDecisions(context = {}, opts = {}) {
  const { owedStore, sender, escalateEmail } = opts;
  const K = Number.isInteger(opts.K) ? opts.K : DEFAULT_K;
  if (!owedStore || typeof owedStore.getOwedDecisions !== 'function') {
    throw new Error('away-bridge: opts.owedStore.getOwedDecisions is required (owed-state from -B)');
  }
  const owed = (await owedStore.getOwedDecisions()) || [];
  const results = [];

  for (const o of owed) {
    // Answered -> drop from the re-surface set.
    if (o.answered) { results.push({ owedId: o.owedId, action: 'dropped_answered' }); continue; }
    // Present -> do nothing (never text mid-read). Governs decisions only; presence never
    // touches heartbeats (they are not in the owed-decision set at all).
    if (!isAway(context)) { results.push({ owedId: o.owedId, action: 'skipped_present' }); continue; }
    // Idempotent: already re-surfaced this window -> no double-apply.
    if (o.resurfacedThisWindow) { results.push({ owedId: o.owedId, action: 'skipped_idempotent' }); continue; }
    // K reached -> escalate to email, not another text.
    if ((o.resurfaceCount || 0) >= K) {
      if (typeof escalateEmail === 'function') await escalateEmail(o);
      results.push({ owedId: o.owedId, action: 'escalated_email' });
      continue;
    }
    // Re-surface 'Still pending:' via the sender, then mark (idempotency).
    if (typeof sender === 'function') {
      const body = `Still pending: ${o.message && o.message.body ? o.message.body : ''}`.trim();
      await sender({ ...(o.message || {}), body });
    }
    if (typeof owedStore.markResurfaced === 'function') await owedStore.markResurfaced(o.owedId);
    results.push({ owedId: o.owedId, action: 'resurfaced' });
  }
  return results;
}
