/**
 * Tests for the additive portfolio-strategy sub-loader.
 * SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A
 */
import { describe, test, expect, vi } from 'vitest';
import { loadStrategicContext, PORTFOLIO_STRATEGY_VISION_KEY } from '../strategic-context-loader.js';

// Minimal table-aware mock supabase client. Every table other than
// eva_vision_documents returns an empty/null fail-soft shape so each sub-loader
// resolves quickly without asserting on tables outside this test's concern.
function mockSupabase({ portfolioStrategyRow = null, portfolioStrategyError = null } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'eva_vision_documents') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: portfolioStrategyRow, error: portfolioStrategyError })),
              })),
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [], error: null })),
                })),
              })),
            })),
          })),
        };
      }
      // missions / key_results / strategic_themes / anything else: empty fail-soft shape
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => ({ limit: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: { message: 'no rows' } })) })) })),
          limit: vi.fn(async () => ({ data: [], error: null })),
          lt: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
        })),
      };
    }),
  };
}

describe('loadStrategicContext — portfolio strategy sub-loader', () => {
  test('PORTFOLIO_STRATEGY_VISION_KEY is a distinct, exported constant', () => {
    expect(PORTFOLIO_STRATEGY_VISION_KEY).toBe('VISION-PORTFOLIO-STRATEGY-001');
  });

  test('when the row is active, raw.portfolioStrategy is populated and included in the formatted prompt block', async () => {
    const row = { vision_key: PORTFOLIO_STRATEGY_VISION_KEY, content: 'CHAINING THESIS: anchor-customer pattern...', extracted_dimensions: ['chaining', 'capital-allocation'] };
    const supabase = mockSupabase({ portfolioStrategyRow: row });

    const result = await loadStrategicContext(supabase);

    expect(result.raw.portfolioStrategy).toEqual(row);
    expect(result.isEmpty).toBe(false);
    expect(result.formattedPromptBlock).toContain('PORTFOLIO STRATEGY');
    expect(result.formattedPromptBlock).toContain('CHAINING THESIS');
  });

  test('when no active row exists and no other signal is present, isEmpty stays true', async () => {
    const supabase = mockSupabase({ portfolioStrategyRow: null });

    const result = await loadStrategicContext(supabase);

    expect(result.raw.portfolioStrategy).toBeNull();
    expect(result.isEmpty).toBe(true);
  });

  test('portfolioStrategy alone (no mission/vision/okr/themes) is sufficient to make isEmpty=false — it must never be silently dropped', async () => {
    const row = { vision_key: PORTFOLIO_STRATEGY_VISION_KEY, content: 'CHAINING THESIS: anchor-customer pattern...', extracted_dimensions: ['chaining'] };
    const supabase = mockSupabase({ portfolioStrategyRow: row });

    const result = await loadStrategicContext(supabase);

    expect(result.isEmpty).toBe(false);
    expect(result.formattedPromptBlock).toContain('PORTFOLIO STRATEGY');
  });

  test('a query error is swallowed fail-soft (never throws), returns null', async () => {
    const supabase = mockSupabase({ portfolioStrategyError: { message: 'boom' } });

    await expect(loadStrategicContext(supabase)).resolves.not.toThrow();
    const result = await loadStrategicContext(supabase);
    expect(result.raw.portfolioStrategy).toBeNull();
  });

  test('queries by exact vision_key and status=active (never "the active L1 row")', async () => {
    const eqVisionKey = vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
    }));
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'eva_vision_documents') {
          return { select: vi.fn(() => ({ eq: eqVisionKey, in: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })) })) })) };
        }
        return { select: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: { message: 'no rows' } })) })) })), limit: vi.fn(async () => ({ data: [], error: null })), lt: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })) })) };
      }),
    };

    await loadStrategicContext(supabase);

    expect(eqVisionKey).toHaveBeenCalledWith('vision_key', PORTFOLIO_STRATEGY_VISION_KEY);
  });
});
