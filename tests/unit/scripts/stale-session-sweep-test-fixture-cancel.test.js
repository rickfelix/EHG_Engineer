/**
 * QF-20260704-545: auto-cancel leaked SD-TEST-* fixtures (draft/in_progress/active,
 * unclaimed) that a harness test run left behind mid-flight, once they've sat stale
 * for >24h. Guard: only ever touches sd_key ilike 'SD-TEST-%' -- real SDs never use
 * that prefix (isTestFixtureSdKey), so production work is structurally unreachable.
 */
import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(__dirname, '../../../scripts/stale-session-sweep.cjs');
const require = createRequire(import.meta.url);
const sweep = require(SOURCE_PATH);

// Chainable + thenable query-builder mock: select/ilike/in/or/is/lt (used by both the
// SELECT path and getActiveSDFilter's real .in()/.or()/.is() calls) all return the SAME
// chain object, which also resolves like a promise -- so it doesn't matter how many
// chain calls the real production code makes before awaiting.
function makeSelectChain(result) {
  const chain = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function makeUpdateChain(result) {
  const chain = {};
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function makeSupabase({ selectResult, updateResults = [] }) {
  let updateCallIndex = 0;
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table !== 'strategic_directives_v2') throw new Error(`unexpected table: ${table}`);
      return {
        select: vi.fn().mockReturnValue(makeSelectChain(selectResult)),
        update: vi.fn().mockImplementation(() => {
          const result = updateResults[updateCallIndex] ?? { error: null };
          updateCallIndex++;
          return makeUpdateChain(result);
        }),
      };
    }),
  };
}

describe('cancelStaleTestFixtures()', () => {
  const now = new Date('2026-07-06T00:00:00Z');

  it('auto-cancels a leaked SD-TEST-* fixture unclaimed >24h', async () => {
    const supabase = makeSupabase({
      selectResult: {
        data: [{ id: 'fixture-1', sd_key: 'SD-TEST-ABC123-ORCH-001', status: 'in_progress' }],
        error: null,
      },
      updateResults: [{ error: null }],
    });
    const actions = [];
    const warnings = [];

    await sweep.cancelStaleTestFixtures(supabase, now, actions, warnings);

    expect(warnings).toEqual([]);
    expect(actions.some(a => a.includes('SD-TEST-ABC123-ORCH-001') && a.includes('unclaimed >24h'))).toBe(true);
  });

  it('never queries by anything but the SD-TEST-% prefix', async () => {
    let ilikeCol, ilikePattern;
    const fromSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockImplementation((col, pattern) => {
          ilikeCol = col;
          ilikePattern = pattern;
          return makeSelectChain({ data: [], error: null });
        }),
      }),
    });
    const supabase = { from: fromSpy };
    await sweep.cancelStaleTestFixtures(supabase, now, [], []);
    expect(fromSpy).toHaveBeenCalledWith('strategic_directives_v2');
    expect(ilikeCol).toBe('sd_key');
    expect(ilikePattern).toBe(sweep.TEST_FIXTURE_SD_KEY_LIKE);
  });

  it('does nothing (no throw, no actions) when zero stale fixtures are found', async () => {
    const supabase = makeSupabase({ selectResult: { data: [], error: null } });
    const actions = [];
    const warnings = [];
    await sweep.cancelStaleTestFixtures(supabase, now, actions, warnings);
    expect(actions).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('degrades safely (warns, does not throw) on a query error', async () => {
    const supabase = makeSupabase({ selectResult: { data: null, error: { message: 'boom' } } });
    const actions = [];
    const warnings = [];
    await expect(sweep.cancelStaleTestFixtures(supabase, now, actions, warnings)).resolves.toBeUndefined();
    expect(warnings.some(w => w.includes('TEST_FIXTURE_SWEEP'))).toBe(true);
  });

  it('degrades safely (warns, does not throw) when supabase itself throws', async () => {
    const supabase = { from: vi.fn().mockImplementation(() => { throw new Error('connection lost'); }) };
    const actions = [];
    const warnings = [];
    await expect(sweep.cancelStaleTestFixtures(supabase, now, actions, warnings)).resolves.toBeUndefined();
    expect(warnings.some(w => w.includes('TEST_FIXTURE_SWEEP'))).toBe(true);
  });

  it('exposes the 24h stale threshold as a named constant', () => {
    expect(sweep.TEST_FIXTURE_STALE_MS).toBe(24 * 60 * 60 * 1000);
  });
});
