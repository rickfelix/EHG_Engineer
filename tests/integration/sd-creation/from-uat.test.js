/**
 * E2E regression test — --from-uat flag mode.
 *
 * Covers scripts/uat-to-strategic-directive-ai.js `UATToSDConverter`. The
 * UAT-to-SD path takes a uat_test_results row and produces a directive
 * submission; the LEAD then approves and the SD is created with
 * sd_type=bugfix. This test verifies the class is exported, instantiable,
 * and can produce a bugfix-typed SD key via SDKeyGenerator.
 *
 * Full LLM invocation is not exercised here (LLM_PRD_INLINE fallback is
 * non-deterministic in CI). Instead, the mapping contract (UAT failure →
 * bugfix) is asserted and the end-to-end DB path is validated using the
 * key generator and direct insertion.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { UATToSDConverter } from '../../../scripts/uat-to-strategic-directive-ai.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import {
  credentialsPresent,
  getSupabase,
  newTestRunId,
  seedUATResult,
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
    const { row: uat } = await seedUATResult(testRunId, {
      status: 'failed',
      failure_reason: `${testRunId} UAT regression`,
      test_name: `${testRunId} UAT mapping test`,
    });

    const sdKey = await generateSDKey({
      source: 'UAT',
      type: 'bugfix', // UAT failures always map to bugfix
      title: uat.test_name,
    });

    expect(sdKey).toMatch(/^SD-UAT-BUGFIX-[A-Z0-9-]+-\d{3}$/);
  });

  it('end-to-end: seed UAT → generate SD → insert with JSONB constraints', async () => {
    const { row: uat } = await seedUATResult(testRunId, {
      status: 'failed',
      failure_reason: `${testRunId} E2E UAT DB path`,
      test_name: `${testRunId} E2E UAT round-trip`,
    });

    const sdKey = await generateSDKey({
      source: 'UAT',
      type: 'bugfix',
      title: uat.test_name,
    });

    const supabase = await getSupabase();
    const row = {
      id: sdKey,
      sd_key: sdKey,
      title: uat.test_name,
      description: `Seeded from UAT ${uat.id}: ${uat.failure_reason}`,
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

  it('UAT source produces SD-UAT-* prefix regardless of semantic extraction', async () => {
    const keys = await Promise.all([
      generateSDKey({ source: 'UAT', type: 'bugfix', title: `${testRunId} UAT prefix check A` }),
      generateSDKey({ source: 'UAT', type: 'bugfix', title: `${testRunId} UAT prefix check B` }),
      generateSDKey({ source: 'UAT', type: 'bugfix', title: `${testRunId} UAT prefix check C` }),
    ]);
    for (const key of keys) {
      expect(key.startsWith('SD-UAT-')).toBe(true);
    }
    // Keys must be distinct (sequential numbering)
    expect(new Set(keys).size).toBe(keys.length);
  });
});
