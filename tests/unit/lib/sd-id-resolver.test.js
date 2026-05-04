/**
 * Tests for scripts/lib/sd-id-resolver.js (SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001).
 *
 * Mirrors the chainable-Supabase-mock pattern from
 * tests/unit/auto-trigger-stories-fk-fix.test.js. TS-IDs map to
 * PRD test_scenarios.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { resolveSdInput, resolveSdInputOrNull } from '../../../scripts/lib/sd-id-resolver.js';

function makeMockSupabase(payload, opts = {}) {
  const calls = { ors: [], froms: [], selects: [] };
  const stub = {
    from(table) {
      calls.froms.push(table);
      return {
        select(cols) { calls.selects.push(cols); return this; },
        or(filter) { calls.ors.push(filter); return this; },
        async maybeSingle() {
          if (opts.delay) await new Promise(r => setTimeout(r, opts.delay));
          return payload;
        },
        async single() {
          if (opts.delay) await new Promise(r => setTimeout(r, opts.delay));
          return payload;
        },
      };
    },
    _calls: calls,
  };
  return stub;
}

describe('resolveSdInput — input validation', () => {
  it('TS-4a: null input throws TypeError /non-empty string/', async () => {
    const fromSpy = vi.fn();
    const supabase = { from: fromSpy };
    await expect(resolveSdInput(null, supabase)).rejects.toThrow(TypeError);
    await expect(resolveSdInput(null, supabase)).rejects.toThrow(/non-empty string/);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('TS-4b: undefined input throws TypeError', async () => {
    const fromSpy = vi.fn();
    const supabase = { from: fromSpy };
    await expect(resolveSdInput(undefined, supabase)).rejects.toThrow(TypeError);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('TS-5: empty string throws TypeError', async () => {
    const fromSpy = vi.fn();
    const supabase = { from: fromSpy };
    await expect(resolveSdInput('', supabase)).rejects.toThrow(TypeError);
    await expect(resolveSdInput('   ', supabase)).rejects.toThrow(TypeError);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('TS-6: non-string input throws TypeError pre-DB', async () => {
    const fromSpy = vi.fn();
    const supabase = { from: fromSpy };
    await expect(resolveSdInput(42, supabase)).rejects.toThrow(TypeError);
    await expect(resolveSdInput({}, supabase)).rejects.toThrow(TypeError);
    await expect(resolveSdInput(true, supabase)).rejects.toThrow(TypeError);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('TS-8: malformed input (matches neither regex) throws TypeError pre-DB', async () => {
    const fromSpy = vi.fn();
    const supabase = { from: fromSpy };
    await expect(resolveSdInput('not a valid id', supabase)).rejects.toThrow(/matches neither/);
    await expect(resolveSdInput('mixed Case With Spaces', supabase)).rejects.toThrow(/matches neither/);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

describe('resolveSdInput — happy path (mocked)', () => {
  it('TS-1: sd_key input returns {sdId, sdKey, sd}; .or() filter contains both clauses', async () => {
    const row = { id: 'SD-FOO-001', sd_key: 'SD-FOO-001', title: 'Foo', status: 'draft' };
    const supabase = makeMockSupabase({ data: row, error: null });
    const result = await resolveSdInput('SD-FOO-001', supabase);
    expect(result).toEqual({
      sdId: 'SD-FOO-001',
      sdKey: 'SD-FOO-001',
      sd: row,
    });
    expect(supabase._calls.ors[0]).toContain('id.eq.SD-FOO-001');
    expect(supabase._calls.ors[0]).toContain('sd_key.eq.SD-FOO-001');
    expect(supabase._calls.froms[0]).toBe('strategic_directives_v2');
  });

  it('TS-2: UUID input where row.id is the UUID itself', async () => {
    const uuid = '3ae1ce16-6371-4ec2-b55b-f12abd11cc42';
    const row = { id: uuid, sd_key: 'SD-MAN-FIX-RESTORE-S17-SINGLE-001', title: 'X' };
    const supabase = makeMockSupabase({ data: row, error: null });
    const result = await resolveSdInput(uuid, supabase);
    expect(result.sdId).toBe(uuid);
    expect(result.sdKey).toBe('SD-MAN-FIX-RESTORE-S17-SINGLE-001');
    expect(result.sd).toBe(row);
  });

  it('TS-3: bimodal SD — sd_key form and UUID form return identical canonical row', async () => {
    const uuid = '3ae1ce16-6371-4ec2-b55b-f12abd11cc42';
    const row = { id: uuid, sd_key: 'SD-MAN-FIX-RESTORE-S17-SINGLE-001', status: 'completed' };
    const supabase1 = makeMockSupabase({ data: row, error: null });
    const supabase2 = makeMockSupabase({ data: row, error: null });
    const r1 = await resolveSdInput('SD-MAN-FIX-RESTORE-S17-SINGLE-001', supabase1);
    const r2 = await resolveSdInput(uuid, supabase2);
    expect(r1).toEqual(r2);
  });

  it('falls back sdKey to row.id when sd_key column is null (legacy SD with no sd_key)', async () => {
    const row = { id: 'SD-LEGACY-001', sd_key: null, title: 'Legacy' };
    const supabase = makeMockSupabase({ data: row, error: null });
    const result = await resolveSdInput('SD-LEGACY-001', supabase);
    expect(result.sdKey).toBe('SD-LEGACY-001');
  });
});

describe('resolveSdInput — error paths (mocked)', () => {
  it('TS-7: not-found throws Error with input value embedded in message', async () => {
    const supabase = makeMockSupabase({ data: null, error: null });
    await expect(resolveSdInput('SD-DOES-NOT-EXIST-999', supabase)).rejects.toThrow(/SD not found/);
    await expect(resolveSdInput('SD-DOES-NOT-EXIST-999', supabase)).rejects.toThrow(/SD-DOES-NOT-EXIST-999/);
  });

  it('TS-9: DB error propagates with original error message embedded', async () => {
    const supabase = makeMockSupabase({
      data: null,
      error: { message: 'connection refused' },
    });
    await expect(resolveSdInput('SD-FOO-001', supabase)).rejects.toThrow(/DB error/);
    await expect(resolveSdInput('SD-FOO-001', supabase)).rejects.toThrow(/connection refused/);
  });

  it('not-found is distinguished from DB error in message text', async () => {
    const supabaseNotFound = makeMockSupabase({ data: null, error: null });
    await expect(resolveSdInput('SD-MISSING-001', supabaseNotFound)).rejects.toThrow(/SD not found/);

    const supabaseError = makeMockSupabase({ data: null, error: { message: 'PGRST500' } });
    await expect(resolveSdInput('SD-MISSING-001', supabaseError)).rejects.toThrow(/DB error/);
  });
});

describe('resolveSdInputOrNull — graceful variant', () => {
  it('returns {sd: null} on not-found instead of throwing', async () => {
    const supabase = makeMockSupabase({ data: null, error: null });
    const result = await resolveSdInputOrNull('SD-MISSING-001', supabase);
    expect(result).toEqual({ sdId: null, sdKey: null, sd: null });
  });

  it('returns {sd: null} on DB error', async () => {
    const supabase = makeMockSupabase({ data: null, error: { message: 'connection refused' } });
    const result = await resolveSdInputOrNull('SD-FOO-001', supabase);
    expect(result.sd).toBeNull();
  });

  it('returns canonical triple on success (same as resolveSdInput)', async () => {
    const row = { id: 'SD-FOO-001', sd_key: 'SD-FOO-001', title: 'Foo' };
    const supabase = makeMockSupabase({ data: row, error: null });
    const result = await resolveSdInputOrNull('SD-FOO-001', supabase);
    expect(result.sdId).toBe('SD-FOO-001');
    expect(result.sd).toBe(row);
  });

  it('still throws TypeError on input-validation errors', async () => {
    const supabase = makeMockSupabase({ data: null, error: null });
    await expect(resolveSdInputOrNull(null, supabase)).rejects.toThrow(TypeError);
    await expect(resolveSdInputOrNull(42, supabase)).rejects.toThrow(TypeError);
  });
});

// =============================================================================
// INTEGRATION (TS-10): live DB read-only fixture
// =============================================================================
// Uses bimodal fixture SD-MAN-FIX-RESTORE-S17-SINGLE-001 (UUID 3ae1ce16-...).
// Skips automatically when SUPABASE_SERVICE_ROLE_KEY is absent.
describe('resolveSdInput — INTEGRATION (live DB, read-only)', () => {
  let supabase;
  const FIXTURE_KEY = 'SD-MAN-FIX-RESTORE-S17-SINGLE-001';
  const FIXTURE_UUID = '3ae1ce16-6371-4ec2-b55b-f12abd11cc42';

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('   ⚠️  SUPABASE_SERVICE_ROLE_KEY not set — skipping integration tests');
      return;
    }
    try {
      const { getValidatedSupabaseClient } = await import('../../helpers/database-helpers.js');
      supabase = await getValidatedSupabaseClient();
    } catch (err) {
      console.warn(`   ⚠️  DB unavailable — skipping integration tests: ${err.message}`);
      supabase = null;
    }
  });

  it('TS-10a: resolves sd_key form to canonical row', async () => {
    if (!supabase) return;
    const result = await resolveSdInput(FIXTURE_KEY, supabase);
    expect(result.sdId).toBe(FIXTURE_UUID);
    expect(result.sdKey).toBe(FIXTURE_KEY);
    expect(result.sd).toBeTruthy();
    expect(result.sd.id).toBe(FIXTURE_UUID);
  });

  it('TS-10b: resolves UUID form to identical canonical row', async () => {
    if (!supabase) return;
    const result = await resolveSdInput(FIXTURE_UUID, supabase);
    expect(result.sdId).toBe(FIXTURE_UUID);
    expect(result.sdKey).toBe(FIXTURE_KEY);
  });

  it('TS-10c: throws on definitely-non-existent SD', async () => {
    if (!supabase) return;
    await expect(
      resolveSdInput('SD-DOES-NOT-EXIST-9999999', supabase)
    ).rejects.toThrow(/SD not found/);
  });
});
