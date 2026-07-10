/**
 * Unit Tests: Portfolio-Aware Evaluation Synthesis Component (Component 2)
 * SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (H6, Delta-ledger 41a2e6da)
 *
 * Test Coverage:
 * - Genuinely empty portfolio (0 rows, no error): legitimate "first venture" score
 * - DB outage (query error): marked _failed, below-neutral score, distinct from empty
 */

import { describe, test, expect, vi } from 'vitest';
import { evaluatePortfolioFit } from '../../../../../lib/eva/stage-zero/synthesis/portfolio-evaluation.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

const pathOutput = {
  suggested_name: 'TestVenture',
  suggested_problem: 'Test problem',
  suggested_solution: 'Test solution',
  target_market: 'SMBs',
};

function makeSupabase({ data, error }) {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data, error }),
          }),
        }),
      }),
    }),
  };
}

describe('evaluatePortfolioFit — outage vs empty (H6)', () => {
  test('a genuinely empty portfolio (0 rows, no error) scores 70 with the "first venture" narrative', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const result = await evaluatePortfolioFit(pathOutput, { supabase, logger: silentLogger });

    expect(result.composite_score).toBe(70);
    expect(result.portfolio_size).toBe(0);
    expect(result.recommendation).toBe('proceed');
    expect(result._failed).toBeUndefined();
  });

  test('a DB outage (query error) is marked _failed with a below-neutral score, NOT the "first venture" narrative', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'connection refused' } });
    const result = await evaluatePortfolioFit(pathOutput, { supabase, logger: silentLogger });

    expect(result._failed).toBe(true);
    expect(result.composite_score).toBeLessThan(50);
    expect(result.portfolio_size).toBeNull();
    expect(result.recommendation).not.toBe('proceed');
    expect(result.summary).toMatch(/outage/i);
  });

  test('throws if no supabase client is provided', async () => {
    await expect(evaluatePortfolioFit(pathOutput, { logger: silentLogger })).rejects.toThrow('supabase client is required');
  });
});
