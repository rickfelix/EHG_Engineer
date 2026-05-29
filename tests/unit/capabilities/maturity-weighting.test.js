/**
 * Maturity-Weighted Portfolio-Aware Capability Anchoring Tests
 * SD: SD-LEO-INFRA-MATURITY-WEIGHTED-PORTFOLIO-001 (FR-1..FR-5)
 *
 * Covers:
 *   - maturityToCapCount: monotonicity + bounds (pure, no DB).
 *   - computePortfolioMaturity: fail-soft to full weight (no DB), and live signal (DB).
 *   - getCapabilityContextBlock: portfolio-wide source (v_unified_capabilities), no
 *     undefined-column regression, exploratory preamble at immaturity, monotonic influence,
 *     and simple_venture remains de-anchored (DB).
 */

import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import {
  computePortfolioMaturity,
  maturityToCapCount,
  getCapabilityContextBlock,
} from '../../../lib/capabilities/scanner-context.js';

dotenv.config();

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// Count capability rows in a formatted block (overhang/trend use '| ' table rows or '- ' bullets).
const countCapabilityLines = (s) => (s.match(/^[|\-] /gm) || []).length;

// ─────────────────────────────────────────────────────────────────────────────
// UNIT — no DB
// ─────────────────────────────────────────────────────────────────────────────

describe('maturityToCapCount — monotonicity + bounds (no DB)', () => {
  it('MW-1: is monotonically non-decreasing across maturity', () => {
    const samples = [0, 0.1, 0.25, 0.4, 0.5, 0.66, 0.8, 1];
    const counts = samples.map(maturityToCapCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('MW-2: floors at MIN (3) for zero maturity and caps at MAX (20) for full maturity', () => {
    expect(maturityToCapCount(0)).toBe(3);
    expect(maturityToCapCount(1)).toBe(20);
    // Strictly higher influence at full vs zero maturity (documented threshold behavior).
    expect(maturityToCapCount(1)).toBeGreaterThan(maturityToCapCount(0));
  });

  it('MW-3: clamps out-of-range / non-numeric inputs to the floor or cap', () => {
    expect(maturityToCapCount(-5)).toBe(3);
    expect(maturityToCapCount(2)).toBe(20);
    expect(maturityToCapCount(NaN)).toBe(3);
    expect(maturityToCapCount(undefined)).toBe(3);
  });
});

describe('computePortfolioMaturity — fail-soft (no DB)', () => {
  it('MW-4: returns full weight (maturityScore=1) when no supabase client is provided', async () => {
    const m = await computePortfolioMaturity(null);
    expect(m.maturityScore).toBe(1);
    expect(m.productionGradeCount).toBe(0);
    expect(m.reuseVolume).toBe(0);
    expect(m.ventureCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB INTEGRATION — skipped when no real DB
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_REAL_DB)('maturity-weighted anchoring — DB integration', () => {
  const supabase = createSupabaseServiceClient();

  it('MW-5: computes a low, well-typed maturity signal from the (immature) live portfolio', async () => {
    const m = await computePortfolioMaturity(supabase);
    expect(typeof m.maturityScore).toBe('number');
    expect(m.maturityScore).toBeGreaterThanOrEqual(0);
    expect(m.maturityScore).toBeLessThanOrEqual(1);
    // Portfolio is immature today → below the EXPLOIT band.
    expect(m.maturityScore).toBeLessThan(0.66);
    expect(Number.isInteger(m.productionGradeCount)).toBe(true);
    expect(Number.isInteger(m.ventureCount)).toBe(true);
    // reuse_count=0 / empty capability_reuse_log is a VALID low signal, not an error.
    expect(m.reuseVolume).toBeGreaterThanOrEqual(0);
  });

  it('MW-6: capability block draws from v_unified_capabilities with NO undefined-column regression', async () => {
    const block = await getCapabilityContextBlock(supabase, 'capability_overhang', 1);
    expect(typeof block).toBe('string');
    expect(block.length).toBeGreaterThan(0);
    // FR-3 column-contract guard: the remap must not leak `undefined` into any formatter cell.
    expect(block).not.toContain('undefined');
  });

  it('MW-7: applies the exploratory preamble at immaturity and omits it at full maturity', async () => {
    const low = await getCapabilityContextBlock(supabase, 'capability_overhang', 0.05);
    const high = await getCapabilityContextBlock(supabase, 'capability_overhang', 1);
    expect(low).toContain('WEAK prior');       // EXPLORATORY_PREAMBLE present below threshold
    expect(high).not.toContain('WEAK prior');   // full strength above threshold
    expect(low).not.toContain('undefined');
    expect(high).not.toContain('undefined');
  });

  it('MW-8: surfaces more capabilities at higher maturity (monotonic influence on the block)', async () => {
    const low = await getCapabilityContextBlock(supabase, 'capability_overhang', 0.05);
    const high = await getCapabilityContextBlock(supabase, 'capability_overhang', 1);
    expect(countCapabilityLines(high)).toBeGreaterThanOrEqual(countCapabilityLines(low));
  });

  it('MW-9: simple_venture remains de-anchored (empty block) regardless of maturity', async () => {
    const block = await getCapabilityContextBlock(supabase, 'simple_venture', 0.5);
    expect(block).toBe('');
  });

  it('MW-10: self-computes maturity (fail-soft) when no maturityScore is passed', async () => {
    const block = await getCapabilityContextBlock(supabase, 'trend_scanner');
    expect(typeof block).toBe('string'); // computes internally; does not throw
  });
});
