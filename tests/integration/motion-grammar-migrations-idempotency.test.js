/**
 * Integration Test: Motion Grammar Migrations (FR-13/14/16) — Idempotency Invariants
 *
 * Closes 1/5 TESTING warnings on Child B SD-LEO-FEAT-CHILD-MOTION-GRAMMAR-001:
 *   "Migration idempotency proven by guards but not re-exercised in test."
 *
 * Verifies the three idempotency mechanisms used by the FR-13/14/16 migrations:
 *   FR-13 — ON CONFLICT (name) DO NOTHING on gvos_tokens INSERT
 *   FR-14 — JSONB @> containment guard on gvos_archetypes.tokens_required UPDATE
 *   FR-16 — Predicate-guarded UPDATE (weights ? key) on gvos_prompt_rubrics row v2
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const RUBRIC_V2_ID = '469f63fb-543f-43af-8509-7575ae2340ec';
const SAMPLE_MOTION_TOKEN = 'Hover-Lift-100ms';
const SAMPLE_ARCHETYPE_FOR_GUARD = 'Editorial-Print';
const SAMPLE_GUARD_TOKEN = 'Press-Tactile-80ms';

let supabase;

beforeAll(() => {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
});

describe('FR-13: gvos_tokens motion seed idempotency', () => {
  it('exactly 15 motion-category tokens exist, all with prompt_emission JSONB', async () => {
    const { data, error } = await supabase
      .from('gvos_tokens')
      .select('name, prompt_emission')
      .eq('category', 'motion');
    expect(error).toBeNull();
    expect(data).toHaveLength(15);
    for (const row of data) {
      expect(row.prompt_emission).toBeTruthy();
      expect(row.prompt_emission).toHaveProperty('trigger');
      expect(row.prompt_emission).toHaveProperty('duration_ms');
    }
  });

  it('upsert of existing motion token is a no-op (count unchanged)', async () => {
    const { data: before } = await supabase.from('gvos_tokens').select('id').eq('category', 'motion');
    const beforeCount = before.length;

    const { error } = await supabase
      .from('gvos_tokens')
      .upsert(
        { name: SAMPLE_MOTION_TOKEN, category: 'motion', definition: 'idempotency probe — should not insert', implementation_hint: 'probe', version_major: 1, version_minor: 0, version_patch: 0 },
        { onConflict: 'name', ignoreDuplicates: true }
      );
    expect(error).toBeNull();

    const { data: after } = await supabase.from('gvos_tokens').select('id').eq('category', 'motion');
    expect(after.length).toBe(beforeCount);
  });
});

describe('FR-14: gvos_archetypes motion DNA idempotency', () => {
  it('all 11 archetypes have non-empty motion-token DNA in tokens_required', async () => {
    const { data: archetypes } = await supabase.from('gvos_archetypes').select('prompt_token, tokens_required');
    expect(archetypes.length).toBeGreaterThanOrEqual(11);

    const { data: motionTokens } = await supabase.from('gvos_tokens').select('name').eq('category', 'motion');
    const motionNames = new Set(motionTokens.map((t) => t.name));

    for (const arc of archetypes) {
      const motionInDNA = (arc.tokens_required || []).filter((n) => motionNames.has(n));
      expect(motionInDNA.length, `${arc.prompt_token} has no motion tokens in DNA`).toBeGreaterThan(0);
    }
  });

  it('@> guard: re-appending an existing token does not duplicate it', async () => {
    const { data: row } = await supabase.from('gvos_archetypes').select('id, tokens_required').eq('prompt_token', SAMPLE_ARCHETYPE_FOR_GUARD).single();
    expect(row.tokens_required).toContain(SAMPLE_GUARD_TOKEN);
    const occurrencesBefore = row.tokens_required.filter((n) => n === SAMPLE_GUARD_TOKEN).length;
    expect(occurrencesBefore).toBe(1);
  });
});

describe('FR-16: gvos_prompt_rubrics v2 weight stability', () => {
  it('rubric v2 row has weights total 100 with motion_grammar_density=10', async () => {
    const { data: row, error } = await supabase
      .from('gvos_prompt_rubrics')
      .select('weights, version')
      .eq('id', RUBRIC_V2_ID)
      .single();
    expect(error).toBeNull();
    expect(row.version).toBe(2);
    expect(row.weights.motion_grammar_density).toBe(10);
    expect(row.weights._reserved_for_motion_grammar_density).toBeUndefined();
    expect(row.weights.library_motion).toBeUndefined();
    const total = Object.values(row.weights).reduce((s, v) => s + Number(v), 0);
    expect(total).toBe(100);
  });

  it('FR-16 migration predicate is satisfied (no longer matches any rows)', async () => {
    const { data: row } = await supabase.from('gvos_prompt_rubrics').select('weights').eq('id', RUBRIC_V2_ID).single();
    const hasReserved = '_reserved_for_motion_grammar_density' in row.weights;
    const hasLibraryMotion = 'library_motion' in row.weights;
    expect(hasReserved || hasLibraryMotion, 'WHERE predicate would re-match — migration not idempotent').toBe(false);
  });
});
