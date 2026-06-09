/**
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001 — CLI pure helpers (DB-free).
 * Mixed ESM-test / CJS-require, like scripts/adam-advisory.test.js.
 */
import { describe, it, expect } from 'vitest';
const { isFlagEnabled, parseArgs, buildLedgerEntry, usage } = require('./adam-opportunity-scan.cjs');

describe('isFlagEnabled (ADAM_GOVERNANCE_HEARTBEAT_V1)', () => {
  it('is OFF for undefined / off / garbage', () => {
    expect(isFlagEnabled({})).toBe(false);
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: 'off' })).toBe(false);
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: 'maybe' })).toBe(false);
  });
  it('is ON only for on / 1 / true', () => {
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: 'on' })).toBe(true);
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: '1' })).toBe(true);
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: 'TRUE' })).toBe(true);
  });
});

describe('parseArgs', () => {
  it('parses subcommand, scope, and tick', () => {
    expect(parseArgs(['--scan', '--scope', 'venture:abc', '--tick', '3'])).toEqual({ mode: 'scan', scope: 'venture:abc', tick: 3 });
    expect(parseArgs(['--briefing'])).toEqual({ mode: 'briefing', scope: 'auto', tick: 0 });
    expect(parseArgs(['--ledger'])).toEqual({ mode: 'ledger', scope: 'auto', tick: 0 });
  });
  it('returns mode=null when no subcommand flag is present', () => {
    expect(parseArgs([]).mode).toBeNull();
    expect(parseArgs(['--scope', 'harness']).mode).toBeNull();
  });
});

describe('buildLedgerEntry', () => {
  it('records scope, verdict and flag state with a timestamp', () => {
    const e = buildLedgerEntry({ scope: { scope_key: 'harness' }, verdict: 'ADAM_OK', cleared: 0, flagEnabled: false });
    expect(e).toMatchObject({ scope: 'harness', verdict: 'ADAM_OK', cleared: 0, flag: 'off' });
    expect(typeof e.ts).toBe('string');
  });
  it('marks the flag on when enabled', () => {
    const e = buildLedgerEntry({ scope: { scope_key: 'platform' }, verdict: 'SURFACED', cleared: 1, flagEnabled: true });
    expect(e.flag).toBe('on');
  });
});

describe('usage', () => {
  it('describes the three subcommands', () => {
    const u = usage();
    expect(u).toMatch(/--briefing/);
    expect(u).toMatch(/--scan/);
    expect(u).toMatch(/--ledger/);
  });
});
