// QF-20260911-425: invariant_gauge_finding's designed drain (gauge_finding_dispositions, per
// gauge-registry.js's own entry) was never built -- 5,423+ rows stuck status=new/triaged against
// exactly one (unrelated) disposition ever written. This sweep groups outstanding findings by
// fingerprint (gauge_id) and writes one disposition per fingerprint through the existing
// canonical writer (acceptDisposition). It deliberately never touches the member feedback rows:
// public.feedback's append-only trigger rejects any UPDATE, and the registry's own "closingPath"
// description is "a gauge_finding_dispositions row per finding" -- not a member-row mutation.
import { describe, it, expect } from 'vitest';
import {
  computeFingerprintGroups,
  sweepGaugeFindingDispositions,
} from '../../../lib/governance/gauge-finding-disposition-sweep.mjs';

function row(id, gaugeId, createdAt) {
  return { id, created_at: createdAt, metadata: { gauge_id: gaugeId } };
}

describe('computeFingerprintGroups', () => {
  it('collapses N rows per gauge_id into one group per fingerprint, sorted by count desc, tracking the oldest created_at', () => {
    const rows = [
      row('a1', 'gauge-x', '2026-07-01T00:00:00Z'),
      row('a2', 'gauge-x', '2026-07-05T00:00:00Z'),
      row('b1', 'gauge-y', '2026-07-02T00:00:00Z'),
      row('c1', 'gauge-z', '2026-07-03T00:00:00Z'),
      row('c2', 'gauge-z', '2026-07-04T00:00:00Z'),
      row('c3', 'gauge-z', '2026-06-30T00:00:00Z'),
    ];
    const groups = computeFingerprintGroups(rows);
    expect(groups.map((g) => g.fingerprint)).toEqual(['gauge-z', 'gauge-x', 'gauge-y']);
    expect(groups.find((g) => g.fingerprint === 'gauge-z')).toMatchObject({ count: 3, oldestCreatedAt: '2026-06-30T00:00:00Z' });
    expect(groups.find((g) => g.fingerprint === 'gauge-x')).toMatchObject({ count: 2, oldestCreatedAt: '2026-07-01T00:00:00Z' });
  });

  it('rows with no metadata.gauge_id collapse into a single "(unknown-gauge)" fingerprint rather than being dropped', () => {
    const rows = [{ id: 'x', created_at: '2026-07-01T00:00:00Z', metadata: {} }, { id: 'y', created_at: '2026-07-02T00:00:00Z', metadata: null }];
    const groups = computeFingerprintGroups(rows);
    expect(groups).toEqual([{ fingerprint: '(unknown-gauge)', count: 2, oldestCreatedAt: '2026-07-01T00:00:00Z', sampleIds: ['x', 'y'] }]);
  });
});

describe('sweepGaugeFindingDispositions', () => {
  /** In-memory fake: feedback rows are fixed; gauge_finding_dispositions is a real upserting Map. */
  function fakeSupabase(feedbackRows) {
    const dispositions = new Map();
    const supabase = {
      from(table) {
        if (table === 'feedback') {
          return {
            select() {
              return {
                eq() { return this; },
                in() { return this; },
                order() { return this; },
                range: () => Promise.resolve({ data: feedbackRows, error: null }),
              };
            },
          };
        }
        if (table === 'gauge_finding_dispositions') {
          return {
            select: () => ({ eq: (_c, fp) => ({ maybeSingle: () => Promise.resolve({ data: dispositions.get(fp) || null, error: null }) }) }),
            upsert: (row) => ({
              select: () => ({
                single: () => {
                  const merged = { ...row, updated_at: row.updated_at };
                  dispositions.set(row.fingerprint, merged);
                  return Promise.resolve({ data: merged, error: null });
                },
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    return { supabase, dispositions };
  }

  // QF's own stated test: a fixture with 3 fingerprints x N rows collapses to 3 dispositions.
  it('3 fingerprints x N rows collapses to exactly 3 disposition rows', async () => {
    const rows = [
      row('a1', 'gauge-x', '2026-07-01T00:00:00Z'), row('a2', 'gauge-x', '2026-07-02T00:00:00Z'), row('a3', 'gauge-x', '2026-07-03T00:00:00Z'),
      row('b1', 'gauge-y', '2026-07-01T00:00:00Z'), row('b2', 'gauge-y', '2026-07-02T00:00:00Z'),
      row('c1', 'gauge-z', '2026-07-01T00:00:00Z'),
    ];
    const { supabase, dispositions } = fakeSupabase(rows);
    const result = await sweepGaugeFindingDispositions(supabase, { apply: true });
    expect(result).toMatchObject({ outstanding: 6, fingerprints: 3, dispositioned: 3, dry_run: false });
    expect(dispositions.size).toBe(3);
    expect([...dispositions.keys()].sort()).toEqual(['gauge-x', 'gauge-y', 'gauge-z']);
  });

  it('dry-run reports the same counts without writing', async () => {
    const rows = [row('a1', 'gauge-x', '2026-07-01T00:00:00Z'), row('b1', 'gauge-y', '2026-07-01T00:00:00Z')];
    const { supabase, dispositions } = fakeSupabase(rows);
    const result = await sweepGaugeFindingDispositions(supabase, { apply: false });
    expect(result).toMatchObject({ outstanding: 2, fingerprints: 2, dispositioned: 0, dry_run: true });
    expect(dispositions.size).toBe(0);
  });

  it('re-run is idempotent: still exactly 3 disposition rows, no duplicates, and preserves the original re_review_at', async () => {
    const rows = [row('a1', 'gauge-x', '2026-07-01T00:00:00Z'), row('b1', 'gauge-y', '2026-07-01T00:00:00Z'), row('c1', 'gauge-z', '2026-07-01T00:00:00Z')];
    const { supabase, dispositions } = fakeSupabase(rows);
    await sweepGaugeFindingDispositions(supabase, { apply: true });
    const firstReReviewAt = dispositions.get('gauge-x').re_review_at;

    await sweepGaugeFindingDispositions(supabase, { apply: true });
    expect(dispositions.size).toBe(3);
    expect(dispositions.get('gauge-x').re_review_at).toBe(firstReReviewAt); // not reset by a plain re-run
  });
});
