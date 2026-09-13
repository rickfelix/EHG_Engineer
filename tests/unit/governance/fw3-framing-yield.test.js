/**
 * QF-20260912-514 (FIX SHAPE c) — lib/governance/fw3-framing-yield.cjs: tallies the
 * trailing-window sender framing behavior (stamped instrument / stamped pick /
 * unclassified) so the router's retirement rule has a number to read.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { tallyFramingYield, formatFramingYieldLine } = require('../../../lib/governance/fw3-framing-yield.cjs');

const oracleRow = (framing) => ({ payload: { oracle: true, ...(framing !== undefined ? { framing_class: framing } : {}) } });

describe('tallyFramingYield', () => {
  it('tallies instrument, pick, and unclassified (missing/garbage framing_class) independently', () => {
    const rows = [
      oracleRow('instrument'), oracleRow('instrument'),
      oracleRow('pick'),
      oracleRow(undefined), oracleRow('garbage'), oracleRow(null),
    ];
    expect(tallyFramingYield(rows)).toEqual({ instrument: 2, pick: 1, unclassified: 3 });
  });

  it('excludes non-oracle rows entirely (out of domain, not counted as unclassified)', () => {
    const rows = [{ payload: { oracle: false, framing_class: 'pick' } }, { payload: {} }, {}];
    expect(tallyFramingYield(rows)).toEqual({ instrument: 0, pick: 0, unclassified: 0 });
  });

  it('handles an empty/undefined row set', () => {
    expect(tallyFramingYield([])).toEqual({ instrument: 0, pick: 0, unclassified: 0 });
    expect(tallyFramingYield(undefined)).toEqual({ instrument: 0, pick: 0, unclassified: 0 });
  });
});

describe('formatFramingYieldLine', () => {
  it('formats the trailing-7-day yield line', () => {
    const line = formatFramingYieldLine({ instrument: 4, pick: 1, unclassified: 12 });
    expect(line).toBe('[framing-router-yield] trailing 7d: stamped instrument 4 / stamped pick 1 / unclassified 12');
  });

  it('honors a custom days window', () => {
    expect(formatFramingYieldLine({ instrument: 0, pick: 0, unclassified: 0 }, { days: 30 })).toMatch(/trailing 30d/);
  });
});
