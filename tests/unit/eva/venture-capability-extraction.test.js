/**
 * FR-3 venture-capability extraction + reuse tracking — pure unit tests. DB-free.
 * Live-verified separately against the real venture_capabilities table (extraction upsert,
 * idempotent reuse recording, maturity-guard flip, and that re-running extraction does not
 * clobber reuse_count/consumers).
 */
import { describe, it, expect } from 'vitest';
import {
  recordCapabilityReuse,
  evaluateExtractionChecklist,
  evaluateCapabilityMaturity,
} from '../../../lib/eva/venture-capability-extraction.js';

function stubSupabase({ existingRow = null, updateError = null, upsertError = null } = {}) {
  const updates = [];
  const upserts = [];
  return {
    updates,
    upserts,
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }) }),
        update: (row) => {
          updates.push(row);
          return { eq: async () => ({ error: updateError }) };
        },
        upsert: (row) => {
          upserts.push(row);
          return {
            select: () => ({
              maybeSingle: async () => (upsertError ? { data: null, error: upsertError } : { data: { id: 'cap-' + upserts.length }, error: null }),
            }),
          };
        },
      }),
    },
  };
}

describe('venture-capability-extraction (FR-3)', () => {
  describe('recordCapabilityReuse', () => {
    it('increments reuse_count and appends the consuming venture on first reuse', async () => {
      const { supabase, updates } = stubSupabase({ existingRow: { id: 'cap-1', consumers: [], reuse_count: 0 } });
      const result = await recordCapabilityReuse(supabase, { capabilityId: 'cap-1', consumingVentureId: 'v-1' });
      expect(result).toEqual({ recorded: true, reuseCount: 1 });
      expect(updates[0].consumers).toEqual(['v-1']);
      expect(updates[0].reuse_count).toBe(1);
    });

    it('is idempotent — a venture already in consumers is not double-counted', async () => {
      const { supabase, updates } = stubSupabase({ existingRow: { id: 'cap-1', consumers: ['v-1'], reuse_count: 1 } });
      const result = await recordCapabilityReuse(supabase, { capabilityId: 'cap-1', consumingVentureId: 'v-1' });
      expect(result).toEqual({ recorded: false, reason: 'already_recorded', reuseCount: 1 });
      expect(updates).toHaveLength(0);
    });

    it('increments correctly for a SECOND distinct consumer', async () => {
      const { supabase, updates } = stubSupabase({ existingRow: { id: 'cap-1', consumers: ['v-1'], reuse_count: 1 } });
      const result = await recordCapabilityReuse(supabase, { capabilityId: 'cap-1', consumingVentureId: 'v-2' });
      expect(result).toEqual({ recorded: true, reuseCount: 2 });
      expect(updates[0].consumers).toEqual(['v-1', 'v-2']);
    });

    it('throws when the capability does not exist', async () => {
      const { supabase } = stubSupabase({ existingRow: null });
      await expect(recordCapabilityReuse(supabase, { capabilityId: 'missing', consumingVentureId: 'v-1' })).rejects.toThrow(/not found/);
    });

    it('requires capabilityId and consumingVentureId', async () => {
      const { supabase } = stubSupabase();
      await expect(recordCapabilityReuse(supabase, { capabilityId: null, consumingVentureId: 'v-1' })).rejects.toThrow(/requires/);
    });
  });

  describe('evaluateExtractionChecklist', () => {
    it('upserts each valid capability and reports the count', async () => {
      const { supabase, upserts } = stubSupabase();
      const result = await evaluateExtractionChecklist(supabase, {
        ventureId: 'v-1',
        sdKey: 'SD-EXAMPLE-001',
        capabilities: [
          { name: 'pricing-algo', capabilityType: 'algorithm', evidence: { note: 'x' } },
          { name: 'checkout-flow', capabilityType: 'ui_pattern' },
        ],
      });
      expect(result.upserted).toBe(2);
      expect(upserts).toHaveLength(2);
      expect(upserts[0]).toMatchObject({ name: 'pricing-algo', origin_venture_id: 'v-1', origin_sd_key: 'SD-EXAMPLE-001', capability_type: 'algorithm' });
    });

    it('skips a capability missing name/capabilityType without failing the batch', async () => {
      const { supabase } = stubSupabase();
      const result = await evaluateExtractionChecklist(supabase, {
        ventureId: 'v-1',
        capabilities: [{ name: 'bad-one' }, { name: 'good-one', capabilityType: 'algorithm' }],
      });
      expect(result.upserted).toBe(1);
      expect(result.results[0]).toMatchObject({ upserted: false, reason: expect.stringContaining('missing') });
    });

    it('records a per-capability failure without throwing (partial-batch resilience)', async () => {
      const { supabase } = stubSupabase({ upsertError: { message: 'constraint violation' } });
      const result = await evaluateExtractionChecklist(supabase, {
        ventureId: 'v-1',
        capabilities: [{ name: 'x', capabilityType: 'algorithm' }],
      });
      expect(result.upserted).toBe(0);
      expect(result.results[0].reason).toBe('constraint violation');
    });

    it('requires ventureId and a capabilities array', async () => {
      const { supabase } = stubSupabase();
      await expect(evaluateExtractionChecklist(supabase, { capabilities: [] })).rejects.toThrow(/requires/);
    });
  });

  describe('evaluateCapabilityMaturity (extraction-honesty guard, "no trophy shelf")', () => {
    it('reports reference for a capability that has NEVER been reused, regardless of stored maturity_level', () => {
      expect(evaluateCapabilityMaturity({ reuse_count: 0, maturity_level: 'proven' })).toBe('reference');
    });

    it('reports the stored maturity_level once a capability has been reused at least once', () => {
      expect(evaluateCapabilityMaturity({ reuse_count: 1, maturity_level: 'proven' })).toBe('proven');
    });

    it('defaults to experimental when maturity_level is unset and reuse has occurred', () => {
      expect(evaluateCapabilityMaturity({ reuse_count: 3 })).toBe('experimental');
    });

    it('handles a missing reuse_count as zero (reference)', () => {
      expect(evaluateCapabilityMaturity({ maturity_level: 'proven' })).toBe('reference');
    });
  });
});
