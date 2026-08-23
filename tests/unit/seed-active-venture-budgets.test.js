/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-1.
 * TS-1: seed covers active ventures only (88 of 152, excluding 62 cancelled + 2 paused).
 * TS-2/TS-12: seeded-then-exhausted still halts; seeded-adequate does not halt — covered
 * directly at tests/unit/budget-check.test.js (no pre-existing test covered this before this
 * SD; a prior version of this comment claimed otherwise and was corrected). This file tests
 * the SEEDING decision/shape only.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  selectActiveVentureIds,
  buildTokenBudgetRows,
  buildPhaseBudgetRows,
  seedActiveVentureBudgets,
  DEFAULT_PHASE_NAME
} from '../../lib/governance/seed-active-venture-budgets.js';
import { createSupabaseChainMock } from '../helpers/supabase-chain-mock.js';

const SAMPLE_VENTURES = [
  { id: 'v-active-1', status: 'active' },
  { id: 'v-active-2', status: 'active' },
  { id: 'v-cancelled-1', status: 'cancelled' },
  { id: 'v-paused-1', status: 'paused' }
];

describe('selectActiveVentureIds — TS-1: active ventures only', () => {
  it('returns only ids of active ventures', () => {
    expect(selectActiveVentureIds(SAMPLE_VENTURES)).toEqual(['v-active-1', 'v-active-2']);
  });

  it('excludes cancelled and paused ventures', () => {
    const ids = selectActiveVentureIds(SAMPLE_VENTURES);
    expect(ids).not.toContain('v-cancelled-1');
    expect(ids).not.toContain('v-paused-1');
  });

  it('handles empty/null input safely', () => {
    expect(selectActiveVentureIds([])).toEqual([]);
    expect(selectActiveVentureIds(null)).toEqual([]);
    expect(selectActiveVentureIds(undefined)).toEqual([]);
  });

  it('skips malformed entries rather than crashing', () => {
    expect(selectActiveVentureIds([null, undefined, { id: 'v-1', status: 'active' }])).toEqual(['v-1']);
  });
});

describe('buildTokenBudgetRows / buildPhaseBudgetRows', () => {
  it('produces one venture_token_budgets row per active venture, relying on column DEFAULTs', () => {
    const rows = buildTokenBudgetRows(['v-1', 'v-2']);
    expect(rows).toEqual([{ venture_id: 'v-1' }, { venture_id: 'v-2' }]);
  });

  it('produces one venture_phase_budgets row per active venture with the default phase name', () => {
    const rows = buildPhaseBudgetRows(['v-1', 'v-2']);
    expect(rows).toEqual([
      { venture_id: 'v-1', phase_name: DEFAULT_PHASE_NAME },
      { venture_id: 'v-2', phase_name: DEFAULT_PHASE_NAME }
    ]);
  });

  it('accepts a custom phase name override', () => {
    const rows = buildPhaseBudgetRows(['v-1'], 'CUSTOM_PHASE');
    expect(rows).toEqual([{ venture_id: 'v-1', phase_name: 'CUSTOM_PHASE' }]);
  });
});

describe('seedActiveVentureBudgets — end-to-end wiring, idempotent upsert', () => {
  it('seeds exactly the active ventures, using upsert (not insert) on both tables', async () => {
    const chain = createSupabaseChainMock({ result: { data: null, error: null } });
    chain.from = vi.fn((table) => {
      if (table === 'ventures') {
        return { select: vi.fn(() => Promise.resolve({ data: SAMPLE_VENTURES, error: null })) };
      }
      return chain;
    });

    const result = await seedActiveVentureBudgets(chain);

    expect(result.activeVentureCount).toBe(2);
    expect(result.tokenBudgetsUpserted).toBe(2);
    expect(result.phaseBudgetsUpserted).toBe(2);
    expect(chain.upsert).toHaveBeenCalledWith(
      [{ venture_id: 'v-active-1' }, { venture_id: 'v-active-2' }],
      { onConflict: 'venture_id' }
    );
    expect(chain.upsert).toHaveBeenCalledWith(
      [
        { venture_id: 'v-active-1', phase_name: DEFAULT_PHASE_NAME },
        { venture_id: 'v-active-2', phase_name: DEFAULT_PHASE_NAME }
      ],
      { onConflict: 'venture_id,phase_name' }
    );
  });

  it('throws (does not silently swallow) when the ventures read errors', async () => {
    const chain = createSupabaseChainMock();
    chain.from = vi.fn((table) => {
      if (table === 'ventures') {
        return { select: vi.fn(() => Promise.resolve({ data: null, error: { message: 'db down' } })) };
      }
      return chain;
    });

    await expect(seedActiveVentureBudgets(chain)).rejects.toThrow(/Failed to read ventures/);
  });

  it('throws when the token budget upsert errors', async () => {
    const chain = createSupabaseChainMock({ result: { data: null, error: { message: 'upsert failed' } } });
    chain.from = vi.fn((table) => {
      if (table === 'ventures') {
        return { select: vi.fn(() => Promise.resolve({ data: SAMPLE_VENTURES, error: null })) };
      }
      return chain;
    });

    await expect(seedActiveVentureBudgets(chain)).rejects.toThrow(/Failed to upsert venture_token_budgets/);
  });
});
