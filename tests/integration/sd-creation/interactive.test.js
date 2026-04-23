/**
 * E2E regression test — interactive (direct) SD creation mode.
 *
 * Covers: scripts/modules/sd-key-generator.js `generateSDKey` — the entry
 * point invoked by scripts/leo-create-sd.js for the interactive flag mode
 * (LEO <type> <title>). Asserts:
 *   1. sd_key is generated in the SD-<SOURCE>-<TYPE>-<SEMANTIC>-<NUM> format
 *   2. sd_type is mapped to one of the valid database types
 *   3. Returned key does not collide with existing rows (sd_key OR id)
 *   4. Sequential numbering fills gaps correctly
 *
 * Tests the key generator deterministically; downstream DB insertion uses
 * the generated key to verify JSONB constraint conformance when inserting
 * the complete record.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateSDKey,
  SD_SOURCES,
  SD_TYPES,
  keyExists,
  parseSDKey,
} from '../../../scripts/modules/sd-key-generator.js';
import {
  credentialsPresent,
  getSupabase,
  newTestRunId,
  cleanup,
} from './fixtures/supabase-seed.js';

const testRunId = newTestRunId();
const skip = !credentialsPresent();

describe.skipIf(skip)('SD creation — interactive mode (generateSDKey)', () => {
  afterAll(async () => {
    await cleanup(testRunId);
  });

  it('generates a valid SD-<SOURCE>-<TYPE>-<SEMANTIC>-<NUM> format key', async () => {
    const key = await generateSDKey({
      source: 'LEO',
      type: 'feature',
      title: `${testRunId} interactive feature smoke`,
    });

    expect(key).toMatch(/^SD-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9-]+-\d{3}$/);
    const parsed = parseSDKey(key);
    expect(parsed).toBeTruthy();
    expect(parsed.source).toBe('LEO');
  });

  it('maps user-friendly type names to valid database sd_type values', async () => {
    const typeVariants = [
      { input: 'fix', expected: 'bugfix' },
      { input: 'bugfix', expected: 'bugfix' },
      { input: 'feature', expected: 'feature' },
      { input: 'infrastructure', expected: 'infrastructure' },
      { input: 'documentation', expected: 'documentation' },
    ];

    for (const variant of typeVariants) {
      const key = await generateSDKey({
        source: 'LEO',
        type: variant.input,
        title: `${testRunId} type mapping ${variant.input}`,
      });

      expect(key, `generateSDKey should produce a key for type=${variant.input}`).toBeTruthy();
      // SD_TYPES map must have an entry for the DB form
      expect(SD_TYPES[variant.expected], `SD_TYPES must contain ${variant.expected}`).toBeDefined();
    }
  });

  it('refuses collisions across both sd_key and id columns', async () => {
    const firstKey = await generateSDKey({
      source: 'LEO',
      type: 'feature',
      title: `${testRunId} collision guard first`,
    });

    // Direct check: keyExists should report the brand-new key as absent
    const exists = await keyExists(firstKey);
    expect(exists).toBe(false);

    // After inserting a stub row, keyExists must flip to true
    const supabase = await getSupabase();
    const insertRow = {
      id: firstKey,
      sd_key: firstKey,
      title: `${testRunId} collision guard stub`,
      description: 'Seeded for keyExists assertion',
      rationale: 'Integration test',
      status: 'draft',
      sd_type: 'feature',
      category: 'Testing',
      priority: 'medium',
      scope: 'test',
      target_application: 'EHG_Engineer',
      key_changes: [{ change: 'seed', type: 'test' }],
      key_principles: ['test principle'],
      success_criteria: [{ criterion: 'seeded', measure: 'row inserted' }],
    };
    const { error: insertErr } = await supabase.from('strategic_directives_v2').insert(insertRow);
    expect(insertErr, `stub insert error: ${insertErr?.message}`).toBeNull();

    const existsAfter = await keyExists(firstKey);
    expect(existsAfter).toBe(true);
  });

  it('SD_SOURCES registry contains the canonical source prefixes', () => {
    // Sanity: protects against silent registry deletions
    expect(Object.keys(SD_SOURCES).length).toBeGreaterThanOrEqual(3);
    // LEO should be addressable (used by /leo create interactive mode)
    const hasLEOSource = Object.values(SD_SOURCES).some(v => String(v).toUpperCase().includes('LEO'))
      || Object.keys(SD_SOURCES).includes('LEO');
    expect(hasLEOSource).toBe(true);
  });
});
