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
    // SD-LEO-INFRA-DECISION-RESURFACE-GUARDS-001: NO DURABLE SINK -> REFUSE TO SEND.
    //
    // POSITION IS LOAD-BEARING, though NOT for the reason first written here. The original
    // comment claimed a check placed below the next two guards would be "unreachable".
    // That is false, and my own mutation harness disproved it: those branches only
    // `continue` when they FIRE, and with the hardcoded permissive inputs they never do,
    // so execution falls through and a lower placement still refuses. Moving the block
    // below them did not fail the suite.
    //
    // What ordering actually protects is THE TRUTHFULNESS OF THE REPORTED REASON. When a
    // guard input is present but untrustworthy -- resurfacedThisWindow true, or
    // resurfaceCount at K, on a store with no column behind either -- a lower placement
    // reports skipped_idempotent or escalated_email, asserting a fact the store
    // demonstrably cannot know. Same non-send; a completely different claim in the log,
    // and worse for escalated_email, which would send a real email on a fabricated count.
    // The log is what a human reads when deciding whether the brakes work.
    //
    // FAIL CLOSED, deliberately, and note this is the opposite posture from the advisory
    // surfaces elsewhere in this codebase: an informational reader that fails closed takes
    // down a command, whereas a SEND path that fails open texts a person repeatedly. The
    // consequence of being wrong picks the posture, not a general preference for strictness.
    //
    // Distinct action string on purpose: collapsing this into skipped_present would make
    // "no brakes at all" indistinguishable from "the chairman is looking at the screen".
    if (o.durabilityUnavailable) {
      results.push({ owedId: o.owedId, action: 'skipped_no_durable_sink' });
      continue;
    }
    // Idempotent: already re-surfaced this window -> no double-apply.
    if (o.resurfacedThisWindow) { results.push({ owedId: o.owedId, action: 'skipped_idempotent' }); continue; }
    // K reached -> escalate to email, not another text.
    if ((o.resurfaceCount || 0) >= K) {
      if (typeof escalateEmail === 'function') await escalateEmail(o);
      results.push({ owedId: o.owedId, action: 'escalated_email' });
      continue;
    }
    // Re-surface 'Still pending:' via the sender, then mark (idempotency).
    //
    // QF-20260727-589 (c): OBSERVE THE SENDER VERDICT. This previously discarded the sender's
    // return value and then called markResurfaced() + reported action:'resurfaced'
    // unconditionally. Combined with the empty-context bug (every send held), that meant an
    // owed decision burned all K re-surfaces while ZERO texts were sent, and the scheduler
    // reported each one as delivered. Silent failure reported as success, on the one channel
    // where nobody downstream can notice — because the person who would notice is the person
    // not being told. A held send must not consume a re-surface.
    let sendResult;
    if (typeof sender === 'function') {
      const body = `Still pending: ${o.message && o.message.body ? o.message.body : ''}`.trim();
      sendResult = await sender({ ...(o.message || {}), body });
    }
    // Treat ONLY an explicit hold as a hold. A sender that returns nothing (legacy shape) keeps
    // its previous meaning, so this cannot silently start withholding marks from existing
    // callers — the change is additive, not a redefinition of "no news".
    const held = !!(sendResult && typeof sendResult === 'object'
      && (sendResult.held === true || sendResult.sent === false));
    if (held) {
      results.push({
        owedId: o.owedId,
        action: 'resurface_held',
        reason: sendResult.reason || 'held',
      });
      continue; // NOT marked — the re-surface did not happen, so it must not be spent.
    }
    if (typeof owedStore.markResurfaced === 'function') await owedStore.markResurfaced(o.owedId);
    results.push({ owedId: o.owedId, action: 'resurfaced' });
  }
  return results;
}
