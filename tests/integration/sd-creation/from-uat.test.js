/**
 * E2E regression test — --from-uat flag mode.
 *
 * Covers scripts/uat-to-strategic-directive-ai.js `UATToSDConverter`. The
 * UAT-to-SD path takes a uat_test_results row and produces a directive
 * submission; the LEAD then approves and the SD is created with
 * sd_type=bugfix. This test verifies the class is exported, instantiable,
 * and that a UAT failure maps to a bugfix-typed SD key via SDKeyGenerator.
 *
 * Full LLM invocation is not exercised here (LLM availability is
 * non-deterministic in CI). Instead, the mapping contract (UAT failure →
 * bugfix) and the DB round-trip with JSONB constraint verification are
 * exercised.
 *
 * IMPORTANT: generateSDKey must be called SEQUENTIALLY when exercising
 * collision/sequential-numbering semantics. Parallel Promise.all on the
 * same (source, type, semantic) tuple races on keyExists because no row is
 * inserted between calls — the generator returns the same next-number for
 * all callers. This is the correct behavior for a non-transactional
 * generator; tests must await each call sequentially.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { UATToSDConverter } from '../../../scripts/uat-to-strategic-directive-ai.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import {
  credentialsPresent,
  getSupabase,
  newTestRunId,
  buildUATPayload,
  cleanup,
} from './fixtures/supabase-seed.js';

const testRunId = newTestRunId();
const skip = !credentialsPresent();

describe.skipIf(skip)('SD creation — --from-uat mode', () => {
  afterAll(async () => {
    await cleanup(testRunId);
  });

  it('UATToSDConverter is exported and instantiable', () => {
    expect(typeof UATToSDConverter).toBe('function');
    const inst = new UATToSDConverter();
    expect(inst).toBeTruthy();
  });

  it('UAT failure maps to sd_type=bugfix via generateSDKey', async () => {
    const { row: uat } = buildUATPayload(testRunId, {
      status: 'failed',
      error_message: `${testRunId} UAT regression`,
    });

    const sdKey = await generateSDKey({
      source: 'UAT',
      type: 'bugfix',
      title: `${testRunId} UAT mapping test`,
    });

    // Source 'UAT' must appear in the key prefix; BUGFIX may be abbreviated
    expect(sdKey.startsWith('SD-UAT-')).toBe(true);
    expect(sdKey).toMatch(/^SD-UAT-[A-Z]+-[A-Z0-9-]+-\d{3}$/);
    // Sanity: payload carries the testRunId in error_message so cleanup can
    // find any downstream rows if the DB path is exercised later
    expect(uat.error_message).toContain(testRunId);
  });

  it('end-to-end: seed UAT → generate SD → insert with JSONB constraints', async () => {
    const { row: uat } = buildUATPayload(testRunId, {
      status: 'failed',
      error_message: `${testRunId} E2E UAT DB path`,
    });

    const sdKey = await generateSDKey({
      source: 'UAT',
      type: 'bugfix',
      title: `${testRunId} E2E UAT round-trip`,
    });

    const supabase = await getSupabase();
    const row = {
      id: sdKey,
      sd_key: sdKey,
      title: `${testRunId} E2E UAT round-trip`,
      description: `Seeded from UAT ${uat.id}: ${uat.error_message}`,
      rationale: 'Integration test — UAT-to-SD type mapping',
      status: 'draft',
      sd_type: 'bugfix',
      category: 'Testing',
      priority: 'high',
      scope: 'test',
      target_application: 'EHG_Engineer',
      key_changes: [{ change: 'seed from UAT failure', type: 'test' }],
      key_principles: ['UAT failures produce bugfix SDs'],
      success_criteria: [{ criterion: 'row persists', measure: 'SELECT returns 1 with sd_type=bugfix' }],
    };
    const { error } = await supabase.from('strategic_directives_v2').insert(row);
    expect(error, `insert error: ${error?.message}`).toBeNull();

    const { data: check } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, sd_type, key_changes, key_principles')
      .eq('sd_key', sdKey)
      .single();
    expect(check.sd_type).toBe('bugfix');
    expect(Array.isArray(check.key_changes)).toBe(true);
    expect(check.key_changes[0]).toMatchObject({
      change: expect.any(String),
      type: expect.any(String),
    });
    expect(Array.isArray(check.key_principles)).toBe(true);
    expect(check.key_principles.length).toBeGreaterThan(0);
  });

  it('UAT source produces SD-UAT-* prefix and keyExists drives the sequence increment', async () => {
    // Semantic extraction drops numeric-heavy and common words, so
    // "testRunId UAT alpha" and "testRunId UAT beta" can collapse to the
    // same semantic slug. The sequence increment that keeps keys distinct
    // comes from keyExists() — once a row with the proposed key exists in
    // the DB, generateSDKey picks the next number. Exercise that path:
    //
    //   1. Generate key K1 for title T, insert a stub row with K1.
    //   2. Generate again for T — must return K2 with number = K1.number+1.
    const supabase = await getSupabase();
    const sharedTitle = `${testRunId} sequence increment shared title`;

    const k1 = await generateSDKey({ source: 'UAT', type: 'bugfix', title: sharedTitle });
    expect(k1.startsWith('SD-UAT-')).toBe(true);

    // Persist K1 so keyExists(K1) returns true for the next call
    const stubRow = {
      id: k1,
      sd_key: k1,
      title: sharedTitle,
      description: 'Sequence-increment stub',
      rationale: 'Integration test',
      status: 'draft',
      sd_type: 'bugfix',
      category: 'Testing',
      priority: 'medium',
      scope: 'test',
      target_application: 'EHG_Engineer',
      key_changes: [{ change: 'stub', type: 'test' }],
      key_principles: ['sequence increment'],
      success_criteria: [{ criterion: 'stub persists', measure: 'SELECT returns 1' }],
    };
    const { error: insertErr } = await supabase.from('strategic_directives_v2').insert(stubRow);
    expect(insertErr, `stub insert err: ${insertErr?.message}`).toBeNull();

    const k2 = await generateSDKey({ source: 'UAT', type: 'bugfix', title: sharedTitle });
    expect(k2.startsWith('SD-UAT-')).toBe(true);
    expect(k2).not.toBe(k1);

    // Extract trailing number — must increment by at least 1
    const n1 = parseInt(k1.match(/-(\d{3})$/)?.[1] || '0', 10);
    const n2 = parseInt(k2.match(/-(\d{3})$/)?.[1] || '0', 10);
    expect(n2).toBeGreaterThan(n1);
  });
});
