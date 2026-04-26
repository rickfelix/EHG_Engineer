/**
 * SD-LEO-INFRA-AUTO-TRIGGER-STORIES-FK-FIX-001
 *
 * Tests the FK-fix helpers added to scripts/modules/auto-trigger-stories.mjs:
 *   - validateSdIdInput  (permissive: accepts UUID OR sd_key, rejects garbage)
 *   - validateSdKeyForStoryKey  (strict: required for story_key prefix CHECK constraint)
 *   - lookupSdIdForFk  (resolves either input form to canonical { id, sd_key } from DB)
 *
 * Test scenarios map to PRD-SD-LEO-INFRA-AUTO-TRIGGER-STORIES-FK-FIX-001 test_scenarios:
 *   TS-1, TS-2, TS-3 — lookupSdIdForFk behavior
 *   TS-4              — validateSdIdInput behavior
 *   TS-8 (added)      — validateSdKeyForStoryKey rejects UUIDs
 *   TS-INTEGRATION    — autoTriggerStories end-to-end against live DB row
 *
 * Mock pattern for unit tests: lightweight Supabase stub (chainable) returning
 *   shaped responses. For the integration test, uses the parent SD-MAN-FIX-RESTORE-S17-SINGLE-001
 *   row (UUID id `3ae1ce16-6371-4ec2-b55b-f12abd11cc42`) as a read-only fixture
 *   per TESTING agent recommendation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  validateSdIdInput,
  validateSdKeyForStoryKey,
  lookupSdIdForFk
} from '../../scripts/modules/auto-trigger-stories.mjs';

// --- Mock Supabase client factory --------------------------------------------
// Returns a stub whose .from(...).select(...).or(...).single() resolves to the
// supplied { data, error } payload. Records the .or() filter arg so tests can
// assert on the query shape.
function makeMockSupabase(payload) {
  const calls = { ors: [], froms: [] };
  const stub = {
    from(table) {
      calls.froms.push(table);
      return {
        select() { return this; },
        or(filter) { calls.ors.push(filter); return this; },
        async single() { return payload; }
      };
    },
    _calls: calls
  };
  return stub;
}

// =============================================================================
// validateSdIdInput — permissive validator
// =============================================================================
describe('validateSdIdInput (TS-4 + edge cases)', () => {
  it('accepts a valid sd_key', () => {
    expect(validateSdIdInput('SD-FOO-001')).toBe(true);
  });

  it('accepts a valid UUID', () => {
    expect(validateSdIdInput('3ae1ce16-6371-4ec2-b55b-f12abd11cc42')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(() => validateSdIdInput('')).toThrow(/non-empty string/);
  });

  it('rejects null', () => {
    expect(() => validateSdIdInput(null)).toThrow(/non-empty string/);
  });

  it('rejects garbage (matches neither format)', () => {
    expect(() => validateSdIdInput('not a valid id')).toThrow(/matches neither/);
    expect(() => validateSdIdInput('mixed Case String')).toThrow(/matches neither/);
  });
});

// =============================================================================
// validateSdKeyForStoryKey — strict validator (TS-8: TESTING-recommended)
// =============================================================================
describe('validateSdKeyForStoryKey (TS-8 + edge cases)', () => {
  it('accepts a valid sd_key', () => {
    expect(validateSdKeyForStoryKey('SD-FOO-001')).toBe(true);
  });

  it('rejects a UUID (story_key CHECK constraint requires SD-key format)', () => {
    expect(() =>
      validateSdKeyForStoryKey('3ae1ce16-6371-4ec2-b55b-f12abd11cc42')
    ).toThrow(/UUID/);
  });

  it('rejects lowercase', () => {
    expect(() => validateSdKeyForStoryKey('sd-foo-001')).toThrow(/invalid characters/);
  });

  it('rejects characters outside the [A-Z0-9-] character class', () => {
    expect(() => validateSdKeyForStoryKey('SD-FOO_001')).toThrow(/invalid characters/);
  });
});

// =============================================================================
// lookupSdIdForFk — DB lookup helper (TS-1, TS-2, TS-3) — UNIT (mocked)
// =============================================================================
describe('lookupSdIdForFk (TS-1, TS-2, TS-3) — mocked', () => {
  it('TS-1: resolves sd_key input to { id: sd_key, sd_key } when row id == sd_key', async () => {
    const supabase = makeMockSupabase({
      data: { id: 'SD-FOO-001', sd_key: 'SD-FOO-001' },
      error: null
    });
    const result = await lookupSdIdForFk(supabase, 'SD-FOO-001');
    expect(result).toEqual({ id: 'SD-FOO-001', sd_key: 'SD-FOO-001' });
    expect(supabase._calls.ors[0]).toContain('id.eq.SD-FOO-001');
    expect(supabase._calls.ors[0]).toContain('sd_key.eq.SD-FOO-001');
  });

  it('TS-2: resolves sd_key input to UUID id for bimodal-id SD', async () => {
    // Bimodal: id is UUID, sd_key is the friendly key
    const supabase = makeMockSupabase({
      data: {
        id: '3ae1ce16-6371-4ec2-b55b-f12abd11cc42',
        sd_key: 'SD-MAN-FIX-RESTORE-S17-SINGLE-001'
      },
      error: null
    });
    const result = await lookupSdIdForFk(supabase, 'SD-MAN-FIX-RESTORE-S17-SINGLE-001');
    // CRITICAL: returns the UUID, NOT the sd_key
    expect(result.id).toBe('3ae1ce16-6371-4ec2-b55b-f12abd11cc42');
    expect(result.sd_key).toBe('SD-MAN-FIX-RESTORE-S17-SINGLE-001');
  });

  it('TS-2b: resolves UUID input to the same UUID id (input == id case)', async () => {
    const supabase = makeMockSupabase({
      data: {
        id: '3ae1ce16-6371-4ec2-b55b-f12abd11cc42',
        sd_key: 'SD-MAN-FIX-RESTORE-S17-SINGLE-001'
      },
      error: null
    });
    const result = await lookupSdIdForFk(supabase, '3ae1ce16-6371-4ec2-b55b-f12abd11cc42');
    expect(result.id).toBe('3ae1ce16-6371-4ec2-b55b-f12abd11cc42');
  });

  it('TS-3: throws clear error when no row matches', async () => {
    const supabase = makeMockSupabase({
      data: null,
      error: { message: 'PGRST116: no rows returned' }
    });
    await expect(
      lookupSdIdForFk(supabase, 'SD-DOES-NOT-EXIST-999')
    ).rejects.toThrow(/SD not found/);
    await expect(
      lookupSdIdForFk(supabase, 'SD-DOES-NOT-EXIST-999')
    ).rejects.toThrow(/SD-DOES-NOT-EXIST-999/);
  });

  it('throws when both data and error are absent (defensive)', async () => {
    const supabase = makeMockSupabase({ data: null, error: null });
    await expect(
      lookupSdIdForFk(supabase, 'SD-MISSING-001')
    ).rejects.toThrow(/SD not found/);
  });
});

// =============================================================================
// lookupSdIdForFk — INTEGRATION against live DB (read-only fixture)
// =============================================================================
//
// Uses the parent SD-MAN-FIX-RESTORE-S17-SINGLE-001 row that originally hit this
// FK bug — its `id` is a UUID (`3ae1ce16-6371-4ec2-b55b-f12abd11cc42`), making
// it the canonical bimodal-id fixture. Read-only — no inserts, no cleanup needed.
//
// Skips automatically when SUPABASE_SERVICE_ROLE_KEY is not set (e.g., CI without
// secrets, or local without .env).
// -----------------------------------------------------------------------------
describe('lookupSdIdForFk — INTEGRATION (live DB, read-only)', () => {
  let supabase;
  const PARENT_SD_KEY = 'SD-MAN-FIX-RESTORE-S17-SINGLE-001';
  const PARENT_SD_UUID = '3ae1ce16-6371-4ec2-b55b-f12abd11cc42';

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('   ⚠️  SUPABASE_SERVICE_ROLE_KEY not set — skipping integration tests');
      return;
    }
    const { getValidatedSupabaseClient } = await import('../helpers/database-helpers.js');
    try {
      supabase = await getValidatedSupabaseClient();
    } catch (err) {
      console.warn(`   ⚠️  DB unavailable — skipping integration tests: ${err.message}`);
      supabase = null;
    }
  });

  it('resolves sd_key input to canonical UUID id (live bimodal SD fixture)', async () => {
    if (!supabase) return;
    const result = await lookupSdIdForFk(supabase, PARENT_SD_KEY);
    expect(result.id).toBe(PARENT_SD_UUID);
    expect(result.sd_key).toBe(PARENT_SD_KEY);
  });

  it('resolves UUID input to itself (live bimodal SD fixture, reverse direction)', async () => {
    if (!supabase) return;
    const result = await lookupSdIdForFk(supabase, PARENT_SD_UUID);
    expect(result.id).toBe(PARENT_SD_UUID);
    expect(result.sd_key).toBe(PARENT_SD_KEY);
  });

  it('throws on a definitely-non-existent SD key', async () => {
    if (!supabase) return;
    await expect(
      lookupSdIdForFk(supabase, 'SD-DOES-NOT-EXIST-9999999')
    ).rejects.toThrow(/SD not found/);
  });
});
