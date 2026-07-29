/**
 * SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 — FR-1, FR-2, FR-6 / TS-1, TS-2, TS-3, TS-10, TS-11.
 *
 * *** THE FIXTURE IS THE WHOLE POINT. *** Every reader in this SD would start returning the
 * right answer BY ACCIDENT if the duplicate roadmap rows were simply deleted, while the broken
 * predicate survived to pick the next wrong roadmap the moment another row was created. So the
 * fixture deliberately holds FOUR roadmaps — exactly one active, and the NEWEST one archived —
 * which is the only shape in which an unscoped `order(created_at).limit(1)` reader actually
 * fails. A single-roadmap fixture passes against the broken code and proves nothing.
 *
 * *** AND THE DOUBLE IS UNDER TEST TOO (TS-10). *** The pre-existing mock in this repo
 * (chairman-morning-review-sweep.test.js) RECORDS .eq/.order/.limit and APPLIES NONE. Under it
 * the polarity of these tests INVERTS: the broken code renders "waves 0/8 done" and looks
 * correct, while the correct fix renders "AMBIGUOUS — 4 active roadmaps" and looks broken,
 * because the resolver receives all four rows in answer to an .eq('status','active') query.
 * A suite built on such a double does not merely miss this defect — it CERTIFIES it and
 * PENALISES the fix. Hence makeDb() below genuinely applies .eq, and TS-10 asserts that it does.
 */
import { describe, it, expect } from 'vitest';
import { gatherWaves, formatRoadmapLine } from '../../../scripts/cron/chairman-morning-review-sweep.mjs';

const ROADMAPS = [
  { id: 'arch-newest', status: 'archived', created_at: '2026-07-17T15:49:00Z' },
  { id: 'arch-mid', status: 'archived', created_at: '2026-07-17T15:30:00Z' },
  { id: 'active-poR', status: 'active', created_at: '2026-06-13T10:18:00Z' },
  { id: 'arch-oldest', status: 'archived', created_at: '2026-03-08T23:12:00Z' }
];
const WAVES = [
  ...Array.from({ length: 4 }, (_, i) => ({ roadmap_id: 'arch-newest', status: 'proposed', progress_pct: 0, k: i })),
  ...Array.from({ length: 8 }, (_, i) => ({ roadmap_id: 'active-poR', status: i < 3 ? 'completed' : 'approved', progress_pct: i < 3 ? 100 : 50, k: i }))
];

/** A double that ACTUALLY APPLIES .eq — see the header note on why this is non-negotiable. */
function makeDb({ roadmaps = ROADMAPS, waves = WAVES } = {}) {
  const src = { strategic_roadmaps: roadmaps, roadmap_waves: waves };
  return {
    from(table) {
      let rows = [...(src[table] || [])];
      const api = {
        select() { return api; },
        eq(col, val) { rows = rows.filter((r) => r[col] === val); return api; },
        order(col, { ascending = true } = {}) {
          rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1));
          return api;
        },
        limit(n) { rows = rows.slice(0, n); return api; },
        then(res) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
}

describe('TS-10: the test double is itself trustworthy', () => {
  it('APPLIES .eq rather than merely recording it', async () => {
    // If this fails, every other assertion in this file is void — a double that records filters
    // without applying them hands the resolver all 4 rows for an .eq('status','active') query.
    const db = makeDb();
    const all = await db.from('strategic_roadmaps').select('*');
    const activeOnly = await db.from('strategic_roadmaps').select('*').eq('status', 'active');
    expect(all.data).toHaveLength(4);
    expect(activeOnly.data).toHaveLength(1);
    expect(activeOnly.data[0].id).toBe('active-poR');
  });
});

describe('TS-1: the cron selects the ACTIVE roadmap, not the newest', () => {
  it('picks the active plan of record even though an archived roadmap is newer', async () => {
    const r = await gatherWaves(makeDb());
    expect(r.state).toBe('resolved');
    expect(r.roadmapId).toBe('active-poR');
    expect(r.waveCount).toBe(8);
  });

  it('NEGATIVE CONTROL: the pre-fix predicate picks the archived roadmap on this same fixture', async () => {
    // The shipped query, reproduced verbatim. If this ever stops returning 'arch-newest', the
    // fixture has lost the property that makes the test above meaningful.
    const db = makeDb();
    const { data } = await db.from('strategic_roadmaps').select('id, status, created_at').order('created_at', { ascending: false }).limit(1);
    expect(data[0].id).toBe('arch-newest');
    expect(data[0].status).toBe('archived');
  });
});

describe('FR-2 / TS-2, TS-3, TS-11: the four states are PAIRWISE DISTINCT', () => {
  it('renders ambiguity as ambiguity, never as absence', async () => {
    // Pre-fix, zero-active and two-active BOTH rendered "waves 0/N done" — provably
    // indistinguishable. This is the assertion that would have caught that.
    const twoActive = ROADMAPS.map((r) => ({ ...r, status: 'active' }));
    const r = await gatherWaves(makeDb({ roadmaps: twoActive }));
    expect(r.state).toBe('ambiguous');
    const line = formatRoadmapLine(r);
    expect(line).toMatch(/AMBIGUOUS/);
    expect(line).not.toMatch(/no active roadmap/);
  });

  it('renders genuine absence as absence', async () => {
    const r = await gatherWaves(makeDb({ roadmaps: [] }));
    expect(r.state).toBe('none');
    expect(formatRoadmapLine(r)).toMatch(/no active roadmap/);
  });

  it('an active roadmap with zero waves is NOT "no active roadmap"', async () => {
    const r = await gatherWaves(makeDb({ waves: [] }));
    expect(r.state).toBe('resolved');
    expect(formatRoadmapLine(r)).not.toMatch(/no active roadmap/);
  });

  it('all four states produce mutually different lines', async () => {
    const lines = [
      formatRoadmapLine(await gatherWaves(makeDb({ roadmaps: [] }))),
      formatRoadmapLine(await gatherWaves(makeDb({ roadmaps: ROADMAPS.map((r) => ({ ...r, status: 'active' })) }))),
      formatRoadmapLine(await gatherWaves(makeDb())),
      formatRoadmapLine({ state: 'unavailable' })
    ];
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('TS-11: avgPct is asserted, not just waveCount', () => {
  it('averages progress across the ACTIVE roadmap only', async () => {
    // 3 waves at 100 + 5 at 50 = 550/8 = 68.75 -> 69. Under the pre-fix reader this would be
    // the archived roadmap's 0, so the number itself discriminates.
    const r = await gatherWaves(makeDb());
    expect(r.avgPct).toBe(69);
    expect(r.doneWaves).toBe(3);
  });
});
