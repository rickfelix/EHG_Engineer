/**
 * Unit tests: lib/chairman/ratification-capture-detector.mjs
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C
 */
import { describe, test, expect, vi } from 'vitest';
import {
  evaluatePredicate,
  classifyItem,
  scanCorpus,
  buildCaptureMissRow,
  buildCandidateRow,
  buildEncodeMissRow,
  detectCaptureMisses,
  detectEncodeMisses,
  detectRatificationCaptureMiss,
  computeCaptureFalsePositiveRate,
  breachWindowKey,
  routeCaptureMissBreach,
} from '../ratification-capture-detector.mjs';

describe('evaluatePredicate / classifyItem — 3-part predicate', () => {
  test('all 3 parts present -> flag', () => {
    const item = { source: 'chairman_decisions', text: 'The chairman ruled: update scripts/solomon-advisory.cjs per SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C' };
    const p = evaluatePredicate(item);
    expect(p.verifiedSurface).toBe(true);
    expect(p.directiveVerbs).toBe(true);
    expect(p.namedTarget).toBe(true);
    expect(classifyItem(item)).toBe('flag');
  });

  test('verified surface + directive verbs, NO named target -> candidate (never flag)', () => {
    const item = { source: 'adam_advisory', text: 'The chairman ratified this approach going forward.' };
    const p = evaluatePredicate(item);
    expect(p.verifiedSurface).toBe(true);
    expect(p.directiveVerbs).toBe(true);
    expect(p.namedTarget).toBe(false);
    expect(classifyItem(item)).toBe('candidate');
  });

  test('unverified surface excludes even with verbs + target -> none', () => {
    const item = { source: 'random_forum_post', text: 'Someone ruled that SD-XXX-001 should change.' };
    expect(classifyItem(item)).toBe('none');
  });

  test('verified surface + named target, NO directive verb -> none (not a candidate)', () => {
    const item = { source: 'chairman_decisions', text: 'Reviewed scripts/foo.js, no action taken.' };
    const p = evaluatePredicate(item);
    expect(p.verifiedSurface).toBe(true);
    expect(p.namedTarget).toBe(true);
    expect(p.directiveVerbs).toBe(false);
    expect(classifyItem(item)).toBe('none');
  });

  test('empty item -> none, no throw', () => {
    expect(classifyItem({})).toBe('none');
    expect(classifyItem(undefined)).toBe('none');
  });
});

describe('row builders — feedback table shape', () => {
  test('buildCaptureMissRow: type=issue, category=ratification_capture_miss', () => {
    const row = buildCaptureMissRow({ id: 'x1', source: 'chairman_decisions', text: 'ruling text', created_at: '2026-08-29T00:00:00Z' });
    expect(row.type).toBe('issue');
    expect(row.category).toBe('ratification_capture_miss');
    expect(row.source_application).toBe('EHG_Engineer');
    expect(row.metadata.item_id).toBe('x1');
  });

  test('buildCandidateRow: category=ratification_capture_candidate, distinct from flag category', () => {
    const row = buildCandidateRow({ id: 'x2', source: 'adam_advisory', text: 'candidate text', created_at: '2026-08-29T00:00:00Z' });
    expect(row.category).toBe('ratification_capture_candidate');
    expect(row.category).not.toBe('ratification_capture_miss');
  });

  test('buildEncodeMissRow: category=ratification_encode_miss, carries reason', () => {
    const row = buildEncodeMissRow({ id: 'r1', ratified_at: '2026-08-01T00:00:00Z' }, 'unencoded for 48.0h, past 24h threshold');
    expect(row.category).toBe('ratification_encode_miss');
    expect(row.metadata.reason).toMatch(/past 24h threshold/);
  });
});

describe('computeCaptureFalsePositiveRate — composes computeMetrics (not computeConfusionMatrix)', () => {
  test('returns null when denominator is zero (single-digit ground truth, as in live chairman_ratifications)', () => {
    const metrics = computeCaptureFalsePositiveRate([]);
    expect(metrics.total).toBe(0);
    expect(metrics.false_positive_rate).toBeNull();
  });

  test('computes a real fp rate from labeled predictions', () => {
    const labeled = [
      { predicted: 'flag', actual: true },   // tp
      { predicted: 'flag', actual: false },  // fp
      { predicted: 'none', actual: false },  // tn
      { predicted: 'none', actual: true },   // fn
    ];
    const metrics = computeCaptureFalsePositiveRate(labeled);
    expect(metrics.total).toBe(4);
    expect(metrics.false_positive_rate).toBeCloseTo(0.5, 5); // fp=1, tn=1 -> 1/(1+1)
  });
});

function fakeSupabaseFor({ scRows = [], cdRows = [], crRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'session_coordination') {
        return {
          select: () => ({
            in: () => ({
              gte: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: scRows, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: () => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: cdRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'chairman_ratifications') {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: crRows, error: null }),
            }),
          }),
        };
      }
      if (table === 'feedback') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return { select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
    },
  };
}

describe('scanCorpus / detectCaptureMisses — TS-1 (capture miss) and TS-2 (candidate queue)', () => {
  test('a flag-shaped item with no ledger row is detected and persisted as a capture miss', async () => {
    const supabase = fakeSupabaseFor({
      cdRows: [{ id: 'd1', decision: 'The chairman ruled: apply this per SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C', created_at: new Date().toISOString() }],
    });
    const insertSpy = vi.spyOn(supabase.from('feedback'), 'insert');
    const result = await detectCaptureMisses(supabase, 24);
    expect(result.count).toBe(1);
    expect(result.captureMisses).toHaveLength(1);
    expect(result.candidates).toHaveLength(0);
  });

  test('an (a)+(b)-only item routes to the candidate queue, never the flag output', async () => {
    const supabase = fakeSupabaseFor({
      scRows: [{ id: 's1', subject: '', body: 'The chairman ratified moving forward with this direction.', payload: { kind: 'adam_advisory' }, created_at: new Date().toISOString() }],
    });
    const result = await detectCaptureMisses(supabase, 24);
    expect(result.count).toBe(0);
    expect(result.captureMisses).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
  });

  test('no matching items -> zero misses, zero candidates, no throw', async () => {
    const supabase = fakeSupabaseFor({});
    const result = await detectCaptureMisses(supabase, 24);
    expect(result.count).toBe(0);
    expect(result.candidates).toHaveLength(0);
  });
});

// QF-20260901-704: the detector's description claimed a chairman_ratifications cross-check that
// no code ever performed — every flag-shaped item (including echoes of already-captured rulings)
// was asserted a miss. These tests prove both directions: real misses still flag when the ledger
// has nothing covering them, AND items covered by (or quoting) an existing ledger row do not.
describe('QF-20260901-704 — ledger cross-check on the flag path', () => {
  const now = new Date().toISOString();
  const flagItem = {
    id: 'd1',
    decision: 'The chairman ruled: apply this per SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C',
    created_at: now,
  };

  test('acceptance (both directions), leg 1: no covering ledger row -> still flags (unchanged from before)', async () => {
    const supabase = fakeSupabaseFor({ cdRows: [flagItem], crRows: [] });
    const result = await detectCaptureMisses(supabase, 24);
    expect(result.count).toBe(1);
    expect(result.captureMisses).toHaveLength(1);
  });

  test('acceptance (both directions), leg 2: a covering ledger row (same target, within window) suppresses the flag', async () => {
    const supabase = fakeSupabaseFor({
      cdRows: [flagItem],
      crRows: [{
        id: 'r-covering',
        ratified_at: now,
        quote: 'Apply per SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C',
        marker_text: null,
        target_contracts: ['protocol'],
      }],
    });
    const result = await detectCaptureMisses(supabase, 24);
    expect(result.count).toBe(0);
    expect(result.captureMisses).toHaveLength(0);
  });

  test('an echo (text quoting an existing ratification id prefix) is a relay, not a miss', async () => {
    const ledgerRow = { id: 'f48e0abf-1234-4abc-8def-000000000000', ratified_at: '2020-01-01T00:00:00Z', quote: 'unrelated target', target_contracts: ['adam'] };
    const supabase = fakeSupabaseFor({
      cdRows: [{ id: 'd2', decision: `As ruled in f48e0abf, apply this per SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C`, created_at: now }],
      crRows: [ledgerRow],
    });
    const result = await detectCaptureMisses(supabase, 24);
    expect(result.count).toBe(0);
  });

  test('a covering row OUTSIDE the window still lets the item flag (window-bounded, not global)', async () => {
    const farPast = new Date(Date.now() - 1000 * 3_600_000).toISOString(); // ~41 days ago
    const supabase = fakeSupabaseFor({
      cdRows: [flagItem],
      crRows: [{ id: 'r-far', ratified_at: farPast, quote: 'SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C', target_contracts: ['protocol'] }],
    });
    const result = await detectCaptureMisses(supabase, 24);
    expect(result.count).toBe(1);
  });
});

describe('QF-20260901-704 — tightened NAMED_TARGET_RE dotted-identifier alternative', () => {
  test('short filler like "e.g." no longer counts as a named target', () => {
    const item = { source: 'chairman_decisions', text: 'The chairman ruled, e.g. do this going forward.' };
    const p = evaluatePredicate(item);
    expect(p.namedTarget).toBe(false);
    expect(classifyItem(item)).toBe('candidate');
  });

  test('a real table_name.column_name-shaped identifier still counts', () => {
    const item = { source: 'chairman_decisions', text: 'The chairman ruled: fix feedback.source_id going forward.' };
    const p = evaluatePredicate(item);
    expect(p.namedTarget).toBe(true);
    expect(classifyItem(item)).toBe('flag');
  });
});

describe('detectEncodeMisses — TS-3 (encode miss, stale-unencoded arm)', () => {
  test('an unencoded row past the threshold is flagged', async () => {
    const staleRatifiedAt = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const supabase = fakeSupabaseFor({
      crRows: [{ id: 'r1', ratified_at: staleRatifiedAt, encoded_at: null, encoded_ref: null, marker_text: null }],
    });
    const result = await detectEncodeMisses(supabase, 24);
    expect(result.count).toBe(1);
    expect(result.rows[0].id).toBe('r1');
  });

  test('an unencoded row within the threshold is NOT flagged', async () => {
    const freshRatifiedAt = new Date(Date.now() - 1 * 3_600_000).toISOString();
    const supabase = fakeSupabaseFor({
      crRows: [{ id: 'r2', ratified_at: freshRatifiedAt, encoded_at: null, encoded_ref: null, marker_text: null }],
    });
    const result = await detectEncodeMisses(supabase, 24);
    expect(result.count).toBe(0);
  });

  test('an encoded row with a fabricated encoded_ref (unverifiable target) is flagged', async () => {
    const supabase = fakeSupabaseFor({
      crRows: [{
        id: 'r3',
        ratified_at: new Date(Date.now() - 100 * 3_600_000).toISOString(),
        encoded_at: new Date().toISOString(),
        encoded_ref: { type: 'section_id', section_id: 'nonexistent-id' },
        marker_text: 'some marker',
      }],
    });
    const result = await detectEncodeMisses(supabase, 24);
    expect(result.count).toBe(1);
    expect(result.rows[0].id).toBe('r3');
  });
});

describe('detectRatificationCaptureMiss — TS-4: two-sided proof in one run', () => {
  test('a seeded capture-miss AND a seeded encode-miss both fire in the same run', async () => {
    const staleRatifiedAt = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const supabase = fakeSupabaseFor({
      cdRows: [{ id: 'd1', decision: 'The chairman ruled: apply this per SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C', created_at: new Date().toISOString() }],
      crRows: [{ id: 'r1', ratified_at: staleRatifiedAt, encoded_at: null, encoded_ref: null, marker_text: null }],
    });
    const result = await detectRatificationCaptureMiss(supabase, 24);
    expect(result.captureMisses).toHaveLength(1);
    expect(result.encodeMisses).toHaveLength(1);
    expect(result.count).toBe(2);
  });

  test('signature matches checkRatificationCaptureMiss default-detector contract: (supabase, thresholdHours) -> {count, rows}', async () => {
    const supabase = fakeSupabaseFor({});
    const result = await detectRatificationCaptureMiss(supabase, 24);
    expect(typeof result.count).toBe('number');
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

// QF-20260830-325 (Cycle-2 R7): route the aggregate signal to ONE deduped feedback row per
// breach window, naming its acting reader, instead of a stdout-only WARN with no disposal path.
function fakeFeedbackTable(rows) {
  return {
    select: () => ({
      eq: (col1, val1) => ({
        eq: (col2, val2) => ({
          limit: () => ({
            maybeSingle: () => {
              const match = rows.find((r) => r.category === val1 && r.metadata?.breach_window === val2);
              return Promise.resolve({ data: match || null, error: null });
            },
          }),
        }),
      }),
    }),
    update: (patch) => ({
      eq: (col, id) => {
        const row = rows.find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        return Promise.resolve({ error: null });
      },
    }),
    insert: (row) => {
      rows.push({ id: `row-${rows.length + 1}`, ...row });
      return Promise.resolve({ error: null });
    },
  };
}

describe('breachWindowKey', () => {
  test('formats as a UTC calendar-day string', () => {
    expect(breachWindowKey(new Date('2026-08-30T23:59:59Z'))).toBe('2026-08-30');
    expect(breachWindowKey(new Date('2026-08-31T00:00:01Z'))).toBe('2026-08-31');
  });
});

describe('routeCaptureMissBreach — one deduped row per breach window (QF-20260830-325)', () => {
  test('three detections in one window produce exactly one row with count 3', async () => {
    const rows = [];
    const supabase = { from: () => fakeFeedbackTable(rows) };
    const now = new Date('2026-08-30T12:00:00Z');

    await routeCaptureMissBreach(supabase, 1, now);
    await routeCaptureMissBreach(supabase, 2, now);
    await routeCaptureMissBreach(supabase, 3, now);

    const windowRows = rows.filter((r) => r.category === 'ratification_capture_miss_breach');
    expect(windowRows).toHaveLength(1);
    expect(windowRows[0].occurrence_count).toBe(3);
  });

  test('a detection in the next window opens a second row', async () => {
    const rows = [];
    const supabase = { from: () => fakeFeedbackTable(rows) };

    await routeCaptureMissBreach(supabase, 2, new Date('2026-08-30T12:00:00Z'));
    await routeCaptureMissBreach(supabase, 1, new Date('2026-08-31T00:30:00Z'));

    const windowRows = rows.filter((r) => r.category === 'ratification_capture_miss_breach');
    expect(windowRows).toHaveLength(2);
    expect(windowRows.map((r) => r.metadata.breach_window).sort()).toEqual(['2026-08-30', '2026-08-31']);
  });

  test('the row body names its acting reader (the weekly orphan-writers-registry triage)', async () => {
    const rows = [];
    const supabase = { from: () => fakeFeedbackTable(rows) };

    await routeCaptureMissBreach(supabase, 5, new Date('2026-08-30T12:00:00Z'));

    expect(rows[0].description).toContain('orphan-writers-registry triage');
    expect(rows[0].description).toContain('SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001');
  });

  test('count<=0 is a no-op — never persists a row', async () => {
    const rows = [];
    const supabase = { from: () => fakeFeedbackTable(rows) };

    const persisted = await routeCaptureMissBreach(supabase, 0, new Date());

    expect(persisted).toBe(false);
    expect(rows).toHaveLength(0);
  });
});
