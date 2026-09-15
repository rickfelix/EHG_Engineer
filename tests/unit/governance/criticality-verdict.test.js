/**
 * Unit tests for lib/governance/criticality-verdict.js
 *
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-1/FR-2/FR-3, TR-5)
 * Covers TS-1 through TS-5 (create-quick-fix.js + createSD() share this module).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveCriticalityVerdict,
  normalizeCriticality,
  routeCriticalityLater,
  CRITICALITY_CRITERIA,
} from '../../../lib/governance/criticality-verdict.js';

describe('normalizeCriticality', () => {
  it('accepts case-insensitive critical/later', () => {
    expect(normalizeCriticality('critical')).toBe('critical');
    expect(normalizeCriticality('Critical')).toBe('critical');
    expect(normalizeCriticality('LATER')).toBe('later');
    expect(normalizeCriticality('  later  ')).toBe('later');
  });

  it('returns null for missing/unrecognized values', () => {
    expect(normalizeCriticality(undefined)).toBeNull();
    expect(normalizeCriticality(null)).toBeNull();
    expect(normalizeCriticality('')).toBeNull();
    expect(normalizeCriticality('urgent')).toBeNull();
    expect(normalizeCriticality(123)).toBeNull();
  });
});

describe('resolveCriticalityVerdict — all 6 combinations (TS-1/TS-2/TS-3, TS-4 mirror)', () => {
  it('flagEnabled=false, criticality missing -> warn_and_file', () => {
    const v = resolveCriticalityVerdict({ criticality: undefined, flagEnabled: false });
    expect(v.verdict).toBe('warn_and_file');
    expect(v.message).toMatch(/would have REFUSED/);
  });

  it('flagEnabled=false, criticality="critical" -> file_critical', () => {
    const v = resolveCriticalityVerdict({ criticality: 'critical', flagEnabled: false });
    expect(v.verdict).toBe('file_critical');
  });

  it('flagEnabled=false, criticality="later" -> route_later', () => {
    const v = resolveCriticalityVerdict({ criticality: 'later', flagEnabled: false });
    expect(v.verdict).toBe('route_later');
  });

  it('flagEnabled=true, criticality missing -> refuse, names all four criteria verbatim', () => {
    const v = resolveCriticalityVerdict({ criticality: undefined, flagEnabled: true });
    expect(v.verdict).toBe('refuse');
    for (const criterion of CRITICALITY_CRITERIA) {
      expect(v.message).toContain(criterion);
    }
  });

  it('flagEnabled=true, criticality="critical" -> file_critical', () => {
    const v = resolveCriticalityVerdict({ criticality: 'critical', flagEnabled: true });
    expect(v.verdict).toBe('file_critical');
  });

  it('flagEnabled=true, criticality="later" -> route_later', () => {
    const v = resolveCriticalityVerdict({ criticality: 'later', flagEnabled: true });
    expect(v.verdict).toBe('route_later');
  });

  it('an unrecognized value is treated identically to missing (never defaults to critical)', () => {
    const withFlagOff = resolveCriticalityVerdict({ criticality: 'urgent', flagEnabled: false });
    expect(withFlagOff.verdict).toBe('warn_and_file');
    const withFlagOn = resolveCriticalityVerdict({ criticality: 'urgent', flagEnabled: true });
    expect(withFlagOn.verdict).toBe('refuse');
  });
});

describe('routeCriticalityLater (TS-5, FR-3)', () => {
  function buildSupabase({ existing = null, insertResult = { id: 'fb-later-1' } } = {}) {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
      })),
    }));
    const dedupSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
        })),
      })),
    }));
    return {
      from: vi.fn(() => ({ select: dedupSelect, insert })),
      _insert: insert,
    };
  }

  it('calls emitFeedback with category=harness_backlog exactly once, carrying title/description/reason', async () => {
    const supabase = buildSupabase();
    const result = await routeCriticalityLater({
      supabase,
      title: 'Some minor QF',
      description: 'Not critical right now',
      criticalityReason: 'low priority cleanup',
      loggedVia: 'create-quick-fix.js',
    });
    expect(result.id).toBe('fb-later-1');
    expect(supabase._insert).toHaveBeenCalledTimes(1);
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.category).toBe('harness_backlog');
    expect(insertCall.title).toBe('Some minor QF');
    expect(insertCall.metadata.criticality_reason).toBe('low priority cleanup');
    expect(insertCall.metadata.logged_via).toBe('create-quick-fix.js');
    expect(insertCall.metadata.deferred_from).toContain('Some minor QF');
  });

  it('prints where the item went, naming the feedback row id', async () => {
    const supabase = buildSupabase();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await routeCriticalityLater({ supabase, title: 'T', description: 'D', loggedVia: 'x' });
    expect(logSpy.mock.calls.some(([line]) => line.includes('routed to harness_backlog') && line.includes('fb-later-1'))).toBe(true);
    logSpy.mockRestore();
  });
});
