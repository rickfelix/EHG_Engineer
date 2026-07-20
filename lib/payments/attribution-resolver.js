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

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: the candidate set is EVERY already-
// attributed ops_payment_events row — a silent 1000-row cap would truncate the lineage candidate set
// and permanently strand rows as unattributed (the exact class the two-pass fix exists to prevent).
// Paginate (fail-closed: candidate fetch error still throws). The pending batch keeps its .limit(limit).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const VALID_METHODS = ['direct_metadata', 'lineage_payment_intent', 'lineage_charge'];

// Primary-event-type preference order, matching api/webhooks/stripe.js's own
// mapEventToRow dispatch: a SINGLE real payment fires multiple distinct
// webhook events (checkout.session.completed, payment_intent.succeeded,
// charge.succeeded), each captured as its own ops_payment_events row (the
// Phase-1 migration's own IDEMP-02 note: dedup is per-EVENT, not per-PAYMENT
// -- "Phase-2 MUST dedup on payment_intent_id/charge_id before summing, or
// it will double-count"). This is that Phase-2 dedup.
//
// EXACT terminal-success types only (adversarial-review round 2 finding):
// prefix matching ('checkout.session', 'payment_intent') also matched
// non-payment lifecycle events sharing the same prefix -- most concretely
// checkout.session.expired / checkout.session.async_payment_failed, which
// mapEventToRow still stamps with amount_cents = amount_total (the INTENDED
// amount, never collected) and which still carries venture_id metadata
// (stamped at session-creation time, before the outcome is known). A prefix
// match let an abandoned/failed checkout be picked as a group's primary and
// counted as real revenue. Exact-match also removes the intermediate
// lifecycle states of the same object (payment_intent.created/.processing/
// .payment_failed all share the 'payment_intent' prefix with .succeeded),
// closing an order-dependent tie-break: two same-prefix, different-status
// rows for one payment_intent_id could previously tie on priority and the
// unordered resolved-rows query (funnel-gauge.mjs) could pick either.
const PRIMARY_TYPE_PRIORITY = ['checkout.session.completed', 'payment_intent.succeeded', 'charge.succeeded'];

function classifyEventKind(eventType) {
  if (eventType === 'charge.refunded') return 'refund';
  if (PRIMARY_TYPE_PRIORITY.includes(eventType)) return 'primary';
  return 'other';
}

/**
 * Pure: sum attributed revenue for a set of resolved ops_payment_events rows
 * WITHOUT double-counting a single real payment's multiple webhook-event
 * rows. Groups rows by payment identity (payment_intent_id, falling back to
 * stripe_charge_id, falling back to the row's own id as a singleton group
 * for events with neither) and within each group sums exactly ONE primary
 * amount (preferring checkout.session > payment_intent > charge, matching
 * Stripe's own event-richness ordering) PLUS every refund-type row (a
 * genuine additive adjustment, never a duplicate of the original charge --
 * mapEventToRow already stores refunds as a negative amount_cents delta).
 *
 * @param {Array<{ amount_cents: number|null, currency: string|null, event_type: string, payment_intent_id: string|null, stripe_charge_id: string|null, id?: string }>} rows
 * @returns {{ totalCents: number, currency: string|null }} currency is null when rows span more than one distinct currency (never mislabeled)
 */
export function computeAttributedRevenue(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.payment_intent_id || row.stripe_charge_id || `singleton:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let totalCents = 0;
  const currencies = new Set();

  for (const groupRows of groups.values()) {
    let primaryPicked = null;
    let primaryPriority = Infinity;
    for (const row of groupRows) {
      const kind = classifyEventKind(row.event_type);
      if (kind === 'refund') {
        totalCents += row.amount_cents || 0;
        if (row.currency) currencies.add(row.currency);
        continue;
      }
      if (kind !== 'primary') continue; // non-terminal/failed events never contribute (e.g. checkout.session.expired, payment_intent.created)
      const priority = PRIMARY_TYPE_PRIORITY.indexOf(row.event_type);
      if (priority < primaryPriority) {
        primaryPriority = priority;
        primaryPicked = row;
      }
    }
    if (primaryPicked) {
      totalCents += primaryPicked.amount_cents || 0;
      if (primaryPicked.currency) currencies.add(primaryPicked.currency);
    }
  }

  return { totalCents, currency: currencies.size === 1 ? [...currencies][0] : null };
}

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

  let candidates;
  try {
    candidates = await fetchAllPaginated(() => supabase
      .from('ops_payment_events')
      .select('payment_intent_id, stripe_charge_id, venture_id')
      .not('venture_id', 'is', null)
      .order('id', { ascending: true })); // id tiebreaker: stable page boundaries (FR-6)
  } catch (candidatesError) {
    throw new Error(`resolveUnattributedEvents: candidate fetch failed: ${candidatesError.message}`);
  }

  // Two-pass (VALIDATION sub-agent finding): resolveRow's direct-then-lineage
  // order per-row is correct, but applying it in a SINGLE pass across the
  // batch made lineage resolution depend on created_at processing order -- a
  // charge event preceding its metadata-carrying checkout.session sibling
  // would be marked unattributed and PERMANENTLY stranded (future runs only
  // scan attribution_status IS NULL rows). Pass 1 resolves every row whose
  // OWN object carries direct metadata, regardless of position in the batch,
  // and folds all of them into the candidate set. Pass 2 then runs lineage
  // resolution against that complete, order-independent candidate set.
  const runningCandidates = [...(candidates || [])];
  const results = new Map(); // row.id -> { ventureId, method } | { ventureId: null, reason }

  for (const row of pending) {
    const direct = extractDirectAttribution(row.raw_payload);
    if (direct) {
      results.set(row.id, { ventureId: direct.ventureId, method: 'direct_metadata' });
      runningCandidates.push({ payment_intent_id: row.payment_intent_id, stripe_charge_id: row.stripe_charge_id, venture_id: direct.ventureId });
    }
  }

  for (const row of pending) {
    if (results.has(row.id)) continue; // already resolved directly in pass 1
    const lineage = resolveViaLineage(row, runningCandidates);
    if (lineage) {
      results.set(row.id, { ventureId: lineage.ventureId, method: lineage.method });
    } else {
      results.set(row.id, {
        ventureId: null,
        reason: 'no direct metadata and no resolvable sibling event (payment_intent_id/stripe_charge_id) — genuinely unattributable',
      });
    }
  }

  let resolvedCount = 0;
  let unattributedCount = 0;
  const nowIso = new Date().toISOString();

  for (const row of pending) {
    const result = results.get(row.id);
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
