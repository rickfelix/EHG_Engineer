import { describe, it, expect } from 'vitest';
import {
  filterPatternsForLearning,
  fetchPatternSourceSDStatuses,
  REJECT_REASONS,
} from '../../scripts/modules/learning/filter.mjs';

const SD_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SD_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const NOW_MS = Date.parse('2026-05-01T00:00:00Z');
const tenDaysAgo = new Date(NOW_MS - 10 * 24 * 60 * 60 * 1000).toISOString();
const twoDaysAgo = new Date(NOW_MS - 2 * 24 * 60 * 60 * 1000).toISOString();

const baseline = (overrides = {}) => ({
  pattern_id: 'PAT-TEST-001',
  source: 'retrospective',
  assigned_sd_id: null,
  dedup_fingerprint: 'a1b2c3d4e5f6789012345678901234ab',
  metadata: {},
  category: 'auto_rca',
  occurrence_count: 4,
  first_seen_sd_id: SD_A,
  last_seen_sd_id: SD_B,
  updated_at: twoDaysAgo,
  ...overrides,
});

describe('FR-6: checkSingleSDClosedSource', () => {
  it("rejects single-SD pattern when source SD status='completed'", () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed']]) },
    );
    expect(result.kept).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE);
  });

  it("rejects single-SD pattern when source SD status='cancelled'", () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A })],
      { sourceSdStatusMap: new Map([[SD_A, 'cancelled']]) },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE);
  });

  it('passes when first_seen_sd_id != last_seen_sd_id (cross-SD recurrence)', () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_B })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed'], [SD_B, 'completed']]) },
    );
    expect(result.kept).toHaveLength(1);
  });

  it("passes when source SD status is 'in_progress' (FR-6 abstains; FR-7 owns open SDs)", () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A, updated_at: twoDaysAgo })],
      { sourceSdStatusMap: new Map([[SD_A, 'in_progress']]), nowMs: NOW_MS },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('passes when first_seen_sd_id is null/undefined (no source data)', () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: null, last_seen_sd_id: null })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed']]) },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('honors a custom closedSourceStatuses option', () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A })],
      {
        sourceSdStatusMap: new Map([[SD_A, 'archived']]),
        closedSourceStatuses: ['completed', 'archived'],
      },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE);
  });
});

// SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158: generalizes checkSingleSDClosedSource from
// "exactly one SD, and it's closed" to "every SD referenced in metadata.sites[] is closed" —
// a backlog-draining retro-extraction cron can record one historical incident against many
// sibling SDs, each under its own distinct sd_id, which the strict single-SD check above could
// never recognize as noise even when every one of those SDs has since completed.
describe('SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158: multi-SD all-closed generalization', () => {
  const SD_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  it('rejects a pattern whose metadata.sites[] spans 3+ distinct sd_ids, ALL closed, severity=medium', () => {
    const result = filterPatternsForLearning(
      [baseline({
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_C,
        severity: 'medium',
        metadata: { sites: [{ key: 'sd:a', sd_id: SD_A }, { key: 'sd:b', sd_id: SD_B }, { key: 'sd:c', sd_id: SD_C }] },
      })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed'], [SD_B, 'completed'], [SD_C, 'completed']]) },
    );
    expect(result.kept).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE);
  });

  it('does NOT reject when one of the 3+ distinct sd_ids is still OPEN', () => {
    const result = filterPatternsForLearning(
      [baseline({
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_C,
        severity: 'medium',
        metadata: { sites: [{ key: 'sd:a', sd_id: SD_A }, { key: 'sd:b', sd_id: SD_B }, { key: 'sd:c', sd_id: SD_C }] },
      })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed'], [SD_B, 'in_progress'], [SD_C, 'completed']]) },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('resolves a text-key sd_id (not a UUID) among the sites, not just UUID-shaped ids', () => {
    const TEXT_SD = 'SD-LEARN-FIX-ADDRESS-PAT-AUTO-033';
    const result = filterPatternsForLearning(
      [baseline({
        first_seen_sd_id: TEXT_SD,
        last_seen_sd_id: SD_B,
        severity: 'medium',
        metadata: { sites: [{ key: 'sd:text', sd_id: TEXT_SD }, { key: 'sd:b', sd_id: SD_B }] },
      })],
      { sourceSdStatusMap: new Map([[TEXT_SD, 'completed'], [SD_B, 'completed']]) },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE);
  });

  it('critical/high severity is still exempted (bypass applies identically to the multi-SD case)', () => {
    const result = filterPatternsForLearning(
      [baseline({
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_C,
        severity: 'critical',
        metadata: { sites: [{ key: 'sd:a', sd_id: SD_A }, { key: 'sd:b', sd_id: SD_B }, { key: 'sd:c', sd_id: SD_C }] },
      })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed'], [SD_B, 'completed'], [SD_C, 'completed']]) },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('a pattern with NO metadata.sites[] falls back to the exact original single-SD-only behavior (regression guard)', () => {
    // Same shape as the pre-existing "passes when first_seen_sd_id != last_seen_sd_id" test
    // above, restated here to pin the fallback contract explicitly against this SD's change.
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_B, metadata: {} })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed'], [SD_B, 'completed']]) },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('MUTATION GUARD: fetchPatternSourceSDStatuses resolves every metadata.sites[] sd_id, not just first/last', async () => {
    const pattern = baseline({
      first_seen_sd_id: SD_A,
      last_seen_sd_id: SD_C,
      metadata: { sites: [{ key: 'sd:a', sd_id: SD_A }, { key: 'sd:b', sd_id: SD_B }, { key: 'sd:c', sd_id: SD_C }] },
    });
    const seen = [];
    const fakeSupabase = {
      from() {
        return {
          select() { return this; },
          in(_col, ids) { seen.push(...ids); return Promise.resolve({ data: ids.map((id) => ({ id, status: 'completed' })), error: null }); },
        };
      },
    };
    const map = await fetchPatternSourceSDStatuses(fakeSupabase, [pattern]);
    expect(new Set(seen)).toEqual(new Set([SD_A, SD_B, SD_C]));
    expect(map.get(SD_B)).toBe('completed');
  });
});

describe('FR-7: checkSingleSDStaleOpenSource', () => {
  it('rejects single-SD pattern when source SD is open AND last_seen_at > 7 days ago', () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A, updated_at: tenDaysAgo })],
      { sourceSdStatusMap: new Map([[SD_A, 'in_progress']]), nowMs: NOW_MS },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_STALE_OPEN_SOURCE);
  });

  it('passes when single-SD + open + age <= 7 days (give SD time to resolve)', () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A, updated_at: twoDaysAgo })],
      { sourceSdStatusMap: new Map([[SD_A, 'in_progress']]), nowMs: NOW_MS },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('prefers last_seen_at over updated_at when both present', () => {
    const result = filterPatternsForLearning(
      [baseline({
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_A,
        last_seen_at: tenDaysAgo,
        updated_at: twoDaysAgo,
      })],
      { sourceSdStatusMap: new Map([[SD_A, 'in_progress']]), nowMs: NOW_MS },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_STALE_OPEN_SOURCE);
  });

  it('abstains when neither last_seen_at nor updated_at present', () => {
    const result = filterPatternsForLearning(
      [{ ...baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A }), updated_at: undefined }],
      { sourceSdStatusMap: new Map([[SD_A, 'in_progress']]), nowMs: NOW_MS },
    );
    expect(result.kept).toHaveLength(1);
  });

  it("does not fire when source SD is 'completed' (FR-6 owns that case)", () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A, updated_at: tenDaysAgo })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed']]), nowMs: NOW_MS },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE);
  });

  it('honors custom staleOpenAgeDays option', () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A, updated_at: twoDaysAgo })],
      {
        sourceSdStatusMap: new Map([[SD_A, 'in_progress']]),
        nowMs: NOW_MS,
        staleOpenAgeDays: 1,
      },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_STALE_OPEN_SOURCE);
  });
});

describe('FR-8: checkSessionRetroRequiresMultiSD', () => {
  it("rejects category='session_retrospective' single-SD pattern (open or closed)", () => {
    const result = filterPatternsForLearning(
      [baseline({
        category: 'session_retrospective',
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_A,
        updated_at: twoDaysAgo,
      })],
      { sourceSdStatusMap: new Map(), nowMs: NOW_MS },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SESSION_RETRO_NEEDS_MULTI_SD);
  });

  it('passes session_retrospective when first_seen_sd_id != last_seen_sd_id', () => {
    const result = filterPatternsForLearning(
      [baseline({
        category: 'session_retrospective',
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_B,
      })],
      { sourceSdStatusMap: new Map() },
    );
    expect(result.kept).toHaveLength(1);
  });

  it("ignores other categories (e.g. 'auto_rca' single-SD)", () => {
    const result = filterPatternsForLearning(
      [baseline({
        category: 'auto_rca',
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_A,
        updated_at: twoDaysAgo,
      })],
      { sourceSdStatusMap: new Map(), nowMs: NOW_MS },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('passes when first_seen_sd_id missing (cannot make claim)', () => {
    const result = filterPatternsForLearning(
      [baseline({
        category: 'session_retrospective',
        first_seen_sd_id: null,
        last_seen_sd_id: null,
      })],
      { sourceSdStatusMap: new Map() },
    );
    expect(result.kept).toHaveLength(1);
  });
});

describe('FR-6/FR-7/FR-8 ordering — FR-6 wins over FR-8 when both apply', () => {
  it('session_retrospective + single-SD + closed source → FR-6 (closed source) reason wins', () => {
    const result = filterPatternsForLearning(
      [baseline({
        category: 'session_retrospective',
        first_seen_sd_id: SD_A,
        last_seen_sd_id: SD_A,
      })],
      { sourceSdStatusMap: new Map([[SD_A, 'completed']]) },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE);
  });
});

describe('Historical replay: 10 session_retrospective patterns from baseline observation 2026-05-01', () => {
  // Modeled on the actual 10 most-recent session_retrospective rows queried
  // 2026-05-01 — all 10 had first_seen_sd_id == last_seen_sd_id. Mix of
  // status closed (source SD already shipped) and status open.
  const fixture = [
    { pattern_id: 'PAT-RETRO-PLANTOLEAD-d1af8062', src: 'd1af8062-0222-44e3-b9a2-fa0a386b0a52', srcStatus: 'completed' },
    { pattern_id: 'PAT-RETRO-PLANTOEXEC-b08769c7', src: 'b08769c7-6ddc-4b40-aacd-276e33fed952', srcStatus: 'completed' },
    { pattern_id: 'PAT-RETRO-PLANTOEXEC-af701473', src: 'af701473-6c14-4df0-a259-3233a50bdace', srcStatus: 'in_progress' },
    { pattern_id: 'PAT-RETRO-LEADTOPLAN-1249b41c', src: '1249b41c-139a-4e24-88ec-ab3068b79b8e', srcStatus: 'completed' },
    { pattern_id: 'PAT-RETRO-PLANTOEXEC-211b3c47', src: '211b3c47-be6a-4d39-9e8f-960beb0d7d79', srcStatus: 'completed' },
    { pattern_id: 'PAT-RETRO-LEADFINALAPPROVAL-b737c27f', src: 'b737c27f-3e83-4887-999e-3c1ae158faf4', srcStatus: 'in_progress' },
    { pattern_id: 'PAT-RETRO-PLANTOLEAD-f6795567', src: 'f6795567-3d13-475c-a8c0-9f37e94e7426', srcStatus: 'completed' },
    { pattern_id: 'PAT-RETRO-PLANTOLEAD-9d0c06ce', src: '9d0c06ce-4dae-4486-b69d-e2fef983dac4', srcStatus: 'cancelled' },
    { pattern_id: 'PAT-RETRO-EXECTOPLAN-1249b41c', src: '1249b41c-139a-4e24-88ec-ab3068b79b8e', srcStatus: 'completed' },
    { pattern_id: 'PAT-RETRO-PLANTOEXEC-SD-LEO-I', src: 'SD-LEO-INFRA-PROP-CONTRACT-AUDIT-001', srcStatus: 'completed' },
  ];

  it('suppresses >=8/10 historical session_retrospective patterns', () => {
    const patterns = fixture.map((f) => baseline({
      pattern_id: f.pattern_id,
      category: 'session_retrospective',
      first_seen_sd_id: f.src,
      last_seen_sd_id: f.src,
      updated_at: twoDaysAgo,
    }));
    const sourceSdStatusMap = new Map(fixture.map((f) => [f.src, f.srcStatus]));
    const result = filterPatternsForLearning(patterns, { sourceSdStatusMap, nowMs: NOW_MS });
    expect(result.rejected.length).toBeGreaterThanOrEqual(8);

    // Acceptance: at least the 8 closed/cancelled patterns rejected by FR-6;
    // FR-8 catches any remaining session_retrospective single-SD.
    const reasons = new Set(result.rejected.map((r) => r.reason));
    expect(reasons.has(REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE)).toBe(true);
  });

  it('suppresses 10/10 — open ones caught by FR-8 even when fresh', () => {
    const patterns = fixture.map((f) => baseline({
      pattern_id: f.pattern_id,
      category: 'session_retrospective',
      first_seen_sd_id: f.src,
      last_seen_sd_id: f.src,
      updated_at: twoDaysAgo,
    }));
    const sourceSdStatusMap = new Map(fixture.map((f) => [f.src, f.srcStatus]));
    const result = filterPatternsForLearning(patterns, { sourceSdStatusMap, nowMs: NOW_MS });
    expect(result.rejected).toHaveLength(10);
    expect(result.kept).toHaveLength(0);
  });
});

describe('fetchPatternSourceSDStatuses helper', () => {
  it('issues a single batched .in() query against strategic_directives_v2', async () => {
    const calls = [];
    const fakeSupabase = {
      from(table) {
        return {
          select(cols) {
            return {
              in(col, ids) {
                calls.push({ table, cols, col, ids });
                return Promise.resolve({
                  data: [
                    { id: SD_A, status: 'completed' },
                    { id: SD_B, status: 'in_progress' },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      },
    };
    const patterns = [
      { first_seen_sd_id: SD_A, last_seen_sd_id: SD_A },
      { first_seen_sd_id: SD_A, last_seen_sd_id: SD_B },
      { first_seen_sd_id: SD_B, last_seen_sd_id: SD_B },
    ];
    const map = await fetchPatternSourceSDStatuses(fakeSupabase, patterns);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('strategic_directives_v2');
    expect(calls[0].col).toBe('id');
    expect([...calls[0].ids].sort()).toEqual([SD_A, SD_B].sort());
    expect(map.get(SD_A)).toBe('completed');
    expect(map.get(SD_B)).toBe('in_progress');
  });

  it('returns empty Map when no first_seen/last_seen ids present', async () => {
    let queryIssued = false;
    const fakeSupabase = {
      from() {
        queryIssued = true;
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };
    const map = await fetchPatternSourceSDStatuses(fakeSupabase, [
      { first_seen_sd_id: null, last_seen_sd_id: null },
      { first_seen_sd_id: '', last_seen_sd_id: '' },
    ]);
    expect(queryIssued).toBe(false);
    expect(map.size).toBe(0);
  });

  it('throws when supabase returns an error', async () => {
    const fakeSupabase = {
      from() {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
          }),
        };
      },
    };
    await expect(
      fetchPatternSourceSDStatuses(fakeSupabase, [
        { first_seen_sd_id: SD_A, last_seen_sd_id: SD_A },
      ]),
    ).rejects.toThrow(/fetchPatternSourceSDStatuses failed: boom/);
  });
});

describe('backward compatibility — existing callers without sourceSdStatusMap still work', () => {
  it('treats missing sourceSdStatusMap as empty Map (no FR-6/FR-7 rejections)', () => {
    const result = filterPatternsForLearning(
      [baseline({ first_seen_sd_id: SD_A, last_seen_sd_id: SD_A })],
    );
    expect(result.kept).toHaveLength(1);
  });
});

describe('bypass option remains a hard override', () => {
  it('bypass=true overrides all 3 new filters', () => {
    const noisy = baseline({
      category: 'session_retrospective',
      first_seen_sd_id: SD_A,
      last_seen_sd_id: SD_A,
    });
    const result = filterPatternsForLearning([noisy], {
      bypass: true,
      sourceSdStatusMap: new Map([[SD_A, 'completed']]),
    });
    expect(result.kept).toEqual([noisy]);
    expect(result.rejected).toHaveLength(0);
  });
});
