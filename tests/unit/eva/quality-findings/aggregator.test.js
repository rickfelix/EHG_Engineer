/**
 * Vitest coverage for the cross-venture aggregator (SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-F).
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateFindings,
  upsertPatterns,
  computePatternId,
  SUGGESTED_ACTIONS,
  MIN_VENTURE_COUNT,
} from '../../../../lib/eva/quality-findings/aggregator.js';

const baseFinding = (overrides = {}) => ({
  id: `00000000-0000-0000-0000-${Math.random().toString().slice(2, 14).padStart(12, '0')}`,
  venture_id: 'venture-1',
  finding_category: 'npm_audit',
  severity: 'high',
  check_name: 'cve-2024-12345',
  created_at: '2026-04-29T10:00:00Z',
  status: 'open',
  ...overrides,
});

describe('aggregateFindings', () => {
  it('emits one pattern when 3 ventures share finding (TS-1, US-001 AC)', () => {
    const findings = [
      baseFinding({ venture_id: 'v1', id: '11111111-1111-1111-1111-111111111111' }),
      baseFinding({ venture_id: 'v2', id: '22222222-2222-2222-2222-222222222222' }),
      baseFinding({ venture_id: 'v3', id: '33333333-3333-3333-3333-333333333333' }),
    ];
    const patterns = aggregateFindings(findings);
    expect(patterns.length).toBe(1);
    expect(patterns[0].venture_count).toBe(3);
    expect(patterns[0].finding_category).toBe('npm_audit');
    expect(patterns[0].severity).toBe('high');
    expect(patterns[0].check_name).toBe('cve-2024-12345');
    expect(patterns[0].sample_finding_ids.length).toBe(3);
  });

  it('excludes single-venture findings (TS-2)', () => {
    const findings = [
      baseFinding({ venture_id: 'v1' }),
      baseFinding({ venture_id: 'v2' }),
    ];
    const patterns = aggregateFindings(findings);
    expect(patterns.length).toBe(0);
  });

  it('separates patterns by severity (TS-3, US-004)', () => {
    const findings = [
      baseFinding({ venture_id: 'v1', severity: 'high' }),
      baseFinding({ venture_id: 'v2', severity: 'high' }),
      baseFinding({ venture_id: 'v3', severity: 'high' }),
      baseFinding({ venture_id: 'v4', severity: 'medium' }),
      baseFinding({ venture_id: 'v5', severity: 'medium' }),
      baseFinding({ venture_id: 'v6', severity: 'medium' }),
    ];
    const patterns = aggregateFindings(findings);
    expect(patterns.length).toBe(2);
    const severities = patterns.map((p) => p.severity).sort();
    expect(severities).toEqual(['high', 'medium']);
  });

  it('respects custom minVentureCount option', () => {
    const findings = [
      baseFinding({ venture_id: 'v1' }),
      baseFinding({ venture_id: 'v2' }),
    ];
    const patterns = aggregateFindings(findings, { minVentureCount: 2 });
    expect(patterns.length).toBe(1);
  });

  it('caps sample_finding_ids at 5 (US-001 implementation detail)', () => {
    const findings = Array.from({ length: 10 }, (_, i) =>
      baseFinding({ venture_id: `v${i}`, id: `${i.toString().padStart(8, '0')}-0000-0000-0000-000000000000` })
    );
    const patterns = aggregateFindings(findings);
    expect(patterns[0].sample_finding_ids.length).toBe(5);
  });

  it('tracks first_seen and last_seen across all findings in a pattern', () => {
    const findings = [
      baseFinding({ venture_id: 'v1', created_at: '2026-04-29T10:00:00Z' }),
      baseFinding({ venture_id: 'v2', created_at: '2026-04-29T08:00:00Z' }), // earliest
      baseFinding({ venture_id: 'v3', created_at: '2026-04-29T12:00:00Z' }), // latest
    ];
    const patterns = aggregateFindings(findings);
    expect(patterns[0].first_seen).toBe('2026-04-29T08:00:00Z');
    expect(patterns[0].last_seen).toBe('2026-04-29T12:00:00Z');
  });

  it('substitutes {check_name} and {venture_count} in suggested_action (US-005 AC-5)', () => {
    const findings = [
      baseFinding({ venture_id: 'v1', check_name: 'cve-2024-99999' }),
      baseFinding({ venture_id: 'v2', check_name: 'cve-2024-99999' }),
      baseFinding({ venture_id: 'v3', check_name: 'cve-2024-99999' }),
    ];
    const patterns = aggregateFindings(findings);
    expect(patterns[0].suggested_action).toContain('cve-2024-99999');
    expect(patterns[0].suggested_action).toContain('3');
  });

  it('skips findings with unknown finding_category', () => {
    const findings = [
      baseFinding({ finding_category: 'invalid_category', venture_id: 'v1' }),
      baseFinding({ finding_category: 'invalid_category', venture_id: 'v2' }),
      baseFinding({ finding_category: 'invalid_category', venture_id: 'v3' }),
    ];
    const patterns = aggregateFindings(findings);
    expect(patterns.length).toBe(0);
  });
});

describe('computePatternId', () => {
  it('produces deterministic 16-char hash (US-002 AC, AC-4)', () => {
    const id1 = computePatternId('npm_audit', 'high', 'cve-2024-12345');
    const id2 = computePatternId('npm_audit', 'high', 'cve-2024-12345');
    expect(id1).toBe(id2);
    expect(id1.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(id1)).toBe(true);
  });

  it('different inputs produce different hashes', () => {
    const id1 = computePatternId('npm_audit', 'high', 'cve-1');
    const id2 = computePatternId('npm_audit', 'high', 'cve-2');
    const id3 = computePatternId('npm_audit', 'medium', 'cve-1');
    const id4 = computePatternId('lint', 'high', 'cve-1');
    expect(new Set([id1, id2, id3, id4]).size).toBe(4);
  });
});

describe('SUGGESTED_ACTIONS', () => {
  it('has non-empty templates for all 10 finding categories (AC-5)', () => {
    const expectedCategories = [
      'npm_audit', 'secrets', 'lint', 'test_suite', 'unit_test',
      'e2e_test', 'uat_test', 'bug_report', 'uat_signoff', 'capability',
    ];
    for (const cat of expectedCategories) {
      expect(SUGGESTED_ACTIONS[cat]).toBeDefined();
      expect(SUGGESTED_ACTIONS[cat].length).toBeGreaterThan(0);
    }
  });
});

describe('upsertPatterns', () => {
  it('returns zero counts when given empty array', async () => {
    const result = await upsertPatterns({}, []);
    expect(result).toEqual({ inserted: 0, updated: 0, errors: [] });
  });

  it('idempotency: re-runs preserve first_seen via lookup (TS-4, US-002 AC)', async () => {
    const upserts = [];
    const supabase = {
      from(table) {
        return {
          select: (cols) => ({
            eq: (col, val) => ({
              maybeSingle: () => Promise.resolve({
                data: { pattern_id: val, first_seen: '2026-04-01T00:00:00Z' },
                error: null,
              }),
            }),
          }),
          upsert: (row, opts) => {
            upserts.push({ table, row, opts });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    const patterns = [
      {
        pattern_id: 'abc123',
        finding_category: 'npm_audit',
        severity: 'high',
        check_name: 'cve-1',
        venture_count: 3,
        sample_finding_ids: [],
        first_seen: '2026-04-29T10:00:00Z', // newer
        last_seen: '2026-04-29T10:00:00Z',
        suggested_action: 'fix it',
        metadata: {},
      },
    ];
    const result = await upsertPatterns(supabase, patterns);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(upserts[0].row.first_seen).toBe('2026-04-01T00:00:00Z'); // preserved
  });

  it('counts new vs updated correctly', async () => {
    let callCount = 0;
    const supabase = {
      from(table) {
        return {
          select: (cols) => ({
            eq: (col, val) => ({
              maybeSingle: () => {
                callCount++;
                return Promise.resolve({
                  data: callCount === 1 ? null : { pattern_id: val, first_seen: '2026-04-01T00:00:00Z' },
                  error: null,
                });
              },
            }),
          }),
          upsert: (row, opts) => Promise.resolve({ error: null }),
        };
      },
    };
    const result = await upsertPatterns(supabase, [
      { pattern_id: 'new', first_seen: '2026-04-29T00:00:00Z', sample_finding_ids: [] },
      { pattern_id: 'existing', first_seen: '2026-04-29T00:00:00Z', sample_finding_ids: [] },
    ]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(1);
  });

  it('captures errors per-pattern without aborting batch', async () => {
    let callIdx = 0;
    const supabase = {
      from(table) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          upsert: (row) => {
            callIdx++;
            return Promise.resolve({
              error: callIdx === 2 ? { message: 'simulated error' } : null,
            });
          },
        };
      },
    };
    const result = await upsertPatterns(supabase, [
      { pattern_id: 'p1', sample_finding_ids: [] },
      { pattern_id: 'p2', sample_finding_ids: [] },
      { pattern_id: 'p3', sample_finding_ids: [] },
    ]);
    expect(result.inserted).toBe(3);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].pattern_id).toBe('p2');
  });
});

describe('MIN_VENTURE_COUNT export', () => {
  it('default threshold is 3', () => {
    expect(MIN_VENTURE_COUNT).toBe(3);
  });
});
