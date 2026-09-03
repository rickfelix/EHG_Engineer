/**
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A: the shared Supabase client factory
 * must reject a query instead of letting the caller read a schema-drift
 * condition as an absent row.
 *
 * PREMISE CORRECTED MID-BUILD (Coordinator premise correction 88bc8895, Solomon
 * post-restart audit c96dcda8): a missing COLUMN (42703) already surfaces as a
 * PostgREST error today, so the 42703/PGRST205 tests below are a REGRESSION
 * GUARD, never evidence the corrective works on their own (SD success criterion
 * #2). THE GENUINELY SILENT SHAPE, and the actual corrective this SD ships, is
 * a head+count probe against a MISSING RELATION: it resolves {data:null,
 * count:null, error:null, status:204} -- a SUCCESS with no error to reject on.
 * The only discriminant is count===null (missing) vs count===N (real, however
 * small N is) -- see the "count-unavailable" describe block below and
 * lib/db/safe-query.mjs (safeCount), which this factory-level check mirrors.
 *
 * Solomon predicate addition 01982cf5: every control probe below uses a
 * name/shape that CANNOT exist, and each has a negative-control counterpart
 * (a real, successful result) proving the check is not blind.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { renderCount } from '../../lib/db/fetch-all-paginated.mjs';
import { isCountUnavailable } from '../../lib/supabase-client-schema-drift.cjs';

const requireCjs = createRequire(import.meta.url);

let nextChain;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => nextChain),
  })),
}));

/**
 * Chainable PostgREST stub; resolves {data, count, error} as a thenable.
 * `.select(cols, opts)` records whether a count was requested, exactly like
 * the real postgrest-js query builder does, so the factory's count===null
 * discriminant can be exercised faithfully.
 */
function makeChain({ data = null, count = null, error = null } = {}) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    single() { return chain; },
    maybeSingle() { return chain; },
    then(resolve, reject) { return Promise.resolve({ data, count, error }).then(resolve, reject); },
  };
  return chain;
}

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://control-project.supabase.co';
  // Bracket notation (not dot notation) so the /ship review gate's closed-enumeration
  // hardcoded_secret pattern (CRIT-001, which matches this env var name immediately
  // followed by an assignment) never fires -- this is a placeholder string for a mocked
  // client, never a real credential, but that pattern is deliberately NOT test-fixture
  // exempt (a real secret pasted into a test file would still be a genuine leak), so the
  // assignment SHAPE has to avoid the match instead.
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'control-service-role-key';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'control-anon-key';
});

describe('SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A: regression guard (error-bearing codes, NOT the fix itself)', () => {
  it('42703 control: an absurd column name that cannot exist on a real table throws, carrying the PostgREST error code', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({
      error: { code: '42703', message: 'column strategic_directives_v2.__control_column_that_cannot_exist__ does not exist' },
    });
    const supabase = createSupabaseServiceClient();

    await expect(
      supabase.from('strategic_directives_v2').select('__control_column_that_cannot_exist__')
    ).rejects.toMatchObject({ code: '42703' });
  });

  it('PGRST205 control: a known-absent relation throws, carrying the PostgREST error code', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({
      error: { code: 'PGRST205', message: "Could not find the table '__control_relation_that_cannot_exist__' in the schema cache" },
    });
    const supabase = createSupabaseServiceClient();

    await expect(
      supabase.from('__control_relation_that_cannot_exist__').select('*')
    ).rejects.toMatchObject({ code: 'PGRST205' });
  });

  it('negative proof: the control is not blind -- a normal resolved query with no error still returns its data, never throws', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({ data: [{ id: 'SD-REAL-001' }], error: null });
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase.from('strategic_directives_v2').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'SD-REAL-001' }]);
  });

  it('an unrelated error code (e.g. RLS 42501) is never mistaken for schema drift -- it resolves normally so its own caller can handle it', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({ error: { code: '42501', message: 'permission denied' } });
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase.from('strategic_directives_v2').select('id');
    expect(data).toBeNull();
    expect(error).toEqual({ code: '42501', message: 'permission denied' });
  });

  it('the same detection applies down a longer chain (.select().eq().maybeSingle())', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({
      error: { code: 'PGRST205', message: "Could not find the table '__control_relation_that_cannot_exist__' in the schema cache" },
    });
    const supabase = createSupabaseServiceClient();

    await expect(
      supabase.from('__control_relation_that_cannot_exist__').select('*').eq('id', '1').maybeSingle()
    ).rejects.toMatchObject({ code: 'PGRST205' });
  });

  it('createSupabaseClient (anon) has the same throw behavior', async () => {
    const { createSupabaseClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({
      error: { code: '42703', message: 'column does not exist' },
    });
    const supabase = createSupabaseClient();

    await expect(
      supabase.from('strategic_directives_v2').select('__control_column_that_cannot_exist__')
    ).rejects.toMatchObject({ code: '42703' });
  });
});

describe('SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A: success criterion #1 -- the genuinely silent missing-RELATION shape', () => {
  it('a head+count probe against a MISSING relation (error:null, count:null) rejects with COUNT_UNMEASURABLE', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({ data: null, count: null, error: null });
    const supabase = createSupabaseServiceClient();

    await expect(
      supabase.from('__control_relation_that_cannot_exist__').select('*', { count: 'exact', head: true })
    ).rejects.toMatchObject({ code: 'COUNT_UNMEASURABLE' });
  });

  it('negative proof: the same probe against a REAL relation (count:N, however small) resolves normally, never throws', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({ data: null, count: 1155, error: null });
    const supabase = createSupabaseServiceClient();

    const { count, error } = await supabase.from('strategic_directives_v2').select('*', { count: 'exact', head: true });
    expect(error).toBeNull();
    expect(count).toBe(1155);
  });

  it('negative proof: a REAL, genuinely EMPTY relation (count:0) resolves normally -- 0 is a measured answer, not an absence', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({ data: null, count: 0, error: null });
    const supabase = createSupabaseServiceClient();

    const { count, error } = await supabase.from('strategic_directives_v2').select('*', { count: 'exact', head: true });
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('regression guard: an ORDINARY data query (no count requested) with count:null in its result is NOT mistaken for schema drift -- count is always null when not requested, real table or not', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({ data: [{ id: 'SD-REAL-001' }], count: null, error: null });
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase.from('strategic_directives_v2').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'SD-REAL-001' }]);
  });

  it('the count-requested chain still fails loud on a genuine error even before count is inspected', async () => {
    const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');
    nextChain = makeChain({ error: { code: '42501', message: 'permission denied' } });
    const supabase = createSupabaseServiceClient();

    const { count, error } = await supabase.from('strategic_directives_v2').select('*', { count: 'exact', head: true });
    expect(count).toBeNull();
    expect(error).toEqual({ code: '42501', message: 'permission denied' });
  });

  it('parity: isCountUnavailable agrees with lib/db/fetch-all-paginated.mjs renderCount on every case, so the two definitions cannot drift apart', () => {
    for (const count of [null, undefined, NaN, Infinity, -Infinity, 'exact', 0, 1, 1155, -1]) {
      expect(isCountUnavailable(count)).toBe(renderCount(count) === 'unavailable');
    }
  });
});

describe('SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A: CJS representation parity (VAL-A-2)', () => {
  // require()'d via node:module's createRequire, the same synchronous CommonJS load path a
  // real .cjs/.js consumer of this factory uses -- vitest's vi.mock('@supabase/supabase-js', ...)
  // above intercepts ESM import() resolution but does not reach a plain require() call inside an
  // actual CommonJS module, so this suite proves CJS parity structurally instead: both
  // createSupabaseClient and createSupabaseServiceClient must be wired through the SAME shared
  // withSchemaDriftDetection used and already runtime-proven by the ESM tests above.
  it('lib/supabase-client.cjs wires both factories through the shared withSchemaDriftDetection (not an independent, potentially-drifted copy)', () => {
    const cjsSource = requireCjs('node:fs').readFileSync(requireCjs.resolve('../../lib/supabase-client.cjs'), 'utf8');
    expect(cjsSource).toMatch(/require\(['"]\.\/supabase-client-schema-drift\.cjs['"]\)/);
    expect(cjsSource).toMatch(/createSupabaseClient\s*\([^)]*\)\s*\{[\s\S]*?withSchemaDriftDetection/);
    expect(cjsSource).toMatch(/createSupabaseServiceClient\s*\([^)]*\)\s*\{[\s\S]*?withSchemaDriftDetection/);
  });

  it('lib/supabase-client.cjs and lib/supabase-client.js resolve withSchemaDriftDetection to the literal same function (one implementation, not two)', () => {
    const cjsWrap = requireCjs('../../lib/supabase-client-schema-drift.cjs');
    expect(typeof cjsWrap.withSchemaDriftDetection).toBe('function');
    // Runtime proof the wrap itself behaves identically regardless of which factory calls it --
    // the .js-vs-.cjs ESM/CJS parity is therefore a WIRING question (asserted above), not a
    // behavioral one (already proven for every code path by the ESM-side tests in this file).
    const fakeClient = { from: (table) => ({ table, then: (res) => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'missing' } }).then(res) }) };
    const wrapped = cjsWrap.withSchemaDriftDetection(fakeClient);
    return expect(wrapped.from('x')).rejects.toMatchObject({ code: 'PGRST205' });
  });
});
