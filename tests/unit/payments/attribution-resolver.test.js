import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractDirectAttribution,
  resolveViaLineage,
  resolveRow,
  resolveUnattributedEvents,
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
              not: vi.fn(() => Promise.resolve({ data: candidates, error: null })),
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
  });

  it('TS-2: PAT-PORT-ISOL-001 regression pin — the ingester still stamps venture_id: null unconditionally, unchanged by this SD', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../api/webhooks/stripe.js'), 'utf8');
    expect(source).toMatch(/venture_id:\s*null,\s*\/\/\s*venture-agnostic:\s*never inferred here \(PAT-PORT-ISOL-001\)/);
  });
});
