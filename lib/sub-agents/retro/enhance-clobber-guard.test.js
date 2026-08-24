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

// SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 FR-2/TS-4: the plain fakeSupabase above is filter-blind
// (`.eq()` is a no-op passthrough) -- it cannot distinguish "fetch by id" from "fetch most-recent
// by sd_id", so it would pass this test against BOTH the fixed and the pre-fix code. This fake
// actually serves different rows per query shape, closing that gap.
function multiRowFakeSupabase(rowsById, mostRecentRow) {
  const updates = [];
  return {
    updates,
    from() {
      const filters = {};
      let usedOrderLimit = false;
      const b = {
        select: () => b,
        eq: (field, value) => { filters[field] = value; return b; },
        order: () => { usedOrderLimit = true; return b; },
        limit: () => b,
        maybeSingle: async () => {
          if (filters.id) return { data: rowsById[filters.id] ?? null, error: null };
          if (usedOrderLimit) return { data: mostRecentRow, error: null };
          return { data: null, error: null };
        },
        single: async () => ({ data: { id: 'handoff-row' }, error: null }),
        update: (payload) => { updates.push(payload); return b; },
      };
      return b;
    },
  };
}

describe('FR-2/TS-4: enhanceRetrospective guards the row it is actually about to write, on a multi-retro SD', () => {
  it('classifies existingId, not whichever row is most recent for the sd_id', async () => {
    // The row actually being enhanced: thin + auto -- should be SAFE to write.
    const handoffRow = { id: 'handoff-row', sd_id: SD_ID, generated_by: 'SUB_AGENT', key_learnings: THIN_LEARNINGS, what_went_well: [], what_needs_improvement: [], action_items: [] };
    // A DIFFERENT, more-recent row on the same SD (e.g. an INCIDENT retro): rich + manual. If the
    // guard classified THIS row instead (the pre-fix bug), the write would be wrongly refused.
    const incidentRow = { id: 'incident-row', sd_id: SD_ID, generated_by: null, key_learnings: RICH_LEARNINGS, what_went_well: [], what_needs_improvement: [], action_items: [] };
    const sb = multiRowFakeSupabase({ 'handoff-row': handoffRow }, incidentRow);

    const res = await enhanceRetrospective(sb, 'handoff-row', newRetro, handoffRow, dedupe);

    expect(res.skipped).toBeUndefined();
    expect(sb.updates).toHaveLength(1);
  });

  it('regression: WITHOUT the fix (targetRowId omitted), the most-recent row would wrongly gate the write', async () => {
    // Sanity-checks the fixture itself: proves incidentRow really is what the old
    // sd_id+order+limit query would have returned, and that classifying it refuses.
    const { classifyRetro } = await import('../../../scripts/modules/handoff/lib/retro-clobber-guard.js');
    const incidentRow = { id: 'incident-row', sd_id: SD_ID, generated_by: null, key_learnings: RICH_LEARNINGS };
    expect(classifyRetro(incidentRow)).toEqual({ safe: false, reason: 'manual_retro_null_inferred' });
  });
});

describe('FR-3/TS-5: enhanceRetrospective preserves existing content it does not explicitly replace', () => {
  it('preserves existing.description alongside newRetro.description (not dropped)', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'SUB_AGENT', key_learnings: THIN_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
      title: 'Original handoff retro', description: 'The original description with real content.',
    };
    const sb = fakeSupabase(existing);

    await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    const written = sb.updates[0].description;
    expect(written).toContain(newRetro.description);
    expect(written).toContain(existing.description);
  });

  it('preserves existing scalar field values when newRetro omits them (preserve-on-absence, all 7 fields)', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'SUB_AGENT', key_learnings: THIN_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
      title: 'x', description: 'y',
      conducted_date: '2026-01-01', objectives_met: true, on_schedule: false,
      within_scope: true, team_satisfaction: 8, velocity_achieved: 42, business_value_delivered: 'high',
    };
    const sb = fakeSupabase(existing);
    // newRetro omits all 7 scalar fields entirely.
    const sparseNewRetro = { ...newRetro };
    for (const f of ['conducted_date', 'objectives_met', 'on_schedule', 'within_scope', 'team_satisfaction', 'velocity_achieved', 'business_value_delivered']) {
      delete sparseNewRetro[f];
    }

    await enhanceRetrospective(sb, 'r-1', sparseNewRetro, existing, dedupe);

    const written = sb.updates[0];
    expect(written.conducted_date).toBe('2026-01-01');
    expect(written.objectives_met).toBe(true);
    expect(written.velocity_achieved).toBe(42);
    expect(written.business_value_delivered).toBe('high');
    expect(written.on_schedule).toBe(false); // preserved, and `??` correctly keeps an explicit false
    expect(written.within_scope).toBe(true);
    expect(written.team_satisfaction).toBe(8);
  });

  it('an explicit newRetro value always wins over existing (preserve-on-absence, not preserve-always)', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'SUB_AGENT', key_learnings: THIN_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
      title: 'x', description: 'y', team_satisfaction: 3,
    };
    const sb = fakeSupabase(existing);

    await enhanceRetrospective(sb, 'r-1', { ...newRetro, team_satisfaction: 9 }, existing, dedupe);

    expect(sb.updates[0].team_satisfaction).toBe(9);
  });

  it('a genuinely manual (non-null, non-auto) generated_by can never reach this merge at all -- always refused pre-merge by manual_retro', async () => {
    // Documents WHY auto_generated=true is safe to default for the null-generated_by case above:
    // classifyRetro's manual_retro branch refuses any TRUTHY non-auto generated_by unconditionally
    // (regardless of richness), before reaching enhanceRetrospective's merge body at all.
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'human-authored', key_learnings: THIN_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
    };
    const sb = fakeSupabase(existing);

    const res = await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('manual_retro');
    expect(sb.updates).toHaveLength(0);
  });

  it('defaults auto_generated=true for the null-generated_by (ambiguous, always-thin-at-this-point) case', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: null, key_learnings: THIN_LEARNINGS, // null + thin passes the guard (auto_thin)
      what_went_well: [], what_needs_improvement: [], action_items: [],
      title: 'x', description: 'y',
    };
    const sb = fakeSupabase(existing);

    await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    expect(sb.updates[0].auto_generated).toBe(true);
  });

  it('sets auto_generated=true when existing was genuinely auto-generated', async () => {
    const existing = {
      id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
      generated_by: 'AUTO', key_learnings: THIN_LEARNINGS,
      what_went_well: [], what_needs_improvement: [], action_items: [],
      title: 'x', description: 'y',
    };
    const sb = fakeSupabase(existing);

    await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

    expect(sb.updates[0].auto_generated).toBe(true);
  });

  // SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 EXEC-phase TESTING finding F-5: along the normal
  // guard-gated path, existing.generated_by reaching this merge is ALWAYS either null or a
  // known AUTO_GENERATED_TYPES member (a truly-manual generated_by is always refused pre-merge
  // by classifyRetro's manual_retro branch) -- so `preservedAutoGenerated` can only ever
  // evaluate `false` via LEO_RETRO_GUARD_DRY_RUN=1, which forces guard.safe=true regardless of
  // the underlying classification. This test exercises exactly that path, so the false branch
  // is a MEASURED fact, not asserted-but-never-exercised prose.
  it('preserves auto_generated=false for a manually-authored existing row reached via dry-run override', async () => {
    const prevDryRun = process.env.LEO_RETRO_GUARD_DRY_RUN;
    process.env.LEO_RETRO_GUARD_DRY_RUN = '1';
    try {
      const existing = {
        id: 'r-1', sd_id: SD_ID, status: 'DRAFT', retro_type: null,
        generated_by: 'human-authored', key_learnings: THIN_LEARNINGS, // manual_retro under normal enforcement
        what_went_well: [], what_needs_improvement: [], action_items: [],
        title: 'x', description: 'y',
      };
      const sb = fakeSupabase(existing);

      const res = await enhanceRetrospective(sb, 'r-1', newRetro, existing, dedupe);

      expect(res.skipped).toBeUndefined(); // dry-run forces the write through
      expect(sb.updates).toHaveLength(1);
      expect(sb.updates[0].auto_generated).toBe(false);
    } finally {
      if (prevDryRun === undefined) delete process.env.LEO_RETRO_GUARD_DRY_RUN;
      else process.env.LEO_RETRO_GUARD_DRY_RUN = prevDryRun;
    }
  });
});
