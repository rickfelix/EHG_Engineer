// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 1 (FR-5, TS-10 family).
//
// The failure this section is most likely to have is not a crash: it is reporting 10 when the
// remainder is 300, because `next` is capped and `next.length` looks like a perfectly
// reasonable thing to read. Most of these tests exist for that one mistake.

import { describe, it, expect } from 'vitest';
import { buildPlanPosition, SECTION_ID } from '../../../lib/drive-loop/sections/plan-position.js';
import { isUnmeasurable } from '../../../lib/drive-loop/citation.js';

const statusWith = (overrides = {}) => ({
  slipped: [],
  done: [],
  next: [],
  committing: [],
  admissions_by_linkage: { by_wave: [], unlinked: [], fence_lifts: [] },
  open_total: 0,
  next_truncated: false,
  committing_truncated: false,
  ...overrides,
});

// 300 open items, of which the capped return exposes ten. The shape that makes the bug possible.
const CAPPED_300 = statusWith({
  open_total: 300,
  next_truncated: true,
  next: Array.from({ length: 10 }, (_, i) => ({ item_id: `i${i}`, title: `Item ${i}` })),
});

describe('Section 1 — plan position cites the remainder, not the display window', () => {
  it('THE TEST THAT MATTERS: reports 300, not the 10 it was handed', async () => {
    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => CAPPED_300,
      supabase: {},
    });

    expect(section.section).toBe(SECTION_ID);
    expect(section.remainder.value).toBe(300);
    // The specific wrong answer, named so a regression is unambiguous.
    expect(section.remainder.value).not.toBe(10);
    expect(section.remainder.value).not.toBe(section.next.value);
  });

  it('does not claim the capped ten as the remainder\'s row ids', async () => {
    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => CAPPED_300,
      supabase: {},
    });

    // A citation whose row_ids are a subset while its value describes the whole is a citation
    // that points somewhere other than where the number came from. Better to omit and say so.
    expect(section.remainder.citation).not.toHaveProperty('row_ids');
    expect(section.remainder.limitation).toMatch(/row ids/i);
  });

  it('labels the capped list as a display window, not the remainder', async () => {
    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => CAPPED_300,
      supabase: {},
    });

    expect(section.next.predicate).toMatch(/DISPLAY window/);
    expect(section.next.citation.row_ids).toHaveLength(10);
    expect(section.next.limitation).toMatch(/truncated/i);
  });

  it('carries no truncation limitation when nothing was truncated', async () => {
    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => statusWith({
        open_total: 3,
        next: [{ item_id: 'a' }, { item_id: 'b' }, { item_id: 'c' }],
      }),
      supabase: {},
    });

    expect(section.remainder.value).toBe(3);
    // A limitation that is always present is noise, and noise gets skimmed past.
    expect(section.remainder.limitation).toBeUndefined();
    expect(section.next.limitation).toBeUndefined();
  });
});

describe('Section 1 — fails loud, never zero', () => {
  it('reports UNMEASURABLE with the cause when the rollup throws', async () => {
    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => { throw new Error('canonical roadmap missing'); },
      supabase: {},
    });

    expect(isUnmeasurable(section.remainder)).toBe(true);
    expect(section.remainder.value).toBeNull();
    // 0 here renders as "the plan is complete" — the most dangerous false reading this
    // particular section can produce.
    expect(section.remainder.value).not.toBe(0);
    expect(section.remainder.reason).toMatch(/canonical roadmap missing/);
  });

  it('reports UNMEASURABLE rather than silently falling back when open_total is absent', async () => {
    // Running against a pre-enrichment computePlanCheckStatus. The tempting fallback is
    // next.length, which would report 10 forever and look entirely plausible.
    const preEnrichment = { ...statusWith(), next: Array.from({ length: 10 }, (_, i) => ({ item_id: `i${i}` })) };
    delete preEnrichment.open_total;

    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => preEnrichment,
      supabase: {},
    });

    expect(isUnmeasurable(section.remainder)).toBe(true);
    expect(section.remainder.reason).toMatch(/enrichment is missing/);
    expect(section.remainder.value).not.toBe(10);
  });
});

describe('Section 1 — the citation target is part of the contract', () => {
  it('throws rather than importing a rollup implicitly', async () => {
    // Injection is deliberate: it keeps the cited source visible at the call site instead of
    // becoming an import side effect nobody re-reads.
    await expect(buildPlanPosition({ supabase: {} })).rejects.toThrow(/must be injected/);
  });

  it('names computePlanCheckStatus as the source on every cited value', async () => {
    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => CAPPED_300,
      supabase: {},
    });

    for (const key of ['remainder', 'next', 'done_recent', 'slipped']) {
      expect(section[key].citation.source).toMatch(/computePlanCheckStatus/);
    }
  });

  it('records that a cancelled-SD item is excluded from done', async () => {
    // The correctness fix already living in computePlanCheckStatus (225 of 341 stamped items
    // pointed at cancelled SDs). Citing it means inheriting it — the predicate says so, so a
    // reader knows which definition of "done" produced the number.
    const section = await buildPlanPosition({
      computePlanCheckStatus: async () => statusWith({ done: [{ item_id: 'd1', sd_key: 'SD-1' }] }),
      supabase: {},
    });

    expect(section.done_recent.predicate).toMatch(/CANCELLED is deliberately excluded/i);
  });
});
