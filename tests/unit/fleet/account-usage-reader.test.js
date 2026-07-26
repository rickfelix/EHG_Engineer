/**
 * SD-LEO-FEAT-ACCOUNT-USAGE-STRIP-001 — per-account usage reader.
 *
 * These tests exist because the FAILURE modes are the feature. The endpoint is undocumented, so
 * what matters is not that a happy path returns 54.0 — it is that every other path says so out
 * loud instead of rendering a number the chairman would read as "plenty of headroom".
 *
 * Every fixture injects `fetchImpl` and `fs`, so nothing here touches the real credentials on disk
 * or the live endpoint. TS-9 is the NEGATIVE CONTROL: a healthy account must come back plain `ok`,
 * which is what proves the unavailable/stale assertions below are not simply always true.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mod = await import('../../../lib/fleet/account-usage-reader.cjs');
const {
  UNAVAILABLE_REASONS,
  REASON_VALUES,
  ACCOUNT_REGISTRY,
  resolveAccountConfigDir,
  hostDefaultConfigDir,
  profilesBaseDir,
  readAccessToken,
  toPct,
  readOneAccount,
  readAllAccounts,
  getAccountUsage,
  __resetUsageCache,
  OAUTH_BETA_HEADER,
  USAGE_URL,
} = mod;

const ENV = { USERPROFILE: 'C:\\Users\\test' };

const HOST_DEFAULT_DIR = 'C:\\Users\\test\\.claude';
const PROFILES_DIR = 'C:\\Users\\test\\.claude-fleet-profiles';
const DEEPSOUL_DIR = `${PROFILES_DIR}\\deepsoul`;

/**
 * An fs whose readFileSync serves credentials for the named dirs ONLY, matched EXACTLY.
 *
 * Exact, not prefix: '.claude' is a string PREFIX of '.claude-fleet-profiles', so a startsWith
 * fixture silently served the host-default token to every profile account — which made three
 * assertions below pass vacuously (an unreadable account looked readable, so "no token leaked"
 * was proven against a payload that had no successful read in it). The production code joins an
 * exact path per account and never prefix-matches; this fixture now mirrors that.
 */
function fsWithTokens(tokensByDir) {
  const byPath = new Map(
    Object.entries(tokensByDir).map(([dir, token]) => [`${dir}\\.credentials.json`, token]),
  );
  return {
    readFileSync: (filePath) => {
      if (!byPath.has(filePath)) throw new Error('ENOENT');
      return JSON.stringify({ claudeAiOauth: { accessToken: byPath.get(filePath) } });
    },
  };
}

/** Both live-readable accounts on this host, so a fixture exercises real `ok` readings. */
function fsWithBothAccounts(hostToken, canaryToken) {
  return fsWithTokens({ [HOST_DEFAULT_DIR]: hostToken, [CANARY_DIR]: canaryToken });
}

function usageBody(sevenDay, fiveHour) {
  return {
    seven_day: { utilization: sevenDay, resets_at: '2026-08-02T00:00:00Z' },
    five_hour: { utilization: fiveHour, resets_at: '2026-07-26T22:00:00Z' },
    // Present-but-null upstream, exactly as research measured. Nothing may read these.
    cost: null,
    per_model: null,
  };
}

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

const ANY_ENTRY = { name: 'Test Account', profile: 'canary' };
const CANARY_DIR = 'C:\\Users\\test\\.claude-fleet-profiles\\canary';

beforeEach(() => __resetUsageCache());

describe('account registry (FR-1)', () => {
  it('names all three chairman-facing accounts', () => {
    expect(ACCOUNT_REGISTRY.map((e) => e.name)).toEqual([
      'Deep Soul Sessions',
      'Code Street Labs',
      'Rick Felix 2000',
    ]);
  });

  it('expresses the HOST DEFAULT as an account config dir, not as a fallback', () => {
    // resolveProfileDir structurally cannot do this — it only joins under the profiles base dir.
    const codeStreet = ACCOUNT_REGISTRY.find((e) => e.name === 'Code Street Labs');
    expect(resolveAccountConfigDir(codeStreet, ENV)).toBe('C:\\Users\\test\\.claude');
    expect(hostDefaultConfigDir(ENV)).toBe('C:\\Users\\test\\.claude');
    // ...and it is NOT under the profiles dir, which is the whole reason it needed its own branch.
    expect(resolveAccountConfigDir(codeStreet, ENV).startsWith(profilesBaseDir(ENV))).toBe(false);
  });

  it('defaults the profiles base dir when FLEET_ACCOUNT_PROFILES_DIR is unset', () => {
    // Measured on the live host: the env var is UNSET yet ~/.claude-fleet-profiles/canary holds
    // real credentials. Throwing (resolveProfileDir's behaviour) would render a readable account
    // not_configured — a misleading gauge, which this SD forbids.
    expect(profilesBaseDir(ENV)).toBe('C:\\Users\\test\\.claude-fleet-profiles');
    expect(resolveAccountConfigDir({ name: 'x', profile: 'canary' }, ENV)).toBe(CANARY_DIR);
    // An explicitly configured base dir still wins.
    expect(profilesBaseDir({ ...ENV, FLEET_ACCOUNT_PROFILES_DIR: 'D:\\p' })).toBe('D:\\p');
  });

  it('does NOT depend on orgName at all — the honest-value-wrong-question defect', async () => {
    // account-capacity-gauge.cjs matches /rick\s*felix/i against orgName, which MISSES the canary
    // profile's real orgName "Richard Felix" (verified on host). Identity here comes from WHICH
    // DIRECTORY supplied the token, so no orgName value can make it drift.
    //
    // NARROWED DELIBERATELY: this case used to also assert that NAMED_ACCOUNT_REGISTRY is not
    // exported and that /rick\s*felix/i fails on 'Richard Felix'. Neither could fail from any
    // change to the module under test — one describes a different module, the other tests a regex
    // the test itself wrote. What remains has a real failure mode: reintroducing name-matching.
    const entryKeys = new Set(ACCOUNT_REGISTRY.flatMap((e) => Object.keys(e)));
    expect([...entryKeys].sort()).toEqual(['hostDefault', 'name', 'profile']);
    for (const key of entryKeys) expect(key).not.toMatch(/orgName|match|regex|email/i);

    // And resolution is blind to identity: attaching orgName/email to an entry — including the
    // exact value that defeats the old regex — cannot change which directory is read.
    const plain = { name: 'Rick Felix 2000', profile: 'canary' };
    const withIdentity = { ...plain, orgName: 'Richard Felix', email: 'rickfelix2000@gmail.com' };
    expect(resolveAccountConfigDir(withIdentity, ENV)).toBe(resolveAccountConfigDir(plain, ENV));
  });

  it('rejects a traversal/absolute profile name rather than joining it', () => {
    expect(resolveAccountConfigDir({ name: 'bad', profile: '../../etc' }, ENV)).toBeNull();
    expect(resolveAccountConfigDir({ name: 'bad', profile: 'C:\\evil' }, ENV)).toBeNull();
  });
});

describe('token read (FR-2/FR-7)', () => {
  it('reads claudeAiOauth.accessToken from the account\'s own credentials file', () => {
    expect(readAccessToken(CANARY_DIR, fsWithTokens({ [CANARY_DIR]: 'tok-abc' }))).toBe('tok-abc');
  });

  it('returns null (never throws) on a missing file, bad JSON, or absent token', () => {
    const boom = { readFileSync: () => { throw new Error('ENOENT'); } };
    expect(readAccessToken(CANARY_DIR, boom)).toBeNull();
    expect(readAccessToken(CANARY_DIR, { readFileSync: () => 'not json' })).toBeNull();
    expect(readAccessToken(CANARY_DIR, { readFileSync: () => '{"claudeAiOauth":{}}' })).toBeNull();
  });
});

describe('utilization coercion', () => {
  it('accepts percent-scaled research values and rounds to one decimal', () => {
    expect(toPct(54.0)).toBe(54);
    expect(toPct(11.0)).toBe(11);
    expect(toPct(33.333)).toBe(33.3);
  });

  it('rejects non-numbers and out-of-range values rather than coercing them', () => {
    // A coerced 0 is the forbidden "reads as low usage" outcome.
    for (const bad of [null, undefined, '54', NaN, Infinity, -1, 101]) {
      expect(toPct(bad)).toBeNull();
    }
  });

  it('ADMITS a genuine 0 and a genuine 100 — the boundaries, not just the middle', () => {
    // 0 is the sharpest case in this SD: a real 0%-used account must render as 0%, while an
    // UNREADABLE one must never render as 0. That distinction only holds if toPct accepts 0.
    // A future tidy-up to `if (!value) return null` would silently convert a genuinely idle
    // account into unexpected_shape, and nothing else here would catch it.
    expect(toPct(0)).toBe(0);
    expect(toPct(100)).toBe(100);
  });
});

describe('per-account read', () => {
  it('TS-9 NEGATIVE CONTROL — a healthy account returns a plain ok reading', async () => {
    const fetchImpl = vi.fn(async () => okResponse(usageBody(54, 11)));
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV, fs: fsWithTokens({ [CANARY_DIR]: 'tok' }), fetchImpl, nowMs: 1_000_000,
    });

    expect(result).toMatchObject({
      name: 'Test Account',
      state: 'ok',
      weeklyPct: 54,
      fiveHourPct: 11,
      // Canonical ISO, re-derived rather than echoed from upstream (see toIsoOrNull).
      weeklyResetsAt: '2026-08-02T00:00:00.000Z',
    });
    expect(result.reason).toBeUndefined();
    expect(result.fetchedAt).toBe(new Date(1_000_000).toISOString());
  });

  it('sends the REQUIRED anthropic-beta header and the account\'s own bearer token', async () => {
    const fetchImpl = vi.fn(async () => okResponse(usageBody(54, 11)));
    await readOneAccount(ANY_ENTRY, {
      env: ENV, fs: fsWithTokens({ [CANARY_DIR]: 'tok-xyz' }), fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(USAGE_URL);
    expect(init.headers['anthropic-beta']).toBe(OAUTH_BETA_HEADER);
    expect(init.headers.Authorization).toBe('Bearer tok-xyz');
  });

  it('TS-2 — HTTP 401 renders unauthorized, with no percentage key at all', async () => {
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    });

    expect(result.state).toBe('unavailable');
    expect(result.reason).toBe(UNAVAILABLE_REASONS.UNAUTHORIZED);
    // FR-3: the key is ABSENT, not null — a null percentage is what produces the forbidden dash.
    expect('weeklyPct' in result).toBe(false);
    expect('fiveHourPct' in result).toBe(false);
  });

  it('TS-3 — a body missing seven_day.utilization is unexpected_shape, never a 0', async () => {
    const cases = [
      { seven_day: {}, five_hour: { utilization: 11 } },
      usageBody(undefined, 11),
      usageBody(54, undefined),
      {},
    ];
    for (const body of cases) {
      const result = await readOneAccount(ANY_ENTRY, {
        env: ENV,
        fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
        fetchImpl: async () => okResponse(body),
      });
      expect(result.reason).toBe(UNAVAILABLE_REASONS.UNEXPECTED_SHAPE);
      expect('weeklyPct' in result).toBe(false);
    }
  });

  it('TS-2b — HTTP 403 is unauthorized too, not lumped into unreachable', async () => {
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    });
    expect(result.reason).toBe(UNAVAILABLE_REASONS.UNAUTHORIZED);
  });

  it('admits a real 0% reading as ok — never confused with an unreadable account', async () => {
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => okResponse(usageBody(0, 0)),
    });
    expect(result).toMatchObject({ state: 'ok', weeklyPct: 0, fiveHourPct: 0 });
    expect(result.reason).toBeUndefined();
  });

  it('degrades a MISSING resets_at to null without failing the reading', async () => {
    // The reader documents this as a decision rather than an oversight: the percentage is the
    // load-bearing value, so losing the display timestamp must not discard a good reading.
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => okResponse({
        seven_day: { utilization: 54 },
        five_hour: { utilization: 11, resets_at: 'not-a-date' },
      }),
    });
    expect(result).toMatchObject({ state: 'ok', weeklyPct: 54, weeklyResetsAt: null, fiveHourResetsAt: null });
  });

  it('re-derives resets_at to canonical ISO rather than echoing the upstream string', async () => {
    // V8's legacy date parser treats parenthesized trailing text as a comment, so this string
    // parses successfully. Echoing it through would put upstream text in a browser-bound field.
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => okResponse({
        seven_day: { utilization: 54, resets_at: 'Dec 25 1995 (<script>alert(1)</script>)' },
        five_hour: { utilization: 11, resets_at: '2026-07-27T01:00:00Z' },
      }),
    });
    expect(result.state).toBe('ok');
    expect(result.weeklyResetsAt).not.toContain('script');
    expect(result.weeklyResetsAt).toBe(new Date('Dec 25 1995').toISOString());
  });

  it('TS-3b — a non-JSON 200 body is unexpected_shape, not a crash', async () => {
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }),
    });
    expect(result.reason).toBe(UNAVAILABLE_REASONS.UNEXPECTED_SHAPE);
  });

  it('TS-4 — an aborted request renders timeout within the bounded window', async () => {
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      timeoutMs: 5,
      // Never settles on its own: only the module's own AbortController can end this.
      fetchImpl: (url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    });
    expect(result.state).toBe('unavailable');
    expect(result.reason).toBe(UNAVAILABLE_REASONS.TIMEOUT);
  });

  it('a transport failure renders unreachable, and so does any other non-2xx', async () => {
    const netFail = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    });
    expect(netFail.reason).toBe(UNAVAILABLE_REASONS.UNREACHABLE);

    const serverErr = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: fsWithTokens({ [CANARY_DIR]: 'tok' }),
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    expect(serverErr.reason).toBe(UNAVAILABLE_REASONS.UNREACHABLE);
  });

  it('TS-5 — an account with no resolvable credentials is not_configured, never omitted', async () => {
    const fetchImpl = vi.fn();
    const result = await readOneAccount(ANY_ENTRY, {
      env: ENV,
      fs: { readFileSync: () => { throw new Error('ENOENT'); } },
      fetchImpl,
    });
    expect(result.reason).toBe(UNAVAILABLE_REASONS.NOT_CONFIGURED);
    expect(result.name).toBe('Test Account');
    // No token means no upstream call is even attempted.
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('all-accounts read', () => {
  it('TS-1 — each account\'s percentage derives from ITS OWN credentials', async () => {
    // The defect this guards: one host-global figure repeated three times. Distinct tokens must
    // produce distinct readings.
    const byToken = { 'tok-cs': usageBody(54, 11), 'tok-rf': usageBody(7, 3) };
    const fetchImpl = vi.fn(async (_url, init) => {
      const token = init.headers.Authorization.replace('Bearer ', '');
      return okResponse(byToken[token]);
    });
    const results = await readAllAccounts({
      env: ENV,
      fs: fsWithBothAccounts('tok-cs', 'tok-rf'),
      fetchImpl,
    });

    expect(results).toHaveLength(3);
    // Deep Soul resolves to a real path that simply has no credentials behind it.
    expect(resolveAccountConfigDir(ACCOUNT_REGISTRY[0], ENV)).toBe(DEEPSOUL_DIR);
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));
    // Deep Soul has no directory on this host — unreadable, and explicitly SO.
    expect(byName['Deep Soul Sessions'].reason).toBe(UNAVAILABLE_REASONS.NOT_CONFIGURED);
    expect(byName['Code Street Labs'].weeklyPct).toBe(54);
    expect(byName['Rick Felix 2000'].weeklyPct).toBe(7);
    // The load-bearing assertion: the two live readings DIFFER.
    expect(byName['Code Street Labs'].weeklyPct)
      .not.toBe(byName['Rick Felix 2000'].weeklyPct);
  });

  it('one account failing never suppresses or alters another\'s reading', async () => {
    const fetchImpl = async (_url, init) => (
      init.headers.Authorization === 'Bearer tok-bad'
        ? { ok: false, status: 401, json: async () => ({}) }
        : okResponse(usageBody(42, 9))
    );
    const results = await readAllAccounts({
      env: ENV,
      fs: fsWithBothAccounts('tok-good', 'tok-bad'),
      fetchImpl,
    });
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));
    expect(byName['Rick Felix 2000'].reason).toBe(UNAVAILABLE_REASONS.UNAUTHORIZED);
    expect(byName['Code Street Labs']).toMatchObject({ state: 'ok', weeklyPct: 42 });
  });

  it('TS-6 — the serialized payload carries NO token, path, or config dir (FR-7)', async () => {
    const results = await readAllAccounts({
      env: ENV,
      fs: fsWithBothAccounts('sk-ant-oat01-SUPERSECRET-TOKEN-VALUE', 'sk-ant-oat01-OTHER-SECRET'),
      fetchImpl: async () => okResponse(usageBody(54, 11)),
    });
    const serialized = JSON.stringify(results);

    // The control that makes this non-vacuous: there ARE successful readings in this payload, so
    // a token could actually have leaked through one of them.
    expect(results.filter((r) => r.state === 'ok')).toHaveLength(2);
    expect(serialized).not.toContain('SUPERSECRET');
    expect(serialized).not.toContain('OTHER-SECRET');
    expect(serialized).not.toContain('sk-ant');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('.credentials.json');
    expect(serialized).not.toMatch(/C:\\\\|\.claude|claude-fleet-profiles/);
    expect(serialized).not.toContain('CLAUDE_CONFIG_DIR');
  });

  it('every unavailable reason comes from the CLOSED enum — no raw error text escapes', async () => {
    const results = await readAllAccounts({
      env: ENV,
      fs: fsWithBothAccounts('tok-a', 'tok-b'),
      // A verbose transport error: none of it may reach the client.
      fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND api.anthropic.com'); },
    });
    for (const r of results) {
      expect(r.state).toBe('unavailable');
      expect(REASON_VALUES).toContain(r.reason);
    }
    // Two accounts genuinely reached the transport path (not_configured would not exercise it).
    expect(results.filter((r) => r.reason === UNAVAILABLE_REASONS.UNREACHABLE)).toHaveLength(2);
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain('ENOTFOUND');
    expect(serialized).not.toContain('getaddrinfo');
  });
});

describe('caching', () => {
  it('amortizes upstream calls but never re-serves a stale SUCCESS after expiry', async () => {
    const fetchImpl = vi.fn(async () => okResponse(usageBody(54, 11)));
    const opts = { env: ENV, fs: fsWithBothAccounts('tok-a', 'tok-b'), fetchImpl };

    const first = await getAccountUsage({ ...opts, nowMs: 0 });
    expect(first.filter((r) => r.state === 'ok')).toHaveLength(2); // the reading is real
    const cached = await getAccountUsage({ ...opts, nowMs: 30_000 });
    expect(cached).toBe(first);
    const callsAfterCacheHit = fetchImpl.mock.calls.length;

    // Past the TTL the upstream is consulted again — and if it is now dead, the reading becomes
    // unavailable rather than continuing to show the last good number.
    const dead = await getAccountUsage({
      ...opts,
      nowMs: 120_000,
      fetchImpl: async () => { throw new Error('down'); },
    });
    expect(fetchImpl.mock.calls.length).toBe(callsAfterCacheHit);
    expect(dead.every((r) => r.state === 'unavailable')).toBe(true);
    expect(dead.map((r) => r.name)).toEqual(ACCOUNT_REGISTRY.map((e) => e.name));
  });

  it('always returns one entry per named account, so none can be silently dropped', async () => {
    const results = await getAccountUsage({
      env: ENV, noCache: true, fs: fsWithTokens({}), fetchImpl: async () => okResponse(usageBody(1, 1)),
    });
    expect(results.map((r) => r.name)).toEqual([
      'Deep Soul Sessions', 'Code Street Labs', 'Rick Felix 2000',
    ]);
  });
});
