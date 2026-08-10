/**
 * SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-1 + FR-2.
 *
 * The RETRO sub-agent's own write path never consulted the clobber guard. The guard had SEVEN
 * consult sites and every one was a HANDOFF door, so the writer most likely to overwrite a
 * finished retrospective — `execute-subagent.js --code RETRO` — was the one that never asked.
 *
 * These tests drive the REAL guard through a fake supabase rather than mocking the guard module.
 * A mocked guard would prove enhanceRetrospective calls *something*; driving the real one proves
 * the two are actually connected, which is the property that was missing.
 */
import { describe, it, expect } from 'vitest';
import { enhanceRetrospective } from './db-operations.js';

const SD_ID = '22eae8e5-cac5-4f65-bd0a-aae1fba6543f';

/** Long entries so the guard's richness test (>=3 entries, avg len > 100) fires. */
const RICH_LEARNINGS = [
  { learning: 'A field name is a claim and the implementation is usually cheaper than the name, so read what a column CONTAINS before trusting what it is called.' },
  { learning: 'Only an executed test pins the data flow; a regex over source pins a statement form and will happily pass against a dead-coded call site.' },
  { learning: 'A correction that lands on one access path leaves every other path serving the old behaviour, which is why a guard on six doors is not a guard on the seventh.' },
];
const THIN_LEARNINGS = [{ learning: 'went well' }];

/**
 * Fake supabase. The guard SELECTs the newest retrospective for the sd_id; enhance then UPDATEs.
 * Captures the update payload so assertions can be made on WHAT WAS WRITTEN, never on a log line.
 */
function fakeSupabase(guardRow) {
  const updates = [];
  return {
    updates,
    from() {
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: guardRow, error: null }),
        single: async () => ({ data: { id: 'r-1' }, error: null }),
        update: (payload) => {
          updates.push(payload);
          return b;
        },
      };
      return b;
    },
  };
}

const newRetro = {
  sd_id: SD_ID,
  title: 'Completion retro',
  description: 'desc',
  quality_score: 95,
  key_learnings: [{ learning: 'a new learning that is reasonably long so dedup has something to chew on' }],
  what_went_well: [], what_needs_improvement: [], action_items: [],
  success_patterns: [], failure_patterns: [], protocol_improvements: [],
  conducted_date: '2026-08-09', objectives_met: true,
};
const dedupe = (a, b) => [...(a || []), ...(b || [])];

describe('FR-1: the RETRO sub-agent door now consults the clobber guard', () => {
  // REFUSE — the case that silently overwrote a finished retrospective before this change.
  it('REFUSES to overwrite a PUBLISHED SD_COMPLETION retrospective, and writes NOTHING', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'PUBLISHED', retro_type: 'SD_COMPLETION',
      generated_by: null, key_learnings: RICH_LEARNINGS, quality_score: 100,
      what_went_well: [], what_needs_improvement: [], action_items: [],
    };
    const sb = fakeSupabase(existing);

    const res = await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('published_sd_completion');
    // THE ASSERTION THAT MATTERS: no write occurred at all.
    expect(sb.updates).toHaveLength(0);
  });

  it('REFUSES a rich manually-authored retrospective (generated_by null + rich content)', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: null, key_learnings: RICH_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
    };
    const sb = fakeSupabase(existing);

    const res = await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('manual_retro_null_inferred');
    expect(sb.updates).toHaveLength(0);
  });

  // ACCEPT — proves the consult tightened the door rather than sealing it.
  it('ENRICHES an auto_thin retrospective — the accept half', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'SUB_AGENT', key_learnings: THIN_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
    };
    const sb = fakeSupabase(existing);

    const res = await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    expect(res.skipped).toBeUndefined();
    expect(sb.updates).toHaveLength(1);
    expect(sb.updates[0].status).toBe('PUBLISHED');
  });

  it('reports a refusal as SUCCESS-with-skipped, not as a failure', async () => {
    // Nothing went wrong when a protected record is left alone. A caller seeing only
    // success:false could not distinguish "refused to clobber" from "the write broke".
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'PUBLISHED', retro_type: 'SD_COMPLETION',
      generated_by: null, key_learnings: RICH_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
    };
    const res = await enhanceRetrospective(fakeSupabase(existing), 'r-1', newRetro, existing, dedupe);
    expect(res.success).toBe(true);
    expect(res.skipped).toBe(true);
  });
});

describe('FR-2: the enhance write no longer fabricates a quality score', () => {
  it('omits quality_score from the update payload entirely', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'SUB_AGENT', key_learnings: THIN_LEARNINGS, quality_score: 40,
      what_went_well: [], what_needs_improvement: [], action_items: [],
    };
    const sb = fakeSupabase(existing);

    await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    expect(sb.updates).toHaveLength(1);
    // The caller cannot know the score — the DB trigger computes it. Supplying one created a
    // window where the stored number was a claim nobody measured.
    expect(sb.updates[0]).not.toHaveProperty('quality_score');
  });

  it('does not ratchet the score upward from the existing row', async () => {
    // The old expression took Math.max(new, existing), so a record whose content got WORSE kept
    // the better number. Asserted by giving the existing row the higher score.
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'SUB_AGENT', key_learnings: THIN_LEARNINGS, quality_score: 100,
      what_went_well: [], what_needs_improvement: [], action_items: [],
    };
    const sb = fakeSupabase(existing);

    await enhanceRetrospective(sb, 'r-1', { ...newRetro, quality_score: 10 }, existing, dedupe);

    expect(JSON.stringify(sb.updates[0])).not.toContain('quality_score');
  });
});
