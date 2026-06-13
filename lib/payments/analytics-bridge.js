// @wire-check-exempt: Phase-2 forward-only analytics bridge (FR-5 deferred until ops-revenue-collector enum/status reconciliation); intentionally not wired in Phase-1.
/**
 * Analytics bridge: ops_payment_events -> capital_transactions.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001  (FR-5, Phase-1 re-scope)
 *
 * PHASE-1 IS FORWARD-ONLY. The DATABASE sub-agent verified that the existing
 * lib/eva/services/ops-revenue-collector.js reads capital_transactions.status
 * (column absent) and filters transaction_type IN ('revenue','expansion',
 * 'contraction') (NOT in the live capital_transaction_type enum), and that
 * capital_transactions.venture_id is NOT NULL. Therefore Phase-1 does NOT insert
 * capital_transactions rows. This module only provides the pure mapping (cents ->
 * numeric major units) so the bridge is ready; the actual INSERT + the collector
 * enum/status reconciliation are DEFERRED to Phase-2 (consistent with the SD
 * scope deferring MRR aggregation).
 */

/**
 * Pure mapper: a captured ops_payment_events row -> the capital_transactions
 * shape it WOULD become in Phase-2. Does not touch the database.
 * @param {object} paymentEvent - a row from ops_payment_events
 * @returns {object} forward-only capital_transactions candidate (not inserted)
 */
export function toCapitalTransactionCandidate(paymentEvent) {
  if (!paymentEvent || !paymentEvent.stripe_event_id) {
    throw new Error('toCapitalTransactionCandidate requires a payment event with stripe_event_id');
  }
  const cents = typeof paymentEvent.amount_cents === 'number' ? paymentEvent.amount_cents : 0;
  return {
    // amount in MAJOR units (capital_transactions.amount is numeric, not cents)
    amount: cents / 100,
    currency: paymentEvent.currency || 'usd',
    stripe_charge_id: paymentEvent.stripe_charge_id || null,
    stripe_event_id: paymentEvent.stripe_event_id,
    // venture_id intentionally unresolved here (NOT NULL on capital_transactions).
    // Phase-2 must resolve/assign a venture before insert.
    venture_id: paymentEvent.venture_id || null,
    // transaction_type / status intentionally omitted: Phase-2 enum+status
    // reconciliation against ops-revenue-collector is required first.
    _phase2_deferred: true
  };
}

/**
 * Phase-1 guard: writing to capital_transactions is deferred. Calling this is a
 * loud, intentional error so no one wires the collector path prematurely.
 */
export async function bridgeToCapitalTransactions() {
  throw new Error(
    'analytics-bridge: capital_transactions insertion is DEFERRED to Phase-2 ' +
    '(requires capital_transaction_type enum + status reconciliation and venture resolution). ' +
    'Phase-1 captures into ops_payment_events only.'
  );
}
