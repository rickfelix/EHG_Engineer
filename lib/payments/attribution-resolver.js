/**
 * Stripe-event-to-venture attribution resolver (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002).
 *
 * Phase-1's ingester (api/webhooks/stripe.js) stamps venture_id: null on every
 * captured ops_payment_events row unconditionally (PAT-PORT-ISOL-001) -- this
 * module resolves attribution AFTER capture, never by inference in the
 * ingester. Two resolution methods, both DB-only (no live Stripe API calls,
 * so resolution stays idempotent/replayable/offline):
 *   1. direct_metadata: the event's own object carries metadata.venture_id
 *      (stamped at checkout-session creation by lib/payments/checkout-provenance.js).
 *   2. lineage_payment_intent / lineage_charge: a SIBLING event sharing the
 *      same payment_intent_id or stripe_charge_id was already resolved --
 *      borrow its venture_id (Stripe object IDs are globally unique within
 *      an account, so this can never cross-attribute between ventures).
 * A row resolvable by neither is stamped attribution_status='unattributed'
 * with a reason -- venture_id stays NULL. Never guessed.
 */

const VALID_METHODS = ['direct_metadata', 'lineage_payment_intent', 'lineage_charge'];

/**
 * Pure: read venture provenance directly off a stored event's own object
 * metadata. Works for checkout.session events (stamped directly) and for
 * subscription/invoice events whose object inherited metadata from
 * checkout-session creation's subscription_data.metadata stamping.
 *
 * @param {object} rawPayload - the full stored Stripe event (ops_payment_events.raw_payload)
 * @returns {{ ventureId: string, sourceSurface: string|null }|null}
 */
export function extractDirectAttribution(rawPayload) {
  const obj = rawPayload?.data?.object;
  const ventureId = obj?.metadata?.venture_id;
  if (!ventureId || typeof ventureId !== 'string') return null;
  return { ventureId, sourceSurface: obj.metadata.source_surface ?? null };
}

/**
 * Pure: resolve via a sibling row already carrying a non-null venture_id,
 * matched on payment_intent_id (preferred) then stripe_charge_id. Stripe
 * object IDs are globally unique within one Stripe account -- a shared id
 * can only mean "the same underlying payment," never a cross-venture collision.
 *
 * @param {{ payment_intent_id: string|null, stripe_charge_id: string|null }} targetRow
 * @param {Array<{ payment_intent_id: string|null, stripe_charge_id: string|null, venture_id: string|null }>} candidateRows
 * @returns {{ ventureId: string, method: 'lineage_payment_intent'|'lineage_charge' }|null}
 */
export function resolveViaLineage(targetRow, candidateRows) {
  if (!Array.isArray(candidateRows)) return null;

  if (targetRow.payment_intent_id) {
    const match = candidateRows.find(
      (r) => r.venture_id && r.payment_intent_id === targetRow.payment_intent_id,
    );
    if (match) return { ventureId: match.venture_id, method: 'lineage_payment_intent' };
  }

  if (targetRow.stripe_charge_id) {
    const match = candidateRows.find(
      (r) => r.venture_id && r.stripe_charge_id === targetRow.stripe_charge_id,
    );
    if (match) return { ventureId: match.venture_id, method: 'lineage_charge' };
  }

  return null;
}

/**
 * Resolve one unattributed row: direct match first, then lineage fallback
 * against the supplied candidate set. Pure (no I/O) -- callers own fetching
 * candidateRows and persisting the result.
 *
 * @param {object} row - an ops_payment_events row (with raw_payload, payment_intent_id, stripe_charge_id)
 * @param {Array<object>} candidateRows - other rows to search for lineage matches
 * @returns {{ ventureId: string, method: string }|{ ventureId: null, method: null, reason: string }}
 */
export function resolveRow(row, candidateRows) {
  const direct = extractDirectAttribution(row.raw_payload);
  if (direct) return { ventureId: direct.ventureId, method: 'direct_metadata' };

  const lineage = resolveViaLineage(row, candidateRows);
  if (lineage) return { ventureId: lineage.ventureId, method: lineage.method };

  return {
    ventureId: null,
    method: null,
    reason: 'no direct metadata and no resolvable sibling event (payment_intent_id/stripe_charge_id) — genuinely unattributable',
  };
}

/**
 * Orchestration: read ops_payment_events WHERE venture_id IS NULL AND
 * attribution_status IS NULL, resolve each row, and persist. Idempotent --
 * a row already stamped 'resolved' or 'unattributed' is excluded from the
 * WHERE clause on every subsequent call, so re-running performs zero writes
 * over an already-processed batch.
 *
 * @param {object} supabase - Supabase client (service-role)
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @returns {Promise<{ processed: number, resolved: number, unattributed: number }>}
 */
export async function resolveUnattributedEvents(supabase, { limit = 500 } = {}) {
  const { data: pending, error: pendingError } = await supabase
    .from('ops_payment_events')
    .select('id, payment_intent_id, stripe_charge_id, raw_payload')
    .is('venture_id', null)
    .is('attribution_status', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (pendingError) throw new Error(`resolveUnattributedEvents: fetch failed: ${pendingError.message}`);
  if (!pending || pending.length === 0) return { processed: 0, resolved: 0, unattributed: 0 };

  const { data: candidates, error: candidatesError } = await supabase
    .from('ops_payment_events')
    .select('payment_intent_id, stripe_charge_id, venture_id')
    .not('venture_id', 'is', null);

  if (candidatesError) throw new Error(`resolveUnattributedEvents: candidate fetch failed: ${candidatesError.message}`);

  let resolvedCount = 0;
  let unattributedCount = 0;
  const nowIso = new Date().toISOString();

  for (const row of pending) {
    const result = resolveRow(row, candidates || []);
    if (result.ventureId) {
       
      const { error } = await supabase
        .from('ops_payment_events')
        .update({
          venture_id: result.ventureId,
          attribution_method: result.method,
          attribution_status: 'resolved',
          resolved_at: nowIso,
        })
        .eq('id', row.id);
      if (error) throw new Error(`resolveUnattributedEvents: update failed for row ${row.id}: ${error.message}`);
      resolvedCount += 1;
      // Newly-resolved rows become lineage candidates for the rest of this batch.
      candidates.push({ payment_intent_id: row.payment_intent_id, stripe_charge_id: row.stripe_charge_id, venture_id: result.ventureId });
    } else {
       
      const { error } = await supabase
        .from('ops_payment_events')
        .update({
          attribution_status: 'unattributed',
          attribution_reason: result.reason,
          resolved_at: nowIso,
        })
        .eq('id', row.id);
      if (error) throw new Error(`resolveUnattributedEvents: update failed for row ${row.id}: ${error.message}`);
      unattributedCount += 1;
    }
  }

  return { processed: pending.length, resolved: resolvedCount, unattributed: unattributedCount };
}

export { VALID_METHODS };
