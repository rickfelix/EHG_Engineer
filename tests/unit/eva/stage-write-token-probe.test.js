/**
 * SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 -- stage-write-token-probe.js, mirroring
 * lib/ship/repo-column-probe.mjs's proven pattern for a chairman-gated column that may ship
 * un-applied for an indeterminate period. Every writer must degrade gracefully, never error.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  probeStageWriteTokenExists,
  stageWriteTokenField,
  __resetStageWriteTokenProbeForTests,
} from '../../../lib/eva/stage-write-token-probe.js';

beforeEach(() => {
  __resetStageWriteTokenProbeForTests();
});

function makeSupabase(error) {
  return {
    from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: error ? null : [], error }) }) }),
  };
}

describe('probeStageWriteTokenExists', () => {
  it('returns true when the select succeeds (column present)', async () => {
    expect(await probeStageWriteTokenExists(makeSupabase(null))).toBe(true);
  });

  it('returns false on 42703 (Postgres undefined_column)', async () => {
    expect(await probeStageWriteTokenExists(makeSupabase({ code: '42703', message: 'column "stage_write_token" does not exist' }))).toBe(false);
  });

  it('returns false on PGRST204 (PostgREST schema-cache miss)', async () => {
    expect(await probeStageWriteTokenExists(makeSupabase({ code: 'PGRST204', message: 'schema cache' }))).toBe(false);
  });

  it('returns false (uncached) on an unrelated error, and retries fresh next call', async () => {
    const flaky = makeSupabase({ code: 'ECONNRESET', message: 'network blip' });
    expect(await probeStageWriteTokenExists(flaky)).toBe(false);
    expect(await probeStageWriteTokenExists(makeSupabase(null))).toBe(true);
  });

  it('caches a confirmed "absent" result across calls, even if supabase would now say present', async () => {
    await probeStageWriteTokenExists(makeSupabase({ code: '42703', message: 'nope' }));
    expect(await probeStageWriteTokenExists(makeSupabase(null))).toBe(false);
  });

  it('caches a confirmed "present" result across calls', async () => {
    await probeStageWriteTokenExists(makeSupabase(null));
    expect(await probeStageWriteTokenExists(makeSupabase({ code: '42703' }))).toBe(true);
  });

  it('returns false when supabase is missing', async () => {
    expect(await probeStageWriteTokenExists(null)).toBe(false);
  });

  // REGRESSION (Run Unit Tier, CI): a mock supabase that doesn't implement .select()/.limit() at
  // all THROWS a TypeError rather than resolving with {error} -- caught here so it can never
  // regress again. Real callers' existing test mocks (tests/unit/venture-ceo-task-completion-
  // artifact-check.test.js, tests/unit/eva/stage-execution-worker-high-consequence-mint.test.js)
  // only implement .from().update() with no .select(), and the exception previously propagated
  // out of this probe and into the CALLER's own try/catch, silently skipping the caller's entire
  // write -- not just the stamp.
  it('returns false (does not throw) when supabase.from(...).select is not a function', async () => {
    const throwingSupabase = { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    await expect(probeStageWriteTokenExists(throwingSupabase)).resolves.toBe(false);
  });

  it('a thrown exception is not cached -- a subsequent healthy call still flips to true', async () => {
    const throwingSupabase = { from: () => ({}) };
    expect(await probeStageWriteTokenExists(throwingSupabase)).toBe(false);
    expect(await probeStageWriteTokenExists(makeSupabase(null))).toBe(true);
  });
});

describe('stageWriteTokenField', () => {
  it('returns a spreadable {stage_write_token} object when the column exists', async () => {
    expect(await stageWriteTokenField(makeSupabase(null), 'eva-run.js')).toEqual({ stage_write_token: 'eva-run.js' });
  });

  it('returns {} (no-op spread) when the column is absent', async () => {
    expect(await stageWriteTokenField(makeSupabase({ code: '42703' }), 'eva-run.js')).toEqual({});
  });
});
