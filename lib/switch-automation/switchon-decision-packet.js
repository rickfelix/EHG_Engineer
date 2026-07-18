/**
 * One-tap chairman decision-packet dispatcher — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-D FR-2.
 *
 * Fires when the switch-on gate (Child A classifier + Child B authorizer + Child C prechecks)
 * does NOT authorize an auto-proceed. Always durably records via the existing
 * lib/chairman/record-pending-decision.mjs pipeline (console record + email escalation,
 * zero new email code — TR-4); best-effort attempts an SMS nudge via
 * lib/chairman/sms-bridge.js, which already self-degrades to console-only on HIGH
 * consequence, a non-whitelisted decision class, or missing chairman contact env vars.
 *
 * Idempotent across SEQUENTIAL calls (e.g. repeated PLAN-TO-EXEC handoff retries) via a
 * query-then-insert dedup keyed on the durable brief_data.context shape. NOT backed by a
 * DB unique constraint — two genuinely concurrent callers can each pass the dedup read and
 * both insert. That residual is bounded by escalateChairmanDecision's per-decision-id CAS
 * email dedup + the existing 3-emails/hour rate cap; a schema-level unique index is
 * deliberately out of scope (chairman_decisions is a shared multi-producer table).
 *
 * @module lib/switch-automation/switchon-decision-packet
 */
import { recordPendingDecision } from '../chairman/record-pending-decision.mjs';
import { sendChairmanSmsQuestion } from '../chairman/sms-bridge.js';

const DECISION_TYPE = 'switchon_gate';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service-role client
 * @param {{sdKey: string, action: string, reasons?: string[]}} params
 * @returns {Promise<{recorded: boolean, deduped?: boolean, existingDecisionId?: string, id?: string, error?: string}>}
 */
export async function notifySwitchOnDecisionPacket(supabase, { sdKey, action, reasons = [] } = {}) {
  if (!supabase) return { recorded: false, error: 'supabase client is required' };
  if (!sdKey || !action) return { recorded: false, error: 'sdKey and action are required' };

  // Sequential-retry idempotency: an existing PENDING packet for the same (sdKey, action)
  // means a prior gate evaluation already notified the chairman — don't re-insert or re-SMS.
  try {
    const { data: existing, error: findError } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('status', 'pending')
      .eq('brief_data->>raised_by', 'switchon-gate')
      .eq('brief_data->context->>sd_key', sdKey)
      .eq('brief_data->context->>action', action)
      .limit(1);
    if (!findError && existing && existing.length > 0) {
      return { recorded: false, deduped: true, existingDecisionId: existing[0].id };
    }
  } catch {
    // Fail-open on the dedup READ only — an inability to check for a duplicate must never
    // block the (higher-priority) durable record from being created below.
  }

  const title = `Switch-on gate: ${sdKey} (${action}) needs chairman decision`;
  const context = { sd_key: sdKey, action, reasons };

  const result = await recordPendingDecision(supabase, {
    title,
    decisionType: DECISION_TYPE,
    context,
    blocking: true,
    raisedBy: 'switchon-gate',
  });
  if (!result.recorded) return result;

  try {
    await sendChairmanSmsQuestion(supabase, {
      decisionId: result.id,
      chairmanUserId: process.env.CHAIRMAN_USER_ID,
      chairmanEmail: process.env.CHAIRMAN_EMAIL,
      chairmanPhone: process.env.CHAIRMAN_PHONE,
      title,
      decisionType: DECISION_TYPE,
      context,
    });
  } catch {
    // Fail-soft: SMS is a best-effort nudge on top of the durable console record + email
    // escalation already triggered above. A provider/DB throw here must never surface.
  }

  return result;
}

export default notifySwitchOnDecisionPacket;
