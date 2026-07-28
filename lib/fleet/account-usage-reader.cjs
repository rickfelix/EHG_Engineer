// SD-LEO-FEAT-ACCOUNT-USAGE-STRIP-001 (FR-1, FR-2, FR-3, FR-7) — per-account weekly quota usage.
//
// WHY THIS EXISTS: quota is the cost currency on the Max plan, and on 2026-07-25 the fleet went
// down because one account (Deep Soul Sessions) hit its weekly limit with no readout anywhere.
// The pre-existing gauge (account-capacity-gauge.cjs) is fed by hand from the chairman's pasted
// /usage dashboard; this module reads the meters directly, per account, server-side.
//
// FAIL VISIBLY IS THE WHOLE POINT. The upstream endpoint is UNDOCUMENTED, so every failure mode
// resolves to an explicit `unavailable` + reason — never a stale number, never a coerced 0, never
// a dash. A gauge showing yesterday's figure is worse than no gauge, because it reads as safe.
// This is deliberately the OPPOSITE of two conventions already in this repo, both of which would
// silently render "low usage" for an account nobody can actually read:
//   - account-capacity-gauge.cjs rankAccountsByHeadroom(): "unknown meters read as 0% used".
//   - buildNamedAccountChips() -> {wkPct: null} -> fleet-panel-format.js renders 'wk --% used'.
//
// FR-7 — NO CREDENTIAL MATERIAL LEAVES THIS MODULE. The bearer token is request-local: never
// returned, never cached, never logged. No config directory, profile name or file path appears in
// any returned field. The only failure vocabulary that escapes is the closed UNAVAILABLE_REASONS
// enum, so a raw upstream body or header can never reach a browser through `reason`.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
// SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-1): the fleet's EXISTING identity resolver, already
// used by account-capacity-gauge.cjs, spawn-executor-core.cjs, adam-quiet-tick.mjs and
// assign-fleet-identities.cjs. This reader was the one account-aware surface that did not consult
// it — a wiring gap, not a missing capability. It returns a strict 3-field whitelist
// {email, orgName, accountUuid8}, sanitizes control/ANSI characters, accepts a config-path
// injection seam so tests never touch the real logged-in account, and never throws.
const { getAccountIdentity } = require('./account-identity.cjs');

/** Verified live at HTTP 200 during research (SD scope). Do not re-derive this contract. */
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

/** REQUIRED — the endpoint 404/400s without it. Verified during research. */
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';

// Bounded so an unreachable upstream cannot hang the fleet-panel response (FR-2 acceptance).
// The three accounts are fetched in PARALLEL, so this is the worst case for the whole strip, not
// per account. The route deliberately awaits this rather than returning a "pending" state: FR-3's
// reason enum is closed, and a bounded wait amortized by CACHE_TTL_MS was the ratified trade.
const DEFAULT_TIMEOUT_MS = 5000;

// Amortize upstream calls: the page polls /api/fleet-panel every 15s, and hammering an
// undocumented endpoint 3x per 15s invites the rate-limiting that would itself read as failure.
// Well inside STALE_AFTER_MS, and `fetchedAt` always reports the true read time — a cached
// reading is never presented as fresher than it is. On expiry a dead upstream resolves to
// `unavailable`; a stale SUCCESS is never re-served.
const CACHE_TTL_MS = 60_000;

/** A reading older than this is marked stale by the UI rather than shown as current (FR-6). */
const STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * CLOSED enum — the only failure vocabulary that may reach the client (FR-3, FR-7).
 *   not_configured  — no resolvable config dir / no readable token for that account
 *   unauthorized    — upstream rejected the token (401/403)
 *   unexpected_shape— HTTP 200 but the body is not the shape research verified
 *   timeout         — bounded wait elapsed
 *   unreachable     — network failure, or any other non-2xx status
 */
const UNAVAILABLE_REASONS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  UNAUTHORIZED: 'unauthorized',
  UNEXPECTED_SHAPE: 'unexpected_shape',
  TIMEOUT: 'timeout',
  UNREACHABLE: 'unreachable',
  // SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-3): an account that has spent its quota is not
  // unreachable — it is answering, and answering 429. Before this member existed a 429 fell
  // through the !res.ok branch below into UNREACHABLE, so "exhausted" was not merely un-rendered,
  // it was UNREPRESENTABLE: the reader had no way to say it and the strip had no way to show it.
  //
  // THIS MEMBER MUST EXIST BEFORE ANY PERSISTENCE LANDS (FR-4). Persisting first would faithfully
  // record 'unreachable' for exhausted accounts, and the distinction would then be unrecoverable
  // from history — the exact thing FR-6 exists to preserve.
  EXHAUSTED: 'exhausted',
  // Distinct from EXHAUSTED: the account resolved and answered, but two registry slots claim the
  // same account, so we cannot say WHOSE quota this is. Rendering a number here would attribute
  // one account's usage to another — the defect this SD was filed for.
  DUPLICATE_IDENTITY: 'duplicate_identity',
});

const REASON_VALUES = Object.freeze(Object.values(UNAVAILABLE_REASONS));

/** Same guard as spawn-control.js resolveProfileDir — never a raw/absolute/traversal path. */
const PROFILE_NAME_RE = /^[A-Za-z0-9_-]+$/;

function homeDir(env) {
  return env.USERPROFILE || os.homedir();
}

/**
 * The host-default profile's credential directory.
 *
 * THIS IS WHY resolveProfileDir COULD NOT BE REUSED (FR-1): it is a bare
 * path.win32.join(FLEET_ACCOUNT_PROFILES_DIR, name) and STRUCTURALLY CANNOT express the host
 * default, which lives outside the profiles dir. Note the host default splits its two files —
 * credentials at ~/.claude/.credentials.json but config at ~/.claude.json (one level UP, verified
 * on this host) — which is also why pointing CLAUDE_CONFIG_DIR at ~/.claude does not work for it.
 * Only the credentials file is needed here.
 */
function hostDefaultConfigDir(env) {
  return path.win32.join(homeDir(env), '.claude');
}

/**
 * Base dir for CLAUDE_CONFIG_DIR-style fleet profiles.
 *
 * DEFAULTS RATHER THAN THROWS, deliberately: FLEET_ACCOUNT_PROFILES_DIR is UNSET on the live
 * fleet host (measured), while ~/.claude-fleet-profiles/canary exists and holds real credentials.
 * resolveProfileDir throws when the env var is missing, which here would render a genuinely
 * readable account as not_configured — a misleading gauge, which this SD forbids. The env var
 * still wins when an operator sets it.
 */
function profilesBaseDir(env) {
  return env.FLEET_ACCOUNT_PROFILES_DIR || path.win32.join(homeDir(env), '.claude-fleet-profiles');
}

/**
 * The three accounts the fleet rotates across, in the chairman's own naming (FR-1).
 *
 * EXPLICIT MAP, NOT NAME-MATCHING. Do not reintroduce a regex over orgName the way
 * account-capacity-gauge.cjs NAMED_ACCOUNT_REGISTRY does: its /rick\s*felix/i does not match the
 * canary profile's real orgName, which is "Richard Felix" (verified on this host) — an honest
 * value answering the wrong question. Identity here comes from WHICH DIRECTORY was read, which
 * cannot drift from the credentials it supplied.
 *
 * Deep Soul Sessions has NO config directory on this host, so it resolves to not_configured until
 * a profile is provisioned — the account whose exhaustion took the fleet down is shown as
 * unreadable rather than omitted. Provisioning it under ~/.claude-fleet-profiles/deepsoul needs no
 * code change; a different directory name needs exactly this one line.
 */
const ACCOUNT_REGISTRY = Object.freeze([
  Object.freeze({ name: 'Deep Soul Sessions', profile: 'deepsoul' }),
  Object.freeze({ name: 'Code Street Labs', hostDefault: true }),
  Object.freeze({ name: 'Rick Felix 2000', profile: 'canary' }),
]);

/** Resolve one registry entry to its credential directory, or null when unresolvable. */
function resolveAccountConfigDir(entry, env = process.env) {
  if (entry.hostDefault) return hostDefaultConfigDir(env);
  if (typeof entry.profile !== 'string' || !PROFILE_NAME_RE.test(entry.profile)) return null;
  return path.win32.join(profilesBaseDir(env), entry.profile);
}

/**
 * Read one account's bearer token from its own .credentials.json (shape claudeAiOauth.accessToken,
 * verified on disk). Returns null on ANY failure — missing dir, missing file, bad JSON, absent or
 * empty token. NEVER throws, and never logs the value or the path.
 */
function readAccessToken(configDir, fsImpl = fs) {
  try {
    const raw = fsImpl.readFileSync(path.win32.join(configDir, '.credentials.json'), 'utf8');
    const token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Coerce an upstream utilization figure to a percentage, or null when it is not one.
 *
 * Research measured PERCENT-SCALED values (54.0 and 11.0), so no x100 is applied. Values outside
 * 0..100 are rejected as an unexpected shape. RESIDUAL RISK, recorded rather than papered over: a
 * future upstream switch to 0..1 FRACTIONS is undetectable here — 0.54 is a legal percentage — and
 * would under-report. Nothing in the payload disambiguates scale, so this bound is the honest
 * limit of what can be validated locally.
 */
function toPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return Math.round(value * 10) / 10;
}

/**
 * Normalize a timestamp to canonical ISO, or null. Display-only, never load-bearing.
 *
 * RE-DERIVES rather than passing the upstream string through: V8's legacy Date parser treats
 * parenthesized trailing text as a comment, so a value like "Dec 25 1995 (<script>…)" parses
 * successfully and would otherwise reach the browser verbatim. Returning the re-derived ISO form
 * means only a date can escape this function, whatever the upstream sends.
 */
function toIsoOrNull(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * The unavailable shape. NOTE WHAT IS ABSENT: no weeklyPct key at all, not a null one (FR-3).
 * A nullable percentage is precisely what produces the forbidden dash — `wkPct ?? '--'` — so the
 * key does not exist unless there is a real reading behind it, and a consumer cannot render a
 * number without first branching on `state`.
 */
function unavailable(name, reason, fetchedAt) {
  return { name, state: 'unavailable', reason, fetchedAt };
}

/**
 * Read ONE account. Independent by construction: this function owns every failure path for its
 * own account and never throws, so one account's outage can neither suppress nor alter another's
 * reading. That independence is what makes provisioning Deep Soul later a config change.
 */
async function readOneAccount(entry, opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const fsImpl = opts.fs || fs;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchedAt = new Date(opts.nowMs ?? Date.now()).toISOString();

  const configDir = resolveAccountConfigDir(entry, env);
  const token = configDir ? readAccessToken(configDir, fsImpl) : null;
  if (!token) return unavailable(entry.name, UNAVAILABLE_REASONS.NOT_CONFIGURED, fetchedAt);
  if (typeof fetchImpl !== 'function') {
    return unavailable(entry.name, UNAVAILABLE_REASONS.UNREACHABLE, fetchedAt);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(USAGE_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': OAUTH_BETA_HEADER,
        accept: 'application/json',
      },
    });
  } catch (err) {
    // Abort is the bounded-timeout path; anything else is a transport failure. The error itself is
    // deliberately not surfaced — only the enum value crosses the boundary (FR-7).
    const aborted = err?.name === 'AbortError' || controller.signal.aborted;
    const reason = aborted ? UNAVAILABLE_REASONS.TIMEOUT : UNAVAILABLE_REASONS.UNREACHABLE;
    return unavailable(entry.name, reason, fetchedAt);
  } finally {
    clearTimeout(timer);
  }

  if (res?.status === 401 || res?.status === 403) {
    return unavailable(entry.name, UNAVAILABLE_REASONS.UNAUTHORIZED, fetchedAt);
  }
  // SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-3): 429 means the account ANSWERED and is out of
  // quota. It must be checked BEFORE the generic !res.ok fall-through below, which is where it
  // used to land — indistinguishable from a network failure both here and, consequently, on the
  // strip. This ordering is the whole fix: a more specific status check ahead of the catch-all.
  if (res?.status === 429) {
    return unavailable(entry.name, UNAVAILABLE_REASONS.EXHAUSTED, fetchedAt);
  }
  if (!res?.ok) return unavailable(entry.name, UNAVAILABLE_REASONS.UNREACHABLE, fetchedAt);

  let body;
  try {
    body = await res.json();
  } catch {
    return unavailable(entry.name, UNAVAILABLE_REASONS.UNEXPECTED_SHAPE, fetchedAt);
  }

  // BOTH meters are required for `ok`. Research verified both present at HTTP 200, and TR-3 makes
  // an unexpected shape a first-class unavailable reason — so a body that has lost a field is
  // treated as untrustworthy rather than partially believed. Relaxing this to weekly-only would be
  // a deliberate decision, not a tidy-up.
  const weeklyPct = toPct(body?.seven_day?.utilization);
  const fiveHourPct = toPct(body?.five_hour?.utilization);
  if (weeklyPct === null || fiveHourPct === null) {
    return unavailable(entry.name, UNAVAILABLE_REASONS.UNEXPECTED_SHAPE, fetchedAt);
  }

  // Dollar amounts and per-model buckets come back NULL upstream (confirmed in research), so
  // nothing here reads them.
  return {
    name: entry.name,
    state: 'ok',
    weeklyPct,
    fiveHourPct,
    // resets_at is display sugar: a missing one degrades to null WITHOUT failing the reading,
    // because the percentage is the load-bearing value. Explicitly a decision, not an oversight.
    weeklyResetsAt: toIsoOrNull(body?.seven_day?.resets_at),
    fiveHourResetsAt: toIsoOrNull(body?.five_hour?.resets_at),
    fetchedAt,
  };
}

/** Read every registry account in parallel. Always returns one entry per account, in order. */
/**
 * The .claude.json holding oauthAccount for a registry entry.
 *
 * SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-1). NOTE THE ASYMMETRY, which is easy to get wrong and
 * did in fact mislead this SD's own LEAD check: credentials live INSIDE the config dir
 * (<configDir>/.credentials.json, so ~/.claude/.credentials.json for the host default), but the
 * identity config is ~/.claude.json — a SIBLING of that directory, not a file within it. A fleet
 * PROFILE keeps both together inside the profile dir. Probing the wrong one of these reports a
 * perfectly readable account as absent.
 *
 * @returns {string|null} path to the config json, or null when the entry resolves nowhere
 */
function accountConfigJsonPath(entry, env = process.env) {
  if (entry.hostDefault) return path.win32.join(homeDir(env), '.claude.json');
  if (typeof entry.profile !== 'string' || !PROFILE_NAME_RE.test(entry.profile)) return null;
  return path.win32.join(profilesBaseDir(env), entry.profile, '.claude.json');
}

/**
 * Resolve each registry slot to the account its CREDENTIALS actually name.
 *
 * FR-1: identity used to come from WHICH DIRECTORY was read, and the module comment asserted that
 * "cannot drift from the credentials it supplied". A re-auth falsifies it — the directory stays
 * put while the account behind it changes, and the strip keeps the stale label. Delegates to the
 * EXISTING lib/fleet/account-identity.cjs (already used by account-capacity-gauge, spawn-executor-core,
 * adam-quiet-tick and assign-fleet-identities); building a second identity path here would add a
 * THIRD notion of account identity beside two that already disagree.
 *
 * Keyed on accountUuid8, never the email: the uuid is already whitelisted and sanitized by that
 * module, and using it means the address never enters a comparison, a log line, a fail-loud
 * message, or a persisted row.
 *
 * @returns {Map<string, string|null>} entry.name -> accountUuid8 (null when unresolvable)
 */
function resolveSlotIdentities(opts = {}) {
  const env = opts.env || process.env;
  const identityImpl = opts.getAccountIdentity || getAccountIdentity;
  const out = new Map();
  for (const entry of ACCOUNT_REGISTRY) {
    const cfgPath = accountConfigJsonPath(entry, env);
    let uuid8 = null;
    if (cfgPath) {
      // getAccountIdentity is fail-safe (null on missing file / parse error / malformed shape)
      // and never throws, so no try/catch is needed to keep the strip rendering.
      const identity = identityImpl(cfgPath);
      uuid8 = identity && typeof identity.accountUuid8 === 'string' ? identity.accountUuid8 : null;
    }
    out.set(entry.name, uuid8);
  }
  return out;
}

/**
 * Optional accountUuid8 -> display-name map, from FLEET_ACCOUNT_IDENTITY_MAP as JSON.
 *
 * SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-1). WHY CONFIGURATION RATHER THAN A CONSTANT: the real
 * account identifiers are deliberately NOT in this repo. account-capacity-gauge.cjs:102 records
 * that choice outright — it matches on orgName precisely because "the real accountUuid8 values"
 * are not committed — and its regex consequence is the known-broken match this reader's own header
 * criticises (/rick\s*felix/i missing the canary's actual orgName "Richard Felix"). Hardcoding
 * either identifier here would repeat that, and committing real ones would put account identifiers
 * in source. So the mapping is supplied by the host that knows its own accounts.
 *
 * WHEN UNSET the labels fall back to the registry's directory-derived names — i.e. today's
 * behaviour — but that fallback is now SAFE in a way it was not before: findIdentityCollisions
 * below refuses to render a number under a label it cannot vouch for. Unconfigured means
 * "possibly imprecise label", no longer "silently the wrong account's quota".
 *
 * @returns {Map<string,string>} uuid8 -> display name (empty when unset or malformed)
 */
function identityDisplayMap(env = process.env) {
  const raw = env.FLEET_ACCOUNT_IDENTITY_MAP;
  if (typeof raw !== 'string' || !raw.trim()) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const out = new Map();
    for (const [uuid8, name] of Object.entries(parsed)) {
      if (typeof name !== 'string') continue;
      // Strip control characters, not just clamp length. This name reaches the API response AND a
      // console.warn line; the snapshot writer sanitises only at the DB boundary, so an operator
      // could otherwise inject terminal escapes into fleet logs via a config value.
      // eslint-disable-next-line no-control-regex
      const clean = name.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
      if (clean) out.set(uuid8, clean.slice(0, 128));
    }
    return out;
  } catch {
    return new Map(); // malformed config must never break the strip
  }
}

/**
 * Re-key a slot->uuid8 map under the DISPLAY names the strip will actually show.
 *
 * Extracted so that readAllAccounts and resolveDisplayIdentities cannot disagree about the keying.
 * They previously did: the route resolved identities under RAW registry names while the readings
 * carried RELABELLED ones, so every lookup missed and account_uuid8 was written NULL — but only
 * when FLEET_ACCOUNT_IDENTITY_MAP was set, i.e. only when identity mapping was actually configured.
 */
function relabelIdentities(identities, displayMap, contested = contestedDisplayLabels(identities, displayMap)) {
  if (!(displayMap instanceof Map) || displayMap.size === 0) return identities;
  const remapped = new Map();
  for (const [origName, uuid8] of identities) {
    const mapped = uuid8 ? displayMap.get(uuid8) : null;
    // A contested label is not applied: doing so would give two DIFFERENT accounts the same key,
    // and a Map silently keeps only the last — collapsing two accounts into one on a config typo.
    remapped.set(mapped && !contested.has(mapped) ? mapped : origName, uuid8);
  }
  return remapped;
}

/**
 * Display labels claimed by MORE THAN ONE distinct account.
 *
 * findIdentityCollisions groups by uuid8 and therefore cannot see this: two slots with DIFFERENT
 * accounts mapped to the SAME name are not a uuid8 collision, but they are just as unattributable —
 * the label is what the strip shows and what account_usage_snapshots keys on, so a shared label
 * means a shared history row-space (UNIQUE(account_name, fetched_at) + ignoreDuplicates would
 * silently drop one, and each account could display the other's number). One config typo away.
 */
function contestedDisplayLabels(identities, displayMap) {
  if (!(displayMap instanceof Map) || displayMap.size === 0) return new Set();
  const byLabel = new Map();
  for (const [, uuid8] of identities) {
    if (!uuid8) continue;
    const label = displayMap.get(uuid8);
    if (!label) continue;
    if (!byLabel.has(label)) byLabel.set(label, new Set());
    byLabel.get(label).add(uuid8);
  }
  const out = new Set();
  for (const [label, uuids] of byLabel) if (uuids.size > 1) out.add(label);
  return out;
}

/**
 * Slot identities keyed by the same name the READINGS carry — the map a consumer of
 * getAccountUsage()/readAllAccounts() needs. Callers outside this module should prefer this over
 * resolveSlotIdentities, which is keyed by raw registry name.
 */
function resolveDisplayIdentities(opts = {}) {
  return relabelIdentities(resolveSlotIdentities(opts), identityDisplayMap(opts.env || process.env));
}

/**
 * Slot labels sharing one account identity.
 * @returns {string[][]} groups of 2+ entry.name values, one group per collided identity
 */
function findIdentityCollisions(identities) {
  const byUuid = new Map();
  for (const [name, uuid8] of identities) {
    if (!uuid8) continue; // unresolvable slots cannot collide with anything
    if (!byUuid.has(uuid8)) byUuid.set(uuid8, []);
    byUuid.get(uuid8).push(name);
  }
  return [...byUuid.values()].filter((names) => names.length > 1);
}

async function readAllAccounts(opts = {}) {
  const readings = await Promise.all(ACCOUNT_REGISTRY.map((entry) => readOneAccount(entry, opts)));

  // SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-2): the collision check lives HERE, not in
  // readOneAccount, because a duplicate is only visible across slots — one account read in
  // isolation looks perfectly healthy. That is exactly why the defect reached the chairman's
  // screen instead of a log: nothing ever compared the slots to each other.
  let identities = resolveSlotIdentities(opts);

  // FR-1: relabel from the CREDENTIALS where the host has told us who its accounts are. Applied
  // before the collision check so a correctly-relabelled slot is judged under its true name.
  const displayMap = identityDisplayMap(opts.env || process.env);
  const contested = contestedDisplayLabels(identities, displayMap);
  const relabelled = displayMap.size === 0 ? readings : readings.map((r) => {
    const uuid8 = identities.get(r.name);
    const mapped = uuid8 ? displayMap.get(uuid8) : null;
    // A contested label is deliberately NOT applied — see contestedDisplayLabels. The slot keeps
    // its own name and is failed below as unattributable, rather than quietly merging two accounts.
    return mapped && !contested.has(mapped) && mapped !== r.name ? { ...r, name: mapped } : r;
  });

  // Slots whose identity wants a contested label, recorded under the names they actually kept.
  const contestedSlots = new Set();
  for (const [slotName, uuid8] of identities) {
    const label = uuid8 ? displayMap.get(uuid8) : null;
    if (label && contested.has(label)) contestedSlots.add(slotName);
  }
  identities = relabelIdentities(identities, displayMap, contested);

  const collisions = findIdentityCollisions(identities);
  if (collisions.length === 0 && contestedSlots.size === 0) return relabelled;
  const readingsToMark = relabelled;
  for (const label of contested) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
      event: 'account_usage.contested_display_label',
      label,
      detail: 'two different accounts are configured with this display name, so neither can be attributed',
    }));
  }

  // Fail LOUD, and by LABEL only — never the identity value (VAL-02 / TR-1).
  // Both unattributable shapes land in one set: same account under two slots (uuid8 collision),
  // and two accounts claiming one label (contested label). They differ in cause, not in consequence.
  const collided = new Set([...collisions.flat(), ...contestedSlots]);
  for (const names of collisions) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
      event: 'account_usage.duplicate_identity',
      slots: names,
      detail: 'these registry slots resolve to the SAME account, so their quota cannot be attributed',
    }));
  }
  // Refuse to render a number under a label we cannot vouch for. Showing one account's usage under
  // another's name is the defect; showing nothing with a stated reason is the honest failure.
  const fetchedAt = readingsToMark[0]?.fetchedAt || new Date(opts.nowMs ?? Date.now()).toISOString();
  return readingsToMark.map((r) => (collided.has(r.name)
    ? unavailable(r.name, UNAVAILABLE_REASONS.DUPLICATE_IDENTITY, r.fetchedAt || fetchedAt)
    : r));
}

/**
 * Every account as unavailable for one reason — the shape a caller needs when it cannot get a
 * reading at all. Exported so the route's own safety net does not have to reinvent the registry;
 * an empty array there would render as a silently missing strip.
 */
function allUnavailable(reason, nowMs = Date.now()) {
  const fetchedAt = new Date(nowMs).toISOString();
  return ACCOUNT_REGISTRY.map((e) => unavailable(e.name, reason, fetchedAt));
}

let cache = null;

/**
 * Cached read for the route. NEVER throws and never returns a short array: a caller can rely on
 * one entry per named account, because an account missing from the strip is an invisible failure.
 */
async function getAccountUsage(opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const ttl = opts.cacheTtlMs ?? CACHE_TTL_MS;
  if (!opts.noCache && cache && nowMs - cache.at < ttl) return cache.value;
  try {
    const value = await readAllAccounts(opts);
    cache = { at: nowMs, value };
    return value;
  } catch {
    return allUnavailable(UNAVAILABLE_REASONS.UNREACHABLE, nowMs);
  }
}

/** Test seam only — drops the module-level cache between cases. */
function __resetUsageCache() {
  cache = null;
}

module.exports = {
  USAGE_URL,
  OAUTH_BETA_HEADER,
  DEFAULT_TIMEOUT_MS,
  CACHE_TTL_MS,
  STALE_AFTER_MS,
  UNAVAILABLE_REASONS,
  // SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-1/FR-2) — exported for unit testing, so the
  // collision path can be exercised with injected identities instead of real credentials.
  accountConfigJsonPath,
  resolveSlotIdentities,
  resolveDisplayIdentities,
  relabelIdentities,
  identityDisplayMap,
  contestedDisplayLabels,
  findIdentityCollisions,
  REASON_VALUES,
  ACCOUNT_REGISTRY,
  resolveAccountConfigDir,
  hostDefaultConfigDir,
  profilesBaseDir,
  readAccessToken,
  toPct,
  readOneAccount,
  readAllAccounts,
  allUnavailable,
  getAccountUsage,
  __resetUsageCache,
};
