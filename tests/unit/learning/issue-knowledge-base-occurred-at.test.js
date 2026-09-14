/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158: recordOccurrence's optional occurred_at parameter,
 * threaded through to recordSiteAndMaybeEscalate/mergeSite so a BACKFILLED historical
 * occurrence (e.g. from an old retrospective the extraction cron only just got to) records its
 * site's first_seen at the real historical event time, not the moment the backfill runs.
 *
 * Mocked Supabase, following the same established stub-chain pattern as
 * issue-knowledge-base-quarantine-guard.test.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let patternRow;
let updatePayloads;
let insertPayloads;

function createSupabaseStub() {
  return {
    from(table) {
      expect(table).toBe('issue_patterns');
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: patternRow, error: null }),
          }),
        }),
        update: (payload) => {
          updatePayloads.push(payload);
          patternRow = { ...patternRow, ...payload };
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: patternRow, error: null }),
              }),
            }),
          };
        },
        // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158: createPattern's insert path, needed to test
        // occurred_at -> created_at threading on the brand-new-pattern branch.
        insert: (rows) => {
          insertPayloads.push(rows[0]);
          return {
            select: () => ({
              single: async () => ({ data: rows[0], error: null }),
            }),
          };
        },
      };
    },
  };
}

vi.mock('../../../lib/supabase-client.js', () => ({
  lazyServiceClient: () => createSupabaseStub(),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

const { IssueKnowledgeBase } = await import('../../../lib/learning/issue-knowledge-base.js');

describe('recordOccurrence — occurred_at threading (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158)', () => {
  let kb;
  beforeEach(() => {
    kb = new IssueKnowledgeBase();
    updatePayloads = [];
    insertPayloads = [];
  });

  it('records the site with first_seen at the supplied occurred_at, not call time', async () => {
    patternRow = { id: 'pattern-row-id', pattern_id: 'PAT-X', occurrence_count: 1, proven_solutions: [], metadata: {} };
    const historical = '2026-02-28T15:30:47.167Z';
    await kb.recordOccurrence({
      pattern_id: 'PAT-X',
      sd_id: 'SD-TEST',
      solution_applied: 'a fix',
      resolution_time_minutes: 5,
      occurred_at: historical,
    });
    // updatePayloads[0] is recordOccurrence's own occurrence-count update;
    // updatePayloads[1] is recordSiteAndMaybeEscalate's site-metadata update.
    expect(updatePayloads).toHaveLength(2);
    const site = updatePayloads[1].metadata.sites.find((s) => s.sd_id === 'SD-TEST');
    expect(site.first_seen).toBe(historical);
  });

  it('omitting occurred_at behaves exactly as before this SD (site recorded at current time)', async () => {
    patternRow = { id: 'pattern-row-id', pattern_id: 'PAT-X', occurrence_count: 1, proven_solutions: [], metadata: {} };
    const before = Date.now();
    await kb.recordOccurrence({
      pattern_id: 'PAT-X',
      sd_id: 'SD-TEST',
      solution_applied: 'a fix',
      resolution_time_minutes: 5,
    });
    const site = updatePayloads[1].metadata.sites.find((s) => s.sd_id === 'SD-TEST');
    const recorded = Date.parse(site.first_seen);
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(Date.now());
  });

  it('a malformed occurred_at does not throw and falls back to current time', async () => {
    patternRow = { id: 'pattern-row-id', pattern_id: 'PAT-X', occurrence_count: 1, proven_solutions: [], metadata: {} };
    const before = Date.now();
    await expect(kb.recordOccurrence({
      pattern_id: 'PAT-X',
      sd_id: 'SD-TEST',
      solution_applied: 'a fix',
      resolution_time_minutes: 5,
      occurred_at: 'not-a-real-date',
    })).resolves.toBeTruthy();
    const site = updatePayloads[1].metadata.sites.find((s) => s.sd_id === 'SD-TEST');
    const recorded = Date.parse(site.first_seen);
    expect(recorded).toBeGreaterThanOrEqual(before);
  });
});

describe('createPattern — occurred_at threading (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158)', () => {
  let kb;
  beforeEach(() => {
    kb = new IssueKnowledgeBase();
    insertPayloads = [];
  });

  it('a brand-new pattern gets created_at set to the supplied occurred_at, not insert time', async () => {
    const historical = '2026-02-28T15:30:47.167Z';
    await kb.createPattern({
      issue_summary: 'a historical issue',
      category: 'general',
      sd_id: 'SD-TEST',
      occurred_at: historical,
    });
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0].created_at).toBe(historical);
  });

  it('omitting occurred_at behaves exactly as before this SD (no created_at key emitted, DB default applies)', async () => {
    await kb.createPattern({
      issue_summary: 'a fresh issue',
      category: 'general',
      sd_id: 'SD-TEST',
    });
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).not.toHaveProperty('created_at');
  });

  it('a malformed occurred_at does not throw and omits created_at (DB default applies, same as omission)', async () => {
    await expect(kb.createPattern({
      issue_summary: 'an issue with a bad timestamp',
      category: 'general',
      sd_id: 'SD-TEST',
      occurred_at: 'not-a-real-date',
    })).resolves.toBeTruthy();
    expect(insertPayloads[0]).not.toHaveProperty('created_at');
  });
});
