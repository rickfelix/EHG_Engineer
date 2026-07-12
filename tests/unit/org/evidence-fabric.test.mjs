/**
 * FR-5 portfolio evidence fabric — pure unit tests.
 * DB-free: portfolio_evidence writes/reads run against a minimal chainable stub that echoes the
 * inserted row. Matches the tests/unit/org house convention (no live DB, no mocking library).
 *
 * TS-5: the evidence fabric accepts writes from at least 2 distinct writer types (simulated).
 */
import { describe, it, expect } from 'vitest';
import {
  writeEvidence,
  readEvidence,
  assertProvenance,
  PROVENANCE_KINDS,
} from '../../../lib/org/evidence-fabric.mjs';

// Insert stub: echoes the row back as data (with a synthetic id), records the last insert.
const writeStub = () => {
  const inserts = [];
  return {
    inserts,
    supabase: {
      from() {
        return {
          insert(row) {
            inserts.push(row);
            return { select: () => ({ maybeSingle: async () => ({ data: { id: 'ev_' + inserts.length, ...row }, error: null }) }) };
          },
        };
      },
    },
  };
};

// Read stub: records the filter chain and returns a fixed dataset.
const readStub = (rows) => {
  const filters = [];
  const chain = {
    eq(col, val) { filters.push([col, val]); return chain; },
    order() { return chain; },
    limit() { return Promise.resolve({ data: rows, error: null }); },
  };
  return { filters, supabase: { from() { return { select() { return chain; } }; } } };
};

describe('evidence-fabric (FR-5)', () => {
  describe('writeEvidence — TS-5 multi-writer-type acceptance', () => {
    it('accepts writes from 2 distinct writer types into ONE store', async () => {
      const { supabase, inserts } = writeStub();
      const fromVigilance = await writeEvidence(supabase, {
        evidenceKind: 'anomaly', provenance: 'real_event', sourceModule: 'vigilance_loop',
        ventureId: 'v1', subjectType: 'venture', subjectId: 'v1', payload: { severity: 'high' },
      });
      const fromLearning = await writeEvidence(supabase, {
        evidenceKind: 'capability_signal', provenance: 'derived', sourceModule: 'learning_loop',
        ventureId: 'v1', payload: { skill: 'pricing' },
      });
      expect(fromVigilance.id).toBe('ev_1');
      expect(fromLearning.id).toBe('ev_2');
      // ONE store, TWO distinct writer types
      expect(inserts.map((r) => r.source_module)).toEqual(['vigilance_loop', 'learning_loop']);
      expect(fromVigilance.provenance).toBe('real_event');
      expect(fromLearning.provenance).toBe('derived');
    });

    it('requires evidenceKind', async () => {
      const { supabase } = writeStub();
      await expect(writeEvidence(supabase, { provenance: 'real_event' })).rejects.toThrow(/evidenceKind/);
    });

    it('defaults payload to {} and passes through nulls for optional fields', async () => {
      const { supabase, inserts } = writeStub();
      await writeEvidence(supabase, { evidenceKind: 'k', provenance: 'synthetic' });
      expect(inserts[0].payload).toEqual({});
      expect(inserts[0].venture_id).toBeNull();
      expect(inserts[0].source_identity).toBeNull();
    });
  });

  describe('provenance taxonomy (G3 doctrine — replayed_fixture is never real_event)', () => {
    it('accepts every taxonomy value', () => {
      for (const p of PROVENANCE_KINDS) expect(() => assertProvenance(p)).not.toThrow();
      expect(PROVENANCE_KINDS).toContain('real_event');
      expect(PROVENANCE_KINDS).toContain('replayed_fixture');
    });

    it('rejects an unknown/mislabeled provenance at the call site (not a raw DB error)', async () => {
      const { supabase } = writeStub();
      expect(() => assertProvenance('production')).toThrow(/invalid provenance/);
      await expect(writeEvidence(supabase, { evidenceKind: 'k', provenance: 'production' })).rejects.toThrow(/invalid provenance/);
    });

    it('requires provenance to be declared explicitly (no default upgrade path)', async () => {
      const { supabase } = writeStub();
      await expect(writeEvidence(supabase, { evidenceKind: 'k' })).rejects.toThrow(/invalid provenance/);
    });
  });

  describe('readEvidence filtering', () => {
    it('applies each provided filter and returns rows newest-first', async () => {
      const { supabase, filters } = readStub([{ id: 'e1' }, { id: 'e2' }]);
      const rows = await readEvidence(supabase, { ventureId: 'v1', evidenceKind: 'anomaly', provenance: 'real_event' });
      expect(rows).toHaveLength(2);
      expect(filters).toContainEqual(['venture_id', 'v1']);
      expect(filters).toContainEqual(['evidence_kind', 'anomaly']);
      expect(filters).toContainEqual(['provenance', 'real_event']);
    });

    it('validates provenance filter before querying', async () => {
      const { supabase } = readStub([]);
      await expect(readEvidence(supabase, { provenance: 'nope' })).rejects.toThrow(/invalid provenance/);
    });

    it('returns [] when no filters and no rows', async () => {
      const { supabase } = readStub([]);
      const rows = await readEvidence(supabase);
      expect(rows).toEqual([]);
    });
  });
});
