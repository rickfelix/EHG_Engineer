/**
 * PAT-LES-b991f4c09c40 (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-148): getVisionGapInsights() used
 * .order('severity', {ascending: true}), which sorts the raw string column alphabetically
 * (critical, high, low, medium) — putting 'low' ahead of 'medium', the wrong urgency order.
 * The fix overfetches unordered and ranks severity in JS instead.
 */
import { describe, it, expect, vi } from 'vitest';

// db-queries.js has no named export line for getVisionGapInsights isolated from the rest of the
// module's DB-touching exports, so import the whole module and call it directly (mirrors how the
// module's own default export list already exposes it).
import * as dbQueries from '../../../../../scripts/modules/claude-md-generator/db-queries.js';

function fluentSupabaseReturning(rows, error = null) {
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    like: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: rows, error })),
  };
  return chain;
}

describe('getVisionGapInsights — severity ranking (PAT-LES-b991f4c09c40)', () => {
  it('ranks critical before high before medium before low, not alphabetically', async () => {
    const rows = [
      { pattern_id: 'VGAP-1', issue_summary: 'a', category: 'x', severity: 'low' },
      { pattern_id: 'VGAP-2', issue_summary: 'b', category: 'x', severity: 'critical' },
      { pattern_id: 'VGAP-3', issue_summary: 'c', category: 'x', severity: 'medium' },
      { pattern_id: 'VGAP-4', issue_summary: 'd', category: 'x', severity: 'high' },
    ];
    const supabase = fluentSupabaseReturning(rows);

    const result = await dbQueries.getVisionGapInsights(supabase, 4);

    expect(result.map((r) => r.severity)).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('respects the limit after ranking, not before (top-N by true severity, not by fetch order)', async () => {
    const rows = [
      { pattern_id: 'VGAP-1', issue_summary: 'a', category: 'x', severity: 'medium' },
      { pattern_id: 'VGAP-2', issue_summary: 'b', category: 'x', severity: 'low' },
      { pattern_id: 'VGAP-3', issue_summary: 'c', category: 'x', severity: 'critical' },
    ];
    const supabase = fluentSupabaseReturning(rows);

    const result = await dbQueries.getVisionGapInsights(supabase, 1);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('critical');
  });

  it('returns [] on a query error (fail-open, unchanged behavior)', async () => {
    const supabase = fluentSupabaseReturning(null, new Error('boom'));
    const result = await dbQueries.getVisionGapInsights(supabase, 3);
    expect(result).toEqual([]);
  });

  it('an unrecognized severity value sorts last, never throws', async () => {
    const rows = [
      { pattern_id: 'VGAP-1', issue_summary: 'a', category: 'x', severity: 'unknown_future_value' },
      { pattern_id: 'VGAP-2', issue_summary: 'b', category: 'x', severity: 'critical' },
    ];
    const supabase = fluentSupabaseReturning(rows);

    const result = await dbQueries.getVisionGapInsights(supabase, 2);

    expect(result.map((r) => r.severity)).toEqual(['critical', 'unknown_future_value']);
  });
});
