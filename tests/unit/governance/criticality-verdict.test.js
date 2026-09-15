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
      dedupKey: 'criticality-later::some-unique-identity',
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
    await routeCriticalityLater({ supabase, title: 'T', description: 'D', loggedVia: 'x', dedupKey: 'k1' });
    expect(logSpy.mock.calls.some(([line]) => line.includes('routed to harness_backlog') && line.includes('fb-later-1'))).toBe(true);
    logSpy.mockRestore();
  });

  it('prints a distinguishable "already routed / deduped" message when emitFeedback reports a dedup hit', async () => {
    const supabase = buildSupabase({ existing: { id: 'fb-existing-dup' } });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await routeCriticalityLater({ supabase, title: 'T', description: 'D', loggedVia: 'x', dedupKey: 'k1' });
    expect(result.deduped).toBe(true);
    expect(logSpy.mock.calls.some(([line]) => line.includes('deduped'))).toBe(true);
    logSpy.mockRestore();
  });

  // SECURITY SEC-3 (EXEC-TO-PLAN): without dedupKey, emitFeedback's dedup hash reduces to
  // sha256(today::description::""), so two DIFFERENT items filed the same day with an
  // identical description would collapse into one row -- the harness_backlog row is a
  // deferred item's ONLY record, so a collapse silently loses it. This proves dedupKey is
  // actually threaded into emitFeedback's dedup_key parameter (not merely accepted and
  // dropped) by asserting two calls with identical title/description but different dedupKey
  // produce different dedup hashes on the inserted row.
  it('two calls with identical title/description but different dedupKey never collapse into the same dedup hash (SEC-3)', async () => {
    const supabase1 = buildSupabase();
    await routeCriticalityLater({ supabase: supabase1, title: 'Same title', description: 'Same description', loggedVia: 'x', dedupKey: 'identity-A' });
    const hash1 = supabase1._insert.mock.calls[0][0].metadata.dedup_hash;

    const supabase2 = buildSupabase();
    await routeCriticalityLater({ supabase: supabase2, title: 'Same title', description: 'Same description', loggedVia: 'x', dedupKey: 'identity-B' });
    const hash2 = supabase2._insert.mock.calls[0][0].metadata.dedup_hash;

    expect(hash1).not.toBe(hash2);
  });

  // Third-party static review (worktree-reap incident, EXEC-TO-PLAN re-verification): the
  // module documented dedupKey as required but never enforced it -- an omitted/empty value
  // silently reintroduces the exact SEC-3 collapse with no signal. This is the shared
  // function's own defense so a future third caller cannot reintroduce it silently.
  it('throws when dedupKey is omitted, null, or blank -- never silently falls back to no dedup identity', async () => {
    const supabase = buildSupabase();
    await expect(routeCriticalityLater({ supabase, title: 'T', description: 'D', loggedVia: 'x' }))
      .rejects.toThrow(/dedupKey is required/);
    await expect(routeCriticalityLater({ supabase, title: 'T', description: 'D', loggedVia: 'x', dedupKey: null }))
      .rejects.toThrow(/dedupKey is required/);
    await expect(routeCriticalityLater({ supabase, title: 'T', description: 'D', loggedVia: 'x', dedupKey: '   ' }))
      .rejects.toThrow(/dedupKey is required/);
    expect(supabase._insert).not.toHaveBeenCalled();
  });
});
