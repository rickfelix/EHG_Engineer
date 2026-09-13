/**
 * QF-20260912-366: computeVentureFlagshipVerdict is the re-measure logic the coordinator asked
 * for ("the venture_gate_last_verdict field has no re-measure writer"). These tests reproduce
 * BOTH the stale 2026-07-28 measurement (verdict NOT_MET, 0 qualifying of 2 with a URL) and the
 * current live state (verdict MET, 1 qualifying of 3 with a URL, AltifyAI active) to prove the
 * function tracks reality rather than being hardcoded to either answer.
 */
import { describe, it, expect } from 'vitest';
import { computeVentureFlagshipVerdict } from './venture-flagship-gate.js';

describe('computeVentureFlagshipVerdict', () => {
  it('NOT_MET: reproduces the stale 2026-07-28 measurement (2 URLs, both cancelled)', () => {
    const rows = [
      { name: 'CronGenius', status: 'cancelled', deployment_url: 'https://cron.example' },
      { name: 'MarketLens', status: 'cancelled', deployment_url: 'https://marketlens.example' },
    ];
    const result = computeVentureFlagshipVerdict(rows);
    expect(result.verdict).toBe('NOT_MET');
    expect(result.qualifyingCount).toBe(0);
    expect(result.totalCount).toBe(2);
  });

  it('MET: reproduces the current live state (AltifyAI active with a deployment_url)', () => {
    const rows = [
      { name: 'AltifyAI', status: 'active', deployment_url: 'https://altifyai.app' },
      { name: 'CronGenius', status: 'cancelled', deployment_url: 'https://cron.example' },
      { name: 'MarketLens', status: 'cancelled', deployment_url: 'https://marketlens.example' },
    ];
    const result = computeVentureFlagshipVerdict(rows);
    expect(result.verdict).toBe('MET');
    expect(result.qualifyingCount).toBe(1);
    expect(result.detail).toContain('AltifyAI');
  });

  it('a non-cancelled venture with no deployment_url does not qualify', () => {
    const rows = [{ name: 'NoUrlVenture', status: 'active', deployment_url: null }];
    expect(computeVentureFlagshipVerdict(rows).verdict).toBe('NOT_MET');
  });

  it('a non-cancelled venture with an empty-string deployment_url does not qualify', () => {
    const rows = [{ name: 'EmptyUrlVenture', status: 'active', deployment_url: '   ' }];
    expect(computeVentureFlagshipVerdict(rows).verdict).toBe('NOT_MET');
  });

  it('empty/missing input is NOT_MET, never a throw', () => {
    expect(computeVentureFlagshipVerdict([]).verdict).toBe('NOT_MET');
    expect(computeVentureFlagshipVerdict(undefined).verdict).toBe('NOT_MET');
  });
});
