/**
 * FR-1 traversal-reflection emitter — pure unit tests.
 * DB-free: supabase is a minimal chainable stub. Confirms fail-open behavior (never
 * throws), the FR-2 quality-floor skip path, and the source='retrospective' /
 * metadata.emission_type discrimination (so reflection rows survive the /learn
 * LOW_SIGNAL_SOURCE noise filter while remaining distinguishable from other retros).
 */
import { describe, it, expect, vi } from 'vitest';
import { emitTraversalReflection, EMISSION_TYPE } from '../../../lib/eva/traversal-reflection-emitter.js';

const GOOD_LESSON = 'lib/eva/post-lifecycle-decisions.js dropped the PIVOT rationale for venture v-42 when ventureContext.name was undefined, producing a blank chairman summary.';
const BOILERPLATE_LESSON = 'Traversal completed. No issues to report.';

function stubSupabase({ recentLessons = [], insertError = null } = {}) {
  const inserts = [];
  return {
    inserts,
    supabase: {
      from(table) {
        if (table !== 'issue_patterns') throw new Error(`unexpected table: ${table}`);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: recentLessons.map((issue_summary) => ({ issue_summary })), error: null }),
                }),
              }),
            }),
          }),
          insert: (row) => {
            inserts.push(row);
            return Promise.resolve({ error: insertError });
          },
        };
      },
    },
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn() };

describe('traversal-reflection-emitter (FR-1)', () => {
  it('emits a passing lesson with source=retrospective + metadata.emission_type', async () => {
    const { supabase, inserts } = stubSupabase();
    const result = await emitTraversalReflection(supabase, { ventureId: 'v-42', lessonText: GOOD_LESSON }, { logger: silentLogger });
    expect(result.emitted).toBe(true);
    expect(result.patternId).toMatch(/^PAT-REFL-/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].source).toBe('retrospective');
    expect(inserts[0].metadata.emission_type).toBe(EMISSION_TYPE);
    expect(inserts[0].metadata.venture_id).toBe('v-42');
  });

  it('skips the write (quality_floor) for a boilerplate lesson — never calls insert', async () => {
    const { supabase, inserts } = stubSupabase();
    const result = await emitTraversalReflection(supabase, { ventureId: 'v-42', lessonText: BOILERPLATE_LESSON }, { logger: silentLogger });
    expect(result.emitted).toBe(false);
    expect(result.skipped).toBe('quality_floor');
    expect(inserts).toHaveLength(0);
  });

  it('is fail-open on missing required params (never throws)', async () => {
    const { supabase } = stubSupabase();
    await expect(emitTraversalReflection(supabase, { ventureId: null, lessonText: GOOD_LESSON }, { logger: silentLogger })).resolves.toMatchObject({ emitted: false });
    await expect(emitTraversalReflection(null, { ventureId: 'v-1', lessonText: GOOD_LESSON }, { logger: silentLogger })).resolves.toMatchObject({ emitted: false });
  });

  it('is fail-open on an insert error — logs a warning, never throws', async () => {
    const { supabase } = stubSupabase({ insertError: { message: 'db unavailable' } });
    const result = await emitTraversalReflection(supabase, { ventureId: 'v-42', lessonText: GOOD_LESSON }, { logger: silentLogger });
    expect(result.emitted).toBe(false);
    expect(result.error).toBe('db unavailable');
  });

  it('is fail-open when the recent-lessons lookup itself throws — proceeds without distinctness history', async () => {
    const supabase = {
      from() {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => { throw new Error('lookup failed'); } }) }) }) }),
          insert: (row) => Promise.resolve({ error: null }),
        };
      },
    };
    const result = await emitTraversalReflection(supabase, { ventureId: 'v-42', lessonText: GOOD_LESSON }, { logger: silentLogger });
    expect(result.emitted).toBe(true);
  });

  it('scores 0 (skips) a near-verbatim repeat of a recent lesson for the same venture', async () => {
    const { supabase, inserts } = stubSupabase({ recentLessons: [GOOD_LESSON] });
    const nearRepeat = GOOD_LESSON.replace('undefined', 'empty');
    const result = await emitTraversalReflection(supabase, { ventureId: 'v-42', lessonText: nearRepeat }, { logger: silentLogger });
    expect(result.emitted).toBe(false);
    expect(result.skipped).toBe('quality_floor');
    expect(inserts).toHaveLength(0);
  });

  it('merges caller-supplied metadataExtra alongside the fixed emission_type/venture_id fields', async () => {
    const { supabase, inserts } = stubSupabase();
    await emitTraversalReflection(
      supabase,
      { ventureId: 'v-42', lessonText: GOOD_LESSON, sdId: 'SD-EXAMPLE-001', metadataExtra: { decision_type: 'pivot', hook: 'post_lifecycle_decision' } },
      { logger: silentLogger }
    );
    expect(inserts[0].metadata).toMatchObject({ emission_type: EMISSION_TYPE, venture_id: 'v-42', decision_type: 'pivot', hook: 'post_lifecycle_decision' });
    expect(inserts[0].first_seen_sd_id).toBe('SD-EXAMPLE-001');
  });

  it('generates a deterministic dedup_fingerprint that differs for different lesson text', async () => {
    const { supabase, inserts } = stubSupabase();
    await emitTraversalReflection(supabase, { ventureId: 'v-42', lessonText: GOOD_LESSON }, { logger: silentLogger });
    await emitTraversalReflection(supabase, { ventureId: 'v-42', lessonText: GOOD_LESSON.replace('v-42', 'v-99') }, { logger: silentLogger });
    expect(inserts[0].dedup_fingerprint).not.toBe(inserts[1].dedup_fingerprint);
  });
});
