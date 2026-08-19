/**
 * QF-20260818-343: gemini-3.7-flash pricing. Before this fix, priceFor()'s generic
 * 'gemini'+'flash' fallback silently mispriced every gemini-3.7-flash usage row at the
 * gemini-2.5-flash rate (2.5x too cheap) -- the cost governor would have lied to itself
 * the moment the model swap in model-config.js landed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PRICING, priceFor, rowCost, GEMINI_3_7_FLASH_STEPPED } from '../../../lib/cost/llm-pricing.js';

describe('QF-20260818-343: priceFor gemini-3.7-flash', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves to the 3.7-flash intro rate, NOT the 2.5-flash fallback', () => {
    const p = priceFor('gemini-3.7-flash');
    expect(p).toEqual(PRICING['gemini-3.7-flash']);
    expect(p).not.toEqual(PRICING['gemini-2.5-flash']);
    expect(p.in).toBe(0.75);
    expect(p.out).toBe(3.75);
  });

  it('a reported model string with extra qualifiers still resolves to 3.7, not the generic flash bucket', () => {
    expect(priceFor('gemini-3.7-flash-002')).toEqual(PRICING['gemini-3.7-flash']);
  });

  it('gemini-2.5-flash is unaffected by the new branch (still the original rate)', () => {
    expect(priceFor('gemini-2.5-flash')).toEqual({ in: 0.30, out: 2.50 });
  });

  it('switches to the stepped rate on/after 2027-01-01', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    expect(priceFor('gemini-3.7-flash')).toEqual(GEMINI_3_7_FLASH_STEPPED);
  });

  it('stays on the intro rate one second before the step', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:59:59.000Z'));
    expect(priceFor('gemini-3.7-flash')).toEqual(PRICING['gemini-3.7-flash']);
  });

  it('rowCost computes the correct estimate for a gemini-3.7-flash usage row', () => {
    const r = rowCost({
      reported_model_name: 'gemini-3.7-flash',
      metadata: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });
    expect(r.known).toBe(true);
    expect(r.usd).toBeCloseTo(0.75 + 3.75, 6);
  });
});
