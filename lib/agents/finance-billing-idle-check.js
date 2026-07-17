/**
 * FINANCE_BILLING_OPERATOR real idle/active check -- SD-LEO-INFRA-ORG-TEMPLATE-ARMING-001 (FR-3).
 *
 * Wires the operator's honest_idle description ("no payment/checkout events ->
 * capture, reconcile and dunning all no-op; never fabricate a ledger row or MRR
 * figure") into a real runtime check, reusing the count-then-decide pattern
 * already proven in scripts/operator/feed-operator-cash-burn.mjs against the
 * same ops_payment_events table.
 *
 * ops_payment_events already holds a real production row, so a raw fleet-wide
 * count(*) can never observe a true zero-state. sinceTimestamp scopes the count
 * to events created after a given marker, so a caller (tests, in particular) can
 * get a deterministic idle-then-active window without touching or deleting any
 * pre-existing row. Production callers simply omit sinceTimestamp for the
 * unscoped, fleet-wide reading.
 */
import { createSupabaseServiceClient } from '../supabase-client.js';

/**
 * @param {{ sinceTimestamp?: string }} [opts]
 * @param {object} [supabase]
 * @returns {Promise<{ status: 'idle'|'active', event_count: number, since_timestamp: string|null }>}
 */
export async function checkFinanceBillingIdle({ sinceTimestamp = null } = {}, supabase = createSupabaseServiceClient()) {
  let query = supabase.from('ops_payment_events').select('id', { count: 'exact', head: true });
  if (sinceTimestamp) {
    query = query.gte('event_ts', sinceTimestamp);
  }
  const { count, error } = await query;
  if (error) {
    throw new Error(`FINANCE_BILLING idle check failed: ${error.message}`);
  }

  const eventCount = count ?? 0;
  return {
    status: eventCount > 0 ? 'active' : 'idle',
    event_count: eventCount,
    since_timestamp: sinceTimestamp,
  };
}
