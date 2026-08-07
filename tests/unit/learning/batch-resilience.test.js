// SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 / FR-2 — one bad lesson must not destroy the batch.
//
// extractPatternsFromImprovements is THE LIVE PRODUCTION WRITER for retrospective lessons, and it
// originally had no try/catch anywhere in its module. A single createPattern throw propagated
// uncaught out of the loop, abandoned every REMAINING improvement in the retrospective, and left
// learning_extracted_at NULL — while the caller swallowed the rejection to a console.warn AFTER
// the retro had already printed its own success line. One malformed lesson silently cost the whole
// batch and the run still looked clean.
//
// VALIDATION flagged FR-2 as the one shipped fix with zero CI-visible coverage (it rested on
// one-off manual live probes). This is that coverage.
//
// The discriminating assertion is the CALL COUNT, not the result length. Without the per-item
// try/catch the function REJECTS on item 1, so createPattern is called exactly once; with it, the
// loop runs to completion and calls createPattern for all three. A test that only checked the
// returned array would also pass against a version that silently skipped the remaining items.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Both mocks are hoisted, so the real modules never load. That matters: the script constructs a
// Supabase service client AT MODULE SCOPE, which throws without secrets — an earlier fixture in
// this SD passed locally and would have failed in CI for exactly this kind of ambient dependency.
const createPattern = vi.fn();
const search = vi.fn();
const recordOccurrence = vi.fn();

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: () => ({}) }),
  createSupabaseClient: () => ({ from: () => ({}) }),
  lazyServiceClient: () => ({ from: () => ({}) }),
}));

vi.mock('../../../lib/learning/issue-knowledge-base.js', () => ({
  IssueKnowledgeBase: class {
    search = search;
    createPattern = createPattern;
    recordOccurrence = recordOccurrence;
  },
}));

// Imported from PRODUCTION. Re-implementing the loop here would only confirm what I already
// believe about it.
const { extractPatternsFromImprovements } = await import('../../../scripts/auto-extract-patterns-from-retro.js');

/** Three improvements, each over the 20-char skip threshold so none are filtered out. */
const RETRO = {
  what_needs_improvement: [
    'First lesson about a database migration that failed under load',
    'Second lesson about a flaky end-to-end test in the checkout flow',
    'Third lesson about missing validation on the webhook payload',
  ],
  action_items: ['do the thing'],
  business_value_delivered: 'some value',
};

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue([]);        // no similar pattern -> always take the create branch
  recordOccurrence.mockResolvedValue({});
});

describe('FR-2: a failing lesson must not abort the remaining batch', () => {
  it('THE ACTUAL BUG: item 1 throwing must not stop items 2 and 3', async () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    createPattern
      .mockRejectedValueOnce(err)                              // item 1 is destroyed
      .mockResolvedValueOnce({ pattern_id: 'PAT-LES-aaaaaaaaaaaa' })
      .mockResolvedValueOnce({ pattern_id: 'PAT-LES-bbbbbbbbbbbb' });

    const patterns = await extractPatternsFromImprovements(RETRO, 'sd-uuid', 'SD-KEY');

    // The discriminator: the loop reached every item. Without the try/catch this is 1 and the
    // call above rejects instead of returning.
    expect(createPattern).toHaveBeenCalledTimes(3);

    expect(patterns).toHaveLength(2);                          // the two survivors persisted
    expect(patterns.map((p) => p.action)).toEqual(['created', 'created']);
    expect(patterns.destroyed).toHaveLength(1);                // and the loss is reported, not swallowed
    expect(patterns.destroyed[0].code).toBe('23505');
    expect(patterns.destroyed[0].improvement).toContain('First lesson');
  });

  it('survives a failure in the MIDDLE and at the END, not just the first item', async () => {
    // A guard that only tolerated a leading failure would pass the test above and still lose the
    // tail of a real retrospective.
    createPattern
      .mockResolvedValueOnce({ pattern_id: 'PAT-LES-cccccccccccc' })
      .mockRejectedValueOnce(Object.assign(new Error('check constraint'), { code: '23514' }))
      .mockRejectedValueOnce(Object.assign(new Error('rls denied'), { code: '42501' }));

    const patterns = await extractPatternsFromImprovements(RETRO, 'sd-uuid', 'SD-KEY');

    expect(createPattern).toHaveBeenCalledTimes(3);
    expect(patterns).toHaveLength(1);
    expect(patterns.destroyed.map((d) => d.code).sort()).toEqual(['23514', '42501']);
  });

  it('CONTROL: a clean batch creates everything and reports no destruction', async () => {
    // Without this, every assertion above would also hold against a function that reported
    // failure unconditionally.
    createPattern
      .mockResolvedValueOnce({ pattern_id: 'PAT-LES-dddddddddddd' })
      .mockResolvedValueOnce({ pattern_id: 'PAT-LES-eeeeeeeeeeee' })
      .mockResolvedValueOnce({ pattern_id: 'PAT-LES-ffffffffffff' });

    const patterns = await extractPatternsFromImprovements(RETRO, 'sd-uuid', 'SD-KEY');

    expect(createPattern).toHaveBeenCalledTimes(3);
    expect(patterns).toHaveLength(3);
    expect(patterns.destroyed).toBeUndefined();   // the field is only attached when something died
  });

  it('CONTROL: the throw is genuinely reaching the code under test', async () => {
    // Proves the mock actually rejects. Without this, a mis-wired mock that silently resolved
    // would make every "survived the failure" assertion above vacuous — the failure would never
    // have happened at all.
    createPattern.mockRejectedValue(Object.assign(new Error('always fails'), { code: '23505' }));

    const patterns = await extractPatternsFromImprovements(RETRO, 'sd-uuid', 'SD-KEY');

    expect(patterns).toHaveLength(0);             // nothing persisted...
    expect(patterns.destroyed).toHaveLength(3);   // ...and all three losses are accounted for
  });
});
