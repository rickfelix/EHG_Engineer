// SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 / FR-1 — the learning loop destroyed every lesson.
//
// The generator read the MAXIMUM pattern_id and incremented it. pattern_id is TEXT, so DESC is
// lexicographic: the live maximum is VGAP-V11, which contains no "PAT-" substring, so /PAT-(\d+)/
// matched nothing, the counter stayed at its initialiser, and every insert became PAT-001 — which
// already exists. Result: 23505, and the lesson DESTROYED rather than duplicated. The if(match)
// had no else, so it was silent at the point of origin.
//
// These tests pin the two properties that actually matter, and deliberately do NOT assert the id
// FORMAT beyond its prefix — pinning the exact string would just re-encode a parser.
//
// AC-1(a). The live-DB half is AC-1(b), a standalone script rather than a test here: this repo
// gates the vitest db project to ZERO files (tests/helpers/db-target.js, DESIGNATED_NON_PROD_REFS
// is empty), so an integration test written against it reports green having executed nothing —
// exactly the false-verdict shape this SD exists to remove.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertedRows = [];
let maxPatternIdReturned = 'VGAP-V11'; // the real live maximum

// A CHAINABLE double rather than a hand-enumerated one. Enumerating each query shape by hand
// couples the test to the exact call order inside the code under test, so an unrelated refactor
// reports a failure that has nothing to do with the defect — which is what happened on the first
// run here: createDraftPattern calls search() first, whose chain differed by one link.
function chainable(terminal) {
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(terminal()).then(res, rej);
      if (prop === 'single' || prop === 'maybeSingle') return async () => terminal();
      return () => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
}

vi.mock('../../../lib/supabase-client.js', () => {
  const client = {
    from: () => ({
      // Reads: always answer with the real live lexicographic maximum.
      select: () => chainable(() => ({ data: { pattern_id: maxPatternIdReturned }, error: null })),
      update: () => chainable(() => ({ data: null, error: null })),
      insert: (rows) => ({
        select: () => ({
          single: async () => {
            const row = Array.isArray(rows) ? rows[0] : rows;
            // The real UNIQUE constraint, modelled: a repeated pattern_id must raise 23505.
            if (insertedRows.some((r) => r.pattern_id === row.pattern_id)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "issue_patterns_pattern_id_key"' } };
            }
            insertedRows.push(row);
            return { data: row, error: null };
          },
        }),
      }),
    }),
  };
  return { lazyServiceClient: () => client, default: client };
});

const load = async () => (await import('../../../lib/learning/issue-knowledge-base.js')).default;

beforeEach(() => { insertedRows.length = 0; maxPatternIdReturned = 'VGAP-V11'; });

describe('FR-1: two distinct lessons must both persist', () => {
  it('produces DISTINCT ids for distinct lessons against the real lexicographic maximum', async () => {
    const KB = await load();
    const kb = new KB();
    const a = await kb.createPattern({ issue_summary: 'lesson alpha', category: 'testing', severity: 'low' });
    const b = await kb.createPattern({ issue_summary: 'lesson beta', category: 'testing', severity: 'low' });

    expect(a.pattern_id).not.toBe(b.pattern_id);
    // The specific failure: under the old code BOTH were PAT-001 and the second was destroyed.
    expect(insertedRows).toHaveLength(2);
    expect(a.pattern_id).not.toBe('PAT-001');
    expect(b.pattern_id).not.toBe('PAT-001');
  });

  it('does not depend on the maximum being parseable — the whole root cause', async () => {
    const KB = await load();
    const kb = new KB();
    // Whatever the corpus maximum happens to be, identity must not be derived from it.
    for (const max of ['VGAP-V11', 'PAT-AUTO-deadbeef', 'ZZZ-not-an-id', 'PAT-008']) {
      insertedRows.length = 0;
      maxPatternIdReturned = max;
      const p = await kb.createPattern({ issue_summary: `lesson under max ${max}`, category: 'testing' });
      expect(p.pattern_id).toMatch(/^PAT-LES-/);
      expect(insertedRows).toHaveLength(1);
    }
  });

  it('is DETERMINISTIC — identical content yields the same id, so a repeat is a real duplicate', async () => {
    const KB = await load();
    const kb = new KB();
    const args = { issue_summary: 'identical lesson', category: 'process', sd_id: 'SD-X' };
    const first = await kb.createPattern(args);
    // Same content again must be REJECTED as a duplicate rather than silently written twice.
    await expect(kb.createPattern(args)).rejects.toMatchObject({ code: '23505' });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].pattern_id).toBe(first.pattern_id);
  });

  it('CONTROL: the double is capable of reporting a collision', async () => {
    // Without this, the distinctness assertions above would also pass against a double that can
    // never raise 23505 — proving nothing about collision resistance.
    const KB = await load();
    const kb = new KB();
    const args = { issue_summary: 'control collision', category: 'testing' };
    await kb.createPattern(args);
    await expect(kb.createPattern(args)).rejects.toMatchObject({ code: '23505' });
  });
});

describe('FR-4a: draft was never a legal status', () => {
  it('createDraftPattern does not send a status the CHECK constraint rejects', async () => {
    // 20260110_learn_status_constraints.sql is the only migration ever to define
    // issue_patterns_status_check and it has always been ('active','assigned','resolved','obsolete').
    // Verified live at LEAD: an insert with 'draft' returns 23514.
    const KB = await load();
    const kb = new KB();
    await kb.createDraftPattern({ issue_summary: 'draft lesson', category: 'testing', source: 'feedback_cluster' });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].status).not.toBe('draft');
    expect(['active', 'assigned', 'resolved', 'obsolete']).toContain(insertedRows[0].status);
  });
});
