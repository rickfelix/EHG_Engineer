/**
 * Unit tests for parseRevenuePotential helper (FR-2, AC-6, TS-6).
 * Asserts the helper handles >=8 documented LLM revenue input forms.
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001 Checkpoint 2 / US-006.
 */

import { describe, test, expect } from 'vitest';
import { parseRevenuePotential } from '../../../../../lib/eva/stage-zero/utils/parse-revenue.js';

describe('parseRevenuePotential — documented input forms (AC-6)', () => {
  const cases = [
    { input: '$5K/month',          expected: { low: 5000,    high: 5000,    currency: 'USD' } },
    { input: '$5,000-$50,000/mo',  expected: { low: 5000,    high: 50000,   currency: 'USD' } },
    { input: '$1K+/month',         expected: { low: 1000,    high: 1000,    currency: 'USD' } },
    { input: '$500-$2000 monthly', expected: { low: 500,     high: 2000,    currency: 'USD' } },
    { input: '~$10K MRR',          expected: { low: 10000,   high: 10000,   currency: 'USD' } },
    { input: '$2K+',               expected: { low: 2000,    high: 2000,    currency: 'USD' } },
    { input: '$60K/year',          expected: { low: 5000,    high: 5000,    currency: 'USD' } },
    { input: '$10M/year',          expected: { low: 833333,  high: 833333,  currency: 'USD' } },
  ];

  test.each(cases)('parses "$input" → low/high', ({ input, expected }) => {
    const result = parseRevenuePotential(input);
    expect(result).toEqual(expected);
  });

  test('covers at least 8 documented input forms', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });
});

describe('parseRevenuePotential — null fallback (no throws)', () => {
  test.each([
    'unknown',
    '',
    '   ',
    'TBD',
    'see attached',
    null,
    undefined,
    42, // non-string
    {},
    [],
  ])('returns null for unparseable input %p', (input) => {
    expect(parseRevenuePotential(input)).toBeNull();
  });

  test('does not throw on weird unicode', () => {
    expect(() => parseRevenuePotential('💰 $5K')).not.toThrow();
    // The regex still extracts $5K → 5000
    expect(parseRevenuePotential('💰 $5K')).toEqual({ low: 5000, high: 5000, currency: 'USD' });
  });
});

describe('parseRevenuePotential — yearly normalization', () => {
  test('yearly is divided by 12', () => {
    expect(parseRevenuePotential('$120K/year')).toEqual({ low: 10000, high: 10000, currency: 'USD' });
  });

  test('annual is divided by 12', () => {
    expect(parseRevenuePotential('$60K annually')).toEqual({ low: 5000, high: 5000, currency: 'USD' });
  });

  test('p.a. is treated as yearly', () => {
    expect(parseRevenuePotential('$24K p.a.')).toEqual({ low: 2000, high: 2000, currency: 'USD' });
  });

  test('default is monthly when ambiguous', () => {
    expect(parseRevenuePotential('$10K')).toEqual({ low: 10000, high: 10000, currency: 'USD' });
  });
});

describe('parseRevenuePotential — range detection', () => {
  test('hyphen-separated range', () => {
    expect(parseRevenuePotential('$1K-$5K')).toEqual({ low: 1000, high: 5000, currency: 'USD' });
  });

  test('"to" separated range', () => {
    expect(parseRevenuePotential('$1,000 to $5,000')).toEqual({ low: 1000, high: 5000, currency: 'USD' });
  });

  test('comma-numeric ranges parsed correctly', () => {
    expect(parseRevenuePotential('$5,000-$50,000/mo')).toEqual({ low: 5000, high: 50000, currency: 'USD' });
  });

  test('decimal shorthand: $5.5K', () => {
    expect(parseRevenuePotential('$5.5K/month')).toEqual({ low: 5500, high: 5500, currency: 'USD' });
  });

  test('billion shorthand: $2B/year', () => {
    expect(parseRevenuePotential('$2B/year')).toEqual({ low: 166666667, high: 166666667, currency: 'USD' });
  });
});
