/**
 * Account identity resolution, duplicate-identity refusal, and the EXHAUSTED state.
 * SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-1, FR-2, FR-3).
 *
 * HERMETIC BY CONSTRUCTION. Every identity here is injected via the getAccountIdentity seam and
 * every fetch is stubbed, so nothing reads the real logged-in account. That matters twice over:
 * the duplicate-identity condition is live on the dev host today, which makes it tempting to
 * "test" against real state — but a fixture that depends on whose credentials happen to be on
 * disk is not a test, and TR-4 forbids value-specific acceptance because this host churns.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const reader = require_(path.join(REPO, 'lib/fleet/account-usage-reader.cjs'));
const {
  UNAVAILABLE_REASONS, accountConfigJsonPath, resolveSlotIdentities,
  findIdentityCollisions, readAllAccounts, ACCOUNT_REGISTRY,
  resolveDisplayIdentities, identityDisplayMap, contestedDisplayLabels,
} = reader;

const ENV = { USERPROFILE: 'C:\\Users\\test' };

/** Stub fetch returning a given status; body shape only matters for the 200 case. */
function fetchReturning(status, body = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}
/** Credentials present for every slot, so token-absence never masks the path under test. */
const fsWithTokens = {
  readFileSync: () => JSON.stringify({ claudeAiOauth: { accessToken: 'stub-token-not-a-real-secret' } }),
};

describe('FR-1 — config path resolution', () => {
  it('host default identity config is a SIBLING of the config dir, not inside it', () => {
    // This asymmetry misled this SD's own LEAD check: credentials live at ~/.claude/.credentials.json
    // but the identity config is ~/.claude.json. Probing the wrong one reports a readable account
    // as absent — which is exactly the false claim that had to be retracted.
    const hostEntry = ACCOUNT_REGISTRY.find((e) => e.hostDefault);
    const p = accountConfigJsonPath(hostEntry, ENV);
    expect(p).toMatch(/\.claude\.json$/);
    expect(p).not.toMatch(/\.claude[\\/]\.claude\.json$/);
  });

  it('a profile keeps its identity config INSIDE the profile dir', () => {
    const profEntry = ACCOUNT_REGISTRY.find((e) => e.profile);
    const p = accountConfigJsonPath(profEntry, ENV);
    expect(p).toMatch(new RegExp(`${profEntry.profile}[\\\\/]\\.claude\\.json$`));
  });

  it('an entry naming no resolvable location yields null rather than a guessed path', () => {
    expect(accountConfigJsonPath({ name: 'X', profile: '../escape' }, ENV)).toBeNull();
  });
});

describe('FR-2 — duplicate identity is detected across slots, never within one', () => {
  it('two slots resolving to the same account are reported as a collision', () => {
    const ids = new Map([['A', 'uuid-same'], ['B', 'uuid-same'], ['C', 'uuid-other']]);
    const groups = findIdentityCollisions(ids);
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual(['A', 'B']);
  });

  it('unresolvable slots never collide with each other', () => {
    // Two accounts that cannot be identified are not "the same account" — treating null as a
    // value would manufacture a collision out of two absences.
    expect(findIdentityCollisions(new Map([['A', null], ['B', null]]))).toEqual([]);
  });

  it('distinct identities produce no collision', () => {
    expect(findIdentityCollisions(new Map([['A', 'u1'], ['B', 'u2']]))).toEqual([]);
  });

  it('resolveSlotIdentities keys on accountUuid8 — the email never becomes the key', () => {
    const seen = [];
    const ids = resolveSlotIdentities({
      env: ENV,
      getAccountIdentity: (p) => { seen.push(p); return { email: 'a@b.invalid', orgName: 'Org', accountUuid8: 'uuid-1' }; },
    });
    expect([...ids.values()].every((v) => v === 'uuid-1')).toBe(true);
    // Every value is the uuid, never the address.
    expect([...ids.values()].some((v) => String(v).includes('@'))).toBe(false);
    expect(seen.every((p) => p.endsWith('.claude.json'))).toBe(true);
  });
});

describe('FR-2 — readAllAccounts refuses to attribute quota it cannot vouch for', () => {
  // These tests spy on console.warn, and this project sets no global restoreMocks — so without an
  // explicit restore the spy leaks into every later test in the file and silently swallows their
  // output. That exact leakage produced a mystery failure on a sibling SD this session; restoring
  // per-test is cheaper than diagnosing it twice.
  afterEach(() => { vi.restoreAllMocks(); });

  it('collided slots render as duplicate_identity instead of showing a number', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await readAllAccounts({
      env: ENV,
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 7 }, seven_day: { utilization: 2 } }),
      // EVERY slot resolves to one account — the live condition on the dev host, injected.
      getAccountIdentity: () => ({ email: 'x@y.invalid', orgName: 'Org', accountUuid8: 'same-uuid' }),
    });
    const configured = out.filter((r) => r.reason !== UNAVAILABLE_REASONS.NOT_CONFIGURED);
    expect(configured.length).toBeGreaterThan(1);
    for (const r of configured) {
      expect(r.state).toBe('unavailable');
      expect(r.reason).toBe(UNAVAILABLE_REASONS.DUPLICATE_IDENTITY);
      // The defect was showing a NUMBER under the wrong label. There must be no number.
      expect(r.weeklyPct).toBeUndefined();
    }
  });

  it('the fail-loud message names slots by LABEL and never leaks the identity', async () => {
    const lines = [];
    vi.spyOn(console, 'warn').mockImplementation((l) => lines.push(String(l)));
    await readAllAccounts({
      env: ENV,
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 1 }, seven_day: { utilization: 1 } }),
      getAccountIdentity: () => ({ email: 'leak@should.invalid', orgName: 'OrgName', accountUuid8: 'uuid-leak' }),
    });
    const line = lines.find((l) => l.includes('duplicate_identity'));
    expect(line).toBeTruthy();
    expect(line).not.toContain('leak@should.invalid');
    expect(line).not.toContain('uuid-leak');
    expect(line).not.toContain('OrgName');
    expect(JSON.parse(line).slots.length).toBeGreaterThan(1);
  });

  it('distinct identities pass through untouched — no false positive', async () => {
    let n = 0;
    const out = await readAllAccounts({
      env: ENV,
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 5 }, seven_day: { utilization: 3 } }),
      getAccountIdentity: () => ({ email: `a${n}@b.invalid`, orgName: 'O', accountUuid8: `uuid-${n++}` }),
    });
    expect(out.some((r) => r.reason === UNAVAILABLE_REASONS.DUPLICATE_IDENTITY)).toBe(false);
  });
});

describe('FR-3 — EXHAUSTED is distinct from UNREACHABLE', () => {
  it('HTTP 429 yields exhausted, not unreachable', async () => {
    const out = await readAllAccounts({
      env: ENV, fs: fsWithTokens, fetchImpl: fetchReturning(429),
      getAccountIdentity: (p) => ({ email: 'e@f.invalid', orgName: 'O', accountUuid8: `u-${p}` }),
    });
    const configured = out.filter((r) => r.reason !== UNAVAILABLE_REASONS.NOT_CONFIGURED);
    expect(configured.length).toBeGreaterThan(0);
    for (const r of configured) expect(r.reason).toBe(UNAVAILABLE_REASONS.EXHAUSTED);
  });

  it('a genuine non-2xx is still unreachable — the catch-all is not swallowed', async () => {
    const out = await readAllAccounts({
      env: ENV, fs: fsWithTokens, fetchImpl: fetchReturning(503),
      getAccountIdentity: (p) => ({ email: 'e@f.invalid', orgName: 'O', accountUuid8: `u-${p}` }),
    });
    const configured = out.filter((r) => r.reason !== UNAVAILABLE_REASONS.NOT_CONFIGURED);
    for (const r of configured) expect(r.reason).toBe(UNAVAILABLE_REASONS.UNREACHABLE);
  });

  it('401 still yields unauthorized — 429 was inserted before the catch-all, not before this', async () => {
    const out = await readAllAccounts({
      env: ENV, fs: fsWithTokens, fetchImpl: fetchReturning(401),
      getAccountIdentity: (p) => ({ email: 'e@f.invalid', orgName: 'O', accountUuid8: `u-${p}` }),
    });
    const configured = out.filter((r) => r.reason !== UNAVAILABLE_REASONS.NOT_CONFIGURED);
    for (const r of configured) expect(r.reason).toBe(UNAVAILABLE_REASONS.UNAUTHORIZED);
  });
});

describe('FR-1 — display mapping is configuration, and unset is safe', () => {
  it('unset FLEET_ACCOUNT_IDENTITY_MAP keeps registry labels (today behaviour)', async () => {
    let n = 0;
    const out = await readAllAccounts({
      env: ENV, fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 1 }, seven_day: { utilization: 1 } }),
      getAccountIdentity: () => ({ email: 'a@b.invalid', orgName: 'O', accountUuid8: `u-${n++}` }),
    });
    expect(out.map((r) => r.name)).toEqual(ACCOUNT_REGISTRY.map((e) => e.name));
  });

  it('a configured map relabels a slot from its CREDENTIALS, not its directory', async () => {
    const out = await readAllAccounts({
      env: { ...ENV, FLEET_ACCOUNT_IDENTITY_MAP: JSON.stringify({ 'u-0': 'True Account Name' }) },
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 1 }, seven_day: { utilization: 1 } }),
      getAccountIdentity: (() => { let i = 0; return () => ({ email: 'a@b.invalid', orgName: 'O', accountUuid8: `u-${i++}` }); })(),
    });
    expect(out.map((r) => r.name)).toContain('True Account Name');
  });

  it('THE KEYING PIN — display identities are keyed exactly as the readings are named', async () => {
    // The defect this pins: identities were resolved under RAW registry slot names while the
    // readings carried RELABELLED ones, so every consumer lookup missed and account_uuid8 was
    // persisted NULL — but ONLY when FLEET_ACCOUNT_IDENTITY_MAP was set, i.e. only when the
    // feature was actually configured. Invisible in production and invisible to every test that
    // did not compare the two key spaces. Assert the invariant that was violated, not the symptom.
    let i = 0;
    const opts = {
      env: { ...ENV, FLEET_ACCOUNT_IDENTITY_MAP: JSON.stringify({ 'u-0': 'True Account Name' }) },
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 1 }, seven_day: { utilization: 1 } }),
      getAccountIdentity: () => ({ email: 'a@b.invalid', orgName: 'O', accountUuid8: `u-${i++}` }),
    };
    const readings = await readAllAccounts(opts);
    i = 0; // same identity sequence, so the two calls describe the same fleet
    const identities = resolveDisplayIdentities(opts);
    expect([...identities.keys()].sort()).toEqual(readings.map((r) => r.name).sort());
    expect([...identities.keys()]).toContain('True Account Name');
  });

  it('a display name cannot smuggle control characters into logs or the API response', () => {
    // identityDisplayMap is operator-supplied config whose value reaches the API response AND a
    // console.warn line. The snapshot writer sanitises only at the DB boundary, so without this
    // the config could inject terminal escapes into fleet logs.
    const map = identityDisplayMap({
      FLEET_ACCOUNT_IDENTITY_MAP: JSON.stringify({ 'u-0': 'Bad\x1b[31mName\x00' }),
    });
    expect(map.get('u-0')).toBe('Bad[31mName');
  });

  it('TWO ACCOUNTS, ONE NAME — a contested label collapses nothing and attributes nothing', async () => {
    // findIdentityCollisions groups by uuid8, so it cannot see the mirror-image misconfiguration:
    // two DIFFERENT accounts mapped to the SAME display name. Before this, relabelling was
    // last-write-wins — the Map silently kept one, two accounts shared an account_name (and so a
    // history row-space under UNIQUE(account_name, fetched_at)), and each could show the other's
    // number. One config typo away, and invisible.
    let i = 0;
    const out = await readAllAccounts({
      env: { ...ENV, FLEET_ACCOUNT_IDENTITY_MAP: JSON.stringify({ 'u-0': 'Same Name', 'u-1': 'Same Name' }) },
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 1 }, seven_day: { utilization: 1 } }),
      getAccountIdentity: () => ({ email: 'a@b.invalid', orgName: 'O', accountUuid8: `u-${i++}` }),
    });
    // Nothing collapsed: still one reading per registry slot, under distinct names.
    expect(out).toHaveLength(ACCOUNT_REGISTRY.length);
    expect(new Set(out.map((r) => r.name)).size).toBe(ACCOUNT_REGISTRY.length);
    // And the two contested slots are refused rather than shown under a name we cannot vouch for.
    const contestedReadings = out.filter((r) => r.reason === UNAVAILABLE_REASONS.DUPLICATE_IDENTITY);
    expect(contestedReadings).toHaveLength(2);
    for (const r of contestedReadings) expect(r.weeklyPct).toBeUndefined();
  });

  it('A LABEL CANNOT LAND ON ANOTHER SLOT\'S OWN NAME', async () => {
    // The label namespace includes the RAW registry names, not just the mapped ones. A label
    // claimed by exactly one account looks uncontested by a mapped-vs-mapped check, gets applied,
    // and lands on the name a slot without a mapping already keeps — two readings under one name,
    // sharing a natural key in account_usage_snapshots and each other's retained figures.
    const victim = ACCOUNT_REGISTRY[0].name; // a slot that keeps its own name
    let i = 0;
    const out = await readAllAccounts({
      env: { ...ENV, FLEET_ACCOUNT_IDENTITY_MAP: JSON.stringify({ 'u-1': victim }) },
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 1 }, seven_day: { utilization: 1 } }),
      getAccountIdentity: () => ({ email: 'a@b.invalid', orgName: 'O', accountUuid8: `u-${i++}` }),
    });
    expect(new Set(out.map((r) => r.name)).size).toBe(ACCOUNT_REGISTRY.length);
    // The slot that rightfully owns the name is NOT penalised for someone else's config.
    expect(out.find((r) => r.name === victim)?.reason)
      .not.toBe(UNAVAILABLE_REASONS.DUPLICATE_IDENTITY);
  });

  it('a slot mapped to its OWN name contests nothing', () => {
    // Self-mapping is legitimate and must not be mistaken for a collision, or a correct config
    // would render every slot unattributable.
    const contested = contestedDisplayLabels(
      new Map([['Slot A', 'u-0'], ['Slot B', 'u-1']]),
      new Map([['u-0', 'Slot A']]),
    );
    expect([...contested]).toEqual([]);
  });

  it('malformed map config never breaks the strip', async () => {
    let n = 0;
    const out = await readAllAccounts({
      env: { ...ENV, FLEET_ACCOUNT_IDENTITY_MAP: '{not json' },
      fs: fsWithTokens,
      fetchImpl: fetchReturning(200, { five_hour: { utilization: 1 }, seven_day: { utilization: 1 } }),
      getAccountIdentity: () => ({ email: 'a@b.invalid', orgName: 'O', accountUuid8: `u-${n++}` }),
    });
    expect(out).toHaveLength(ACCOUNT_REGISTRY.length);
  });
});
