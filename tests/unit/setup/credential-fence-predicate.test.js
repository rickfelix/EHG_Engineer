/**
 * The unit-tier credential fence, branch by branch — SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001.
 *
 * These tests cover the DECISION. They deliberately cannot cover the ACTION or the ORDERING: the
 * fence runs inside tests/setup.unit.js, which aborts the worker, and a suite cannot observe its
 * own tier refusing to start. That half lives in credential-fence-ordering.spawn.test.js, which
 * runs vitest out-of-process. Neither file is sufficient alone, and the split is the point — a
 * green here says the predicate decides correctly and says NOTHING about whether setup.unit.js
 * calls it with the right argument at the right moment.
 *
 * Two-sided throughout. A fence that only ever aborts is indistinguishable from a broken tier, so
 * every breach case is paired with a clean case.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateSentinelPostCondition,
  formatCredentialFenceError,
  CREDENTIAL_FENCE_TOKEN,
  REQUIRED_SENTINELS,
  SENTINEL_URL,
  SENTINEL_SERVICE_ROLE_KEY,
  SENTINEL_ANON_KEY,
} from '../../helpers/credential-fence.js';

/** A correctly-sentinelled environment — the state setup.unit.js is required to produce. */
const clean = () => ({ ...REQUIRED_SENTINELS });

// Credential variable NAMES referenced as data, not as identifiers. Reading them from the contract
// keeps this suite honest about which variables exist, and keeps the repo's DB-test guard from
// reading a pure predicate test as a suite that reaches for a database.
const [URL_KEY, PUB_URL_KEY, KEY_KEY, ANON_KEY] = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const LIVE_URL = 'https://prodprojectref01.supabase.co';

describe('evaluateSentinelPostCondition — clean tier', () => {
  it('is silent when every credential variable holds its sentinel', () => {
    const fence = evaluateSentinelPostCondition(clean());
    expect(fence.abort).toBe(false);
    expect(fence.token).toBeNull();
    expect(fence.breaches).toEqual([]);
  });

  it('is silent even though the ambient environment had real credentials', () => {
    // THE CASE THAT DEFINES THIS DESIGN. vitest.config.js loads `.env` into the parent process and
    // every fork inherits it, so real credentials are ambient on essentially every machine. The
    // fence must NOT fire for that — it fires for the tier failing to overwrite them. A guard that
    // screams on every ordinary run gets deleted, and a deleted guard protects nothing.
    const afterSetup = { ...clean(), SOME_OTHER_AMBIENT_SECRET: 'still-here' };
    expect(evaluateSentinelPostCondition(afterSetup).abort).toBe(false);
  });

  it('is total: a null/undefined env bag decides rather than throwing', () => {
    // The fence runs before anything else in the tier. If it can throw, it takes the tier down for
    // a reason unrelated to credentials and the operator sees a crash instead of a verdict.
    expect(() => evaluateSentinelPostCondition(undefined)).not.toThrow();
    expect(evaluateSentinelPostCondition(undefined).abort).toBe(true);
  });
});

describe('evaluateSentinelPostCondition — drift', () => {
  it('aborts when SUPABASE_URL survived as a live project URL (the `||=` regression)', () => {
    // Exactly what a reintroduced `||=` produces on a machine with real credentials: the ambient
    // value wins and the sentinel never lands. This is the shape of the original defect.
    const drifted = { ...clean(), [URL_KEY]: LIVE_URL };
    const fence = evaluateSentinelPostCondition(drifted);
    expect(fence.abort).toBe(true);
    expect(fence.token).toBe(CREDENTIAL_FENCE_TOKEN);
    expect(fence.breaches.map((b) => b.key)).toEqual(['SUPABASE_URL']);
  });

  it.each(Object.keys(REQUIRED_SENTINELS))('aborts when %s alone fails to be sentinelled', (key) => {
    // Per-variable rather than one composite case: a fence that only checks SUPABASE_URL would
    // pass this suite while leaving a real service-role key live in the tier.
    const drifted = { ...clean(), [key]: 'https://prodprojectref01.supabase.co' };
    const fence = evaluateSentinelPostCondition(drifted);
    expect(fence.abort).toBe(true);
    expect(fence.breaches.map((b) => b.key)).toEqual([key]);
  });

  it('aborts when a credential variable is missing entirely', () => {
    const drifted = clean();
    delete drifted[KEY_KEY];
    const fence = evaluateSentinelPostCondition(drifted);
    expect(fence.abort).toBe(true);
    expect(fence.breaches[0]).toEqual({ key: KEY_KEY, detail: '(unset)' });
  });

  it('reports every breaching variable, not just the first', () => {
    const fence = evaluateSentinelPostCondition({});
    expect(fence.breaches.map((b) => b.key).sort()).toEqual(Object.keys(REQUIRED_SENTINELS).sort());
  });

  it('covers all eight credential variables — the set cannot silently shrink', () => {
    // Pins the contract itself. Dropping a variable from REQUIRED_SENTINELS would otherwise narrow
    // the fence with every per-variable test above still green, because those iterate the same set.
    //
    // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001 widened this from four to eight, and this
    // guard is why the widening had to be declared rather than absorbed: it caught the expansion
    // in CI (1 failed / 38556 passed) when a local subset run had missed the file entirely. Keep
    // the list EXACT rather than asserting a minimum length — a length check would let a future
    // change swap one variable for another while staying green, which is the shrink this pins.
    //
    // The first four are PostgREST credentials. The last four are the separate routes by which
    // scripts/lib/supabase-connection.js can build a direct pg connection (connectionString from
    // SUPABASE_POOLER_URL or DATABASE_URL, else assembled from SUPABASE_DB_PASSWORD or
    // EHG_DB_PASSWORD); neither the PostgREST sentinels nor the db tier's globalThis.fetch guard
    // can observe a pg net.Socket, so the fence needed all eight.
    expect(Object.keys(REQUIRED_SENTINELS).sort()).toEqual([
      'DATABASE_URL',
      'EHG_DB_PASSWORD',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_DB_PASSWORD',
      'SUPABASE_POOLER_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
    ]);
    expect(REQUIRED_SENTINELS[URL_KEY]).toBe(SENTINEL_URL);
    expect(REQUIRED_SENTINELS[KEY_KEY]).toBe(SENTINEL_SERVICE_ROLE_KEY);
    expect(REQUIRED_SENTINELS[ANON_KEY]).toBe(SENTINEL_ANON_KEY);
    // Empty string, not a sentinel URL: '' is falsy but not nullish, so it survives `??` chains
    // and still trips the `if (!password)` guard in createDatabaseClient.
    for (const k of ['SUPABASE_POOLER_URL', 'DATABASE_URL', 'SUPABASE_DB_PASSWORD', 'EHG_DB_PASSWORD']) {
      expect(REQUIRED_SENTINELS[k]).toBe('');
    }
  });
});

describe('formatCredentialFenceError', () => {
  it('names the token and the breaching variable', () => {
    const fence = evaluateSentinelPostCondition({ ...clean(), [URL_KEY]: LIVE_URL });
    const msg = formatCredentialFenceError(fence);
    expect(msg).toContain(CREDENTIAL_FENCE_TOKEN);
    expect(msg).toContain('SUPABASE_URL');
    expect(msg).toContain('prodprojectref01');
  });

  it('NEVER reproduces a breaching secret value', () => {
    // A fence that prints the secret it caught has copied that secret into CI logs — a worse
    // outcome than the leak it was reporting. Project refs are identifiers and safe to name; the
    // key material is not.
    const secret = 'fabricated-service-role-key-must-not-be-echoed';
    const fence = evaluateSentinelPostCondition({ ...clean(), [KEY_KEY]: secret });
    const msg = formatCredentialFenceError(fence);
    expect(fence.abort).toBe(true);
    expect(msg).not.toContain(secret);
    expect(msg).not.toContain('must-not-be-echoed');
    expect(msg).toContain('withheld');
  });

  it('tells the reader to fix the assignment rather than silence the check', () => {
    const fence = evaluateSentinelPostCondition({});
    expect(formatCredentialFenceError(fence)).toContain('do not silence this check');
  });
});
