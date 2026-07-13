/**
 * Genesis backfill tests (FR-2).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001)
 */
import { describe, it, expect } from 'vitest';
import { GENESIS_LOOPS, toLoopRow, backfillGenesisLoops } from '../genesis-loops.js';
import { validateClosurePredicate } from '../closure-engine.js';

describe('GENESIS_LOOPS manifest (FR-2)', () => {
  it('enumerates exactly L1-L33 with unique keys', () => {
    expect(GENESIS_LOOPS).toHaveLength(33);
    const keys = GENESIS_LOOPS.map((l) => l.loop_key);
    expect(new Set(keys).size).toBe(33);
    for (let i = 1; i <= 33; i++) expect(keys).toContain(`L${i}`);
  });

  it('marks L3 (the one CLOSED-ARMED self-improvement loop) closed; the rest open', () => {
    const l3 = GENESIS_LOOPS.find((l) => l.loop_key === 'L3');
    expect(l3.status).toBe('closed');
    expect(GENESIS_LOOPS.filter((l) => l.status === 'closed')).toHaveLength(1);
  });

  it('every backfilled row carries a machine-checkable closure predicate (FR-4 ready)', () => {
    for (const entry of GENESIS_LOOPS) {
      const row = toLoopRow(entry);
      expect(validateClosurePredicate(row).valid).toBe(true);
    }
  });

  it('carries the named closing SDs from the map', () => {
    expect(toLoopRow(GENESIS_LOOPS.find((l) => l.loop_key === 'L5')).closing_sd_key).toBe('SD-VENTURE-REVENUE-ATTRIBUTION-ARM-001');
    expect(toLoopRow(GENESIS_LOOPS.find((l) => l.loop_key === 'L1')).closing_sd_key).toBe('SD-FDBK-ENH-EHG-OPERATING-COMPANY-001');
  });
});

describe('backfillGenesisLoops (FR-2 — idempotent, fail-soft)', () => {
  it('upserts all 33 on loop_key when the table exists', async () => {
    let upsertedRows = null;
    let onConflict = null;
    const supabase = { from: () => ({ upsert: async (rows, opts) => { upsertedRows = rows; onConflict = opts?.onConflict; return { error: null }; } }) };
    const r = await backfillGenesisLoops(supabase);
    expect(r.applied).toBe(true);
    expect(r.upserted).toBe(33);
    expect(upsertedRows).toHaveLength(33);
    expect(onConflict).toBe('loop_key'); // idempotent
  });

  it('FAIL-SOFT: reports applied=false (not throw) when the table is absent (chairman-gated apply pending)', async () => {
    const supabase = { from: () => ({ upsert: async () => ({ error: { message: 'relation "public.loop_registry" does not exist' } }) }) };
    const r = await backfillGenesisLoops(supabase);
    expect(r.applied).toBe(false);
    expect(r.reason).toMatch(/loop_registry/);
    expect(r.total).toBe(33);
  });

  it('FAIL-SOFT: swallows a thrown client error', async () => {
    const supabase = { from: () => ({ upsert: async () => { throw new Error('network down'); } }) };
    const r = await backfillGenesisLoops(supabase);
    expect(r.applied).toBe(false);
    expect(r.reason).toMatch(/network down/);
  });
});
