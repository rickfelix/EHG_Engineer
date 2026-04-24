/**
 * Unit tests for CAPA-5 defense-in-depth filter in assist-engine.
 *
 * Covers:
 * - Triaged rows pass through (classification non-null)
 * - Fresh untriaged rows pass through (age < 1h grace)
 * - Stale untriaged rows are skipped (classification NULL AND age > 1h)
 *
 * SD: SD-LEO-INFRA-FEEDBACK-PIPELINE-HEALTH-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filterStaleUntriaged, STALE_UNTRIAGED_GRACE_MS } from '../../lib/quality/assist-engine.js';

const HOUR_MS = 60 * 60 * 1000;

function makeRow({ id, classification = null, ageMinutes = 0 }) {
  return {
    id,
    ai_triage_classification: classification,
    created_at: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
  };
}

describe('CAPA-5: filterStaleUntriaged', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('passes through triaged rows (classification non-null) regardless of age', () => {
    const rows = [
      makeRow({ id: 'r1', classification: 'bug', ageMinutes: 10 }),
      makeRow({ id: 'r2', classification: 'enhancement', ageMinutes: 500 }),
    ];
    const result = filterStaleUntriaged(rows);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(['r1', 'r2']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes through fresh untriaged rows within grace window (age < 1h)', () => {
    const rows = [
      makeRow({ id: 'fresh1', classification: null, ageMinutes: 5 }),
      makeRow({ id: 'fresh2', classification: null, ageMinutes: 45 }),
    ];
    const result = filterStaleUntriaged(rows);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(['fresh1', 'fresh2']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('skips stale-untriaged rows (classification NULL AND age > 1h) with warn log', () => {
    const rows = [
      makeRow({ id: 'stale1', classification: null, ageMinutes: 90 }),
      makeRow({ id: 'stale2', classification: null, ageMinutes: 180 }),
    ];
    const result = filterStaleUntriaged(rows);
    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    const loggedMessages = warnSpy.mock.calls.map(c => c[0]).join('\n');
    expect(loggedMessages).toContain('stale1');
    expect(loggedMessages).toContain('stale2');
    expect(loggedMessages).toContain('CAPA-5');
    expect(loggedMessages).toContain('classification=NULL');
  });

  it('handles mixed: triaged + fresh + stale correctly', () => {
    const rows = [
      makeRow({ id: 'triaged', classification: 'bug', ageMinutes: 200 }),
      makeRow({ id: 'fresh', classification: null, ageMinutes: 30 }),
      makeRow({ id: 'stale', classification: null, ageMinutes: 120 }),
    ];
    const result = filterStaleUntriaged(rows);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id).sort()).toEqual(['fresh', 'triaged']);
  });

  it('handles empty array and null/undefined input gracefully', () => {
    expect(filterStaleUntriaged([])).toEqual([]);
    expect(filterStaleUntriaged(null)).toEqual([]);
    expect(filterStaleUntriaged(undefined)).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('respects exact grace-window boundary', () => {
    // Row exactly at grace boundary: behavior is "fresh" because cutoff is
    // strictly-less-than. Row slightly past boundary is "stale".
    const graceMs = STALE_UNTRIAGED_GRACE_MS;
    expect(graceMs).toBe(HOUR_MS);
    const rows = [
      { id: 'edge_boundary', ai_triage_classification: null, created_at: new Date(Date.now() - graceMs + 1000).toISOString() },
      { id: 'edge_stale', ai_triage_classification: null, created_at: new Date(Date.now() - graceMs - 60_000).toISOString() },
    ];
    const result = filterStaleUntriaged(rows);
    const keptIds = result.map(r => r.id);
    expect(keptIds).toContain('edge_boundary');
    expect(keptIds).not.toContain('edge_stale');
  });
});
