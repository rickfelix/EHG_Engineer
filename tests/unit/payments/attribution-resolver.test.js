import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractDirectAttribution,
  resolveViaLineage,
  resolveRow,
  resolveUnattributedEvents,
  computeAttributedRevenue,
  VALID_METHODS,
} from '../../../lib/payments/attribution-resolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('attribution-resolver (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002)', () => {
  describe('extractDirectAttribution', () => {
    it('TS-3: resolves a checkout.session.completed event carrying stamped metadata', () => {
      const rawPayload = { data: { object: { metadata: { venture_id: 'v-123', source_surface: 'pricing_page' } } } };
      expect(extractDirectAttribution(rawPayload)).toEqual({ ventureId: 'v-123', sourceSurface: 'pricing_page' });
    });

    it('TS-4: returns null (never a guess) for an event with no venture_id in object metadata', () => {
      expect(extractDirectAttribution({ data: { object: { metadata: {} } } })).toBeNull();
      expect(extractDirectAttribution({ data: { object: {} } })).toBeNull();
      expect(extractDirectAttribution({})).toBeNull();
    });

    it('returns sourceSurface: null when metadata carries venture_id but not source_surface', () => {
      const rawPayload = { data: { object: { metadata: { venture_id: 'v-123' } } } };
      expect(extractDirectAttribution(rawPayload)).toEqual({ ventureId: 'v-123', sourceSurface: null });
    });
  });

  describe('resolveViaLineage', () => {
    it('TS-3: resolves via a sibling sharing payment_intent_id (preferred over charge)', () => {
      const target = { payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1' };
      const candidates = [
        { payment_intent_id: 'pi_1', stripe_charge_id: null, venture_id: 'v-456' },
        { payment_intent_id: null, stripe_charge_id: 'ch_1', venture_id: 'v-999' },
      ];
      expect(resolveViaLineage(target, candidates)).toEqual({ ventureId: 'v-456', method: 'lineage_payment_intent' });
    });

    it('falls back to stripe_charge_id match when no payment_intent_id match exists', () => {
      const target = { payment_intent_id: 'pi_unmatched', stripe_charge_id: 'ch_1' };
      const candidates = [{ payment_intent_id: null, stripe_charge_id: 'ch_1', venture_id: 'v-456' }];
      expect(resolveViaLineage(target, candidates)).toEqual({ ventureId: 'v-456', method: 'lineage_charge' });
    });

    it('TS-4: returns null when neither payment_intent_id nor stripe_charge_id matches (never guessed)', () => {
      const target = { payment_intent_id: 'pi_orphan', stripe_charge_id: 'ch_orphan' };
      expect(resolveViaLineage(target, [{ payment_intent_id: 'pi_other', stripe_charge_id: 'ch_other', venture_id: 'v-1' }])).toBeNull();
    });

    it('ignores candidate rows with a null venture_id (an unresolved sibling cannot donate attribution)', () => {
      const target = { payment_intent_id: 'pi_1', stripe_charge_id: null };
      expect(resolveViaLineage(target, [{ payment_intent_id: 'pi_1', stripe_charge_id: null, venture_id: null }])).toBeNull();
    });
  });

  describe('resolveRow', () => {
    it('prefers direct attribution over lineage when both would resolve', () => {
      const row = { raw_payload: { data: { object: { metadata: { venture_id: 'v-direct' } } } }, payment_intent_id: 'pi_1' };
      const candidates = [{ payment_intent_id: 'pi_1', stripe_charge_id: null, venture_id: 'v-lineage' }];
      expect(resolveRow(row, candidates)).toEqual({ ventureId: 'v-direct', method: 'direct_metadata' });
    });

    it('TS-4: returns a reasoned UNATTRIBUTED result when neither method resolves', () => {
      const row = { raw_payload: { data: { object: {} } }, payment_intent_id: 'pi_orphan', stripe_charge_id: null };
      const result = resolveRow(row, []);
      expect(result.ventureId).toBeNull();
      expect(result.method).toBeNull();
      expect(result.reason).toMatch(/genuinely unattributable/);
    });
  });

  it('VALID_METHODS has no "inferred" value — zero heuristic attributions possible', () => {
    expect(VALID_METHODS).toEqual(['direct_metadata', 'lineage_payment_intent', 'lineage_charge']);
    expect(VALID_METHODS).not.toContain('inferred');
  });

  describe('computeAttributedRevenue (adversarial-review finding: Phase-1 IDEMP-02 dedup)', () => {
    it('dedups a single real payment captured as 3 separate webhook-event rows sharing payment_intent_id, counting it ONCE', () => {
      const rows = [
        { id: 'e1', amount_cents: 1000, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: 1000, currency: 'usd', event_type: 'payment_intent.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e3', amount_cents: 1000, currency: 'usd', event_type: 'charge.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1' },
      ];
      expect(computeAttributedRevenue(rows)).toEqual({ totalCents: 1000, currency: 'usd' });
    });

    it('prefers checkout.session over payment_intent/charge as the primary amount within a group', () => {
      const rows = [
        { id: 'e1', amount_cents: 999, currency: 'usd', event_type: 'charge.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1' },
        { id: 'e2', amount_cents: 1000, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_1', stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(rows).totalCents).toBe(1000);
    });

    it('sums genuinely distinct payments (different payment_intent_id) rather than collapsing them', () => {
      const rows = [
        { id: 'e1', amount_cents: 1000, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: 500, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_2', stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(rows).totalCents).toBe(1500);
    });

    it('ALWAYS adds refund rows (a genuine adjustment, never a duplicate of the original charge)', () => {
      const rows = [
        { id: 'e1', amount_cents: 1000, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: -400, currency: 'usd', event_type: 'charge.refunded', payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1' },
      ];
      expect(computeAttributedRevenue(rows).totalCents).toBe(600);
    });

    it('falls back to stripe_charge_id grouping when payment_intent_id is absent', () => {
      const rows = [
        { id: 'e1', amount_cents: 300, currency: 'usd', event_type: 'charge.succeeded', payment_intent_id: null, stripe_charge_id: 'ch_only' },
        { id: 'e2', amount_cents: 300, currency: 'usd', event_type: 'charge.refunded', payment_intent_id: null, stripe_charge_id: 'ch_only' },
      ];
      // Note: charge.refunded's amount_cents would itself already be negative
      // in a real captured row (ingester convention); this fixture uses a
      // positive value purely to prove refund rows are ALWAYS additive here.
      expect(computeAttributedRevenue(rows).totalCents).toBe(600);
    });

    it('rows with neither payment_intent_id nor stripe_charge_id are treated as independent singletons (never merged)', () => {
      const rows = [
        { id: 'e1', amount_cents: 100, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: null, stripe_charge_id: null },
        { id: 'e2', amount_cents: 200, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: null, stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(rows).totalCents).toBe(300);
    });

    it('returns currency: null (never mislabeled) when resolved rows span more than one currency', () => {
      const rows = [
        { id: 'e1', amount_cents: 1000, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: 800, currency: 'eur', event_type: 'checkout.session.completed', payment_intent_id: 'pi_2', stripe_charge_id: null },
      ];
      const result = computeAttributedRevenue(rows);
      expect(result.currency).toBeNull();
      expect(result.totalCents).toBe(1800);
    });

    it('returns totalCents: 0, currency: null for an empty row set', () => {
      expect(computeAttributedRevenue([])).toEqual({ totalCents: 0, currency: null });
    });

    it('adversarial-review round 2 finding: an abandoned/expired checkout session never counts as revenue — mapEventToRow still stamps amount_cents = amount_total (the INTENDED amount, never collected) and the row still carries venture_id metadata, but no money ever moved', () => {
      const rows = [
        { id: 'e1', amount_cents: 5000, currency: 'usd', event_type: 'checkout.session.expired', payment_intent_id: null, stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(rows)).toEqual({ totalCents: 0, currency: null });
    });

    it('adversarial-review round 2 finding: async_payment_failed checkout sessions never count as revenue', () => {
      const rows = [
        { id: 'e1', amount_cents: 5000, currency: 'usd', event_type: 'checkout.session.async_payment_failed', payment_intent_id: 'pi_1', stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(rows)).toEqual({ totalCents: 0, currency: null });
    });

    it('a failed/expired sibling never displaces the genuine terminal-success row within the same payment identity group', () => {
      const rows = [
        { id: 'e1', amount_cents: 5000, currency: 'usd', event_type: 'checkout.session.expired', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: 1000, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_1', stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(rows).totalCents).toBe(1000);
    });

    it('adversarial-review round 2 finding: order-independent within a same-prefix, different-lifecycle group — payment_intent.created (amount_received typically 0/null) never wins over payment_intent.succeeded regardless of array order', () => {
      const succeededFirst = [
        { id: 'e1', amount_cents: 1000, currency: 'usd', event_type: 'payment_intent.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: 0, currency: 'usd', event_type: 'payment_intent.created', payment_intent_id: 'pi_1', stripe_charge_id: null },
      ];
      const createdFirst = [
        { id: 'e2', amount_cents: 0, currency: 'usd', event_type: 'payment_intent.created', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e1', amount_cents: 1000, currency: 'usd', event_type: 'payment_intent.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(succeededFirst).totalCents).toBe(1000);
      expect(computeAttributedRevenue(createdFirst).totalCents).toBe(1000);
    });

    it('a payment identity group with ONLY non-terminal/failed events (no genuine success row) contributes zero — never falls back to picking a non-primary row', () => {
      const rows = [
        { id: 'e1', amount_cents: 700, currency: 'usd', event_type: 'payment_intent.payment_failed', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: 700, currency: 'usd', event_type: 'payment_intent.processing', payment_intent_id: 'pi_1', stripe_charge_id: null },
      ];
      expect(computeAttributedRevenue(rows)).toEqual({ totalCents: 0, currency: null });
    });
  });

  describe('resolveUnattributedEvents', () => {
    function buildSupabaseStub({ pending, candidates, updateSpy }) {
      return {
        from: vi.fn((table) => {
          expect(table).toBe('ops_payment_events');
          return {
            select: vi.fn(() => ({
              is: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => Promise.resolve({ data: pending, error: null })),
                  })),
                })),
              })),
              // FR-6 batch 8: candidate fetch now paginates via fetchAllPaginated → .not().order().range()
              not: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: vi.fn(() => Promise.resolve({ data: candidates, error: null })),
                })),
              })),
            })),
            update: vi.fn((patch) => {
              updateSpy(patch);
              return { eq: vi.fn(() => Promise.resolve({ error: null })) };
            }),
          };
        }),
      };
    }

    it('TS-3: processes a mixed batch (direct, lineage, unattributed) and writes the correct attribution_method per row', async () => {
      const pending = [
        { id: 'row-direct', payment_intent_id: 'pi_a', stripe_charge_id: null, raw_payload: { data: { object: { metadata: { venture_id: 'v-a' } } } } },
        { id: 'row-lineage', payment_intent_id: 'pi_b', stripe_charge_id: null, raw_payload: { data: { object: {} } } },
        { id: 'row-unattributed', payment_intent_id: 'pi_orphan', stripe_charge_id: null, raw_payload: { data: { object: {} } } },
      ];
      const candidates = [{ payment_intent_id: 'pi_b', stripe_charge_id: null, venture_id: 'v-b' }];
      const updates = [];
      const supabase = buildSupabaseStub({ pending, candidates, updateSpy: (p) => updates.push(p) });

      const result = await resolveUnattributedEvents(supabase, { limit: 500 });

      expect(result).toEqual({ processed: 3, resolved: 2, unattributed: 1 });
      expect(updates.find((u) => u.venture_id === 'v-a').attribution_method).toBe('direct_metadata');
      expect(updates.find((u) => u.venture_id === 'v-b').attribution_method).toBe('lineage_payment_intent');
      const unattributedUpdate = updates.find((u) => u.attribution_status === 'unattributed');
      expect(unattributedUpdate.venture_id).toBeUndefined();
      expect(unattributedUpdate.attribution_reason).toMatch(/genuinely unattributable/);
    });

    it('TS-6: re-running over an already-fully-processed batch performs zero writes', async () => {
      const supabase = buildSupabaseStub({ pending: [], candidates: [], updateSpy: () => { throw new Error('should not be called'); } });
      const result = await resolveUnattributedEvents(supabase, { limit: 500 });
      expect(result).toEqual({ processed: 0, resolved: 0, unattributed: 0 });
    });

    it('VALIDATION finding: lineage resolution is order-independent within a batch — a row needing lineage does NOT get permanently stranded as unattributed just because its metadata-carrying sibling appears LATER in the same pending batch', async () => {
      // row-charge (needs lineage) is listed FIRST; row-checkout (carries direct
      // metadata, and is row-charge's only possible donor via payment_intent_id)
      // is listed SECOND. A naive single-pass, in-order resolver would mark
      // row-charge unattributed before row-checkout ever resolves.
      const pending = [
        { id: 'row-charge', payment_intent_id: 'pi_shared', stripe_charge_id: null, raw_payload: { data: { object: {} } } },
        { id: 'row-checkout', payment_intent_id: 'pi_shared', stripe_charge_id: null, raw_payload: { data: { object: { metadata: { venture_id: 'v-ordered' } } } } },
      ];
      const updates = [];
      const supabase = buildSupabaseStub({ pending, candidates: [], updateSpy: (p) => updates.push(p) });

      const result = await resolveUnattributedEvents(supabase, { limit: 500 });

      expect(result).toEqual({ processed: 2, resolved: 2, unattributed: 0 });
      const chargeUpdate = updates.find((u) => u.attribution_method === 'lineage_payment_intent');
      expect(chargeUpdate.venture_id).toBe('v-ordered');
      const checkoutUpdate = updates.find((u) => u.attribution_method === 'direct_metadata');
      expect(checkoutUpdate.venture_id).toBe('v-ordered');
    });
  });

  it('TS-2: PAT-PORT-ISOL-001 regression pin — the ingester still stamps venture_id: null unconditionally, unchanged by this SD', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../api/webhooks/stripe.js'), 'utf8');
    expect(source).toMatch(/venture_id:\s*null,\s*\/\/\s*venture-agnostic:\s*never inferred here \(PAT-PORT-ISOL-001\)/);
  });
});
