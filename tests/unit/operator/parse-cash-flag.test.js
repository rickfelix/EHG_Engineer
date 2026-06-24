// SD-EHG-PRODUCT-OPERATOR-CASH-ATTEST-DTB-LIVE-001 (FR-1) — pure parser for the chairman-attested
// --cash flag. No DB. An attestation must be intentional + honest: never a silent 0.
import { describe, it, expect } from 'vitest';
import { parseCashFlag } from '../../../scripts/operator/feed-operator-cash-burn.mjs';

describe('parseCashFlag', () => {
  it('parses `--cash <usd>` and `--cash=<usd>`', () => {
    expect(parseCashFlag(['node', 'feed.mjs', '--cash', '12345.67'])).toBe(12345.67);
    expect(parseCashFlag(['node', 'feed.mjs', '--cash=9999'])).toBe(9999);
  });

  it('returns null when the flag is absent', () => {
    expect(parseCashFlag(['node', 'feed.mjs'])).toBeNull();
    expect(parseCashFlag(['node', 'feed.mjs', '--dry-run'])).toBeNull();
  });

  it('accepts 0 as a valid floor', () => {
    expect(parseCashFlag(['node', 'feed.mjs', '--cash', '0'])).toBe(0);
  });

  it('coexists with --dry-run', () => {
    expect(parseCashFlag(['node', 'feed.mjs', '--cash', '5000', '--dry-run'])).toBe(5000);
    expect(parseCashFlag(['node', 'feed.mjs', '--dry-run', '--cash=5000'])).toBe(5000);
  });

  it('THROWS when present but missing a value (never coerce to 0)', () => {
    expect(() => parseCashFlag(['node', 'feed.mjs', '--cash'])).toThrow(/requires a USD value/i);
  });

  it('THROWS on a non-numeric / negative / non-finite value', () => {
    expect(() => parseCashFlag(['node', 'feed.mjs', '--cash', 'abc'])).toThrow(/finite number/i);
    expect(() => parseCashFlag(['node', 'feed.mjs', '--cash', '-5'])).toThrow(/>= 0|finite number/i);
    expect(() => parseCashFlag(['node', 'feed.mjs', '--cash', 'Infinity'])).toThrow(/finite number/i);
  });
});
