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
async function readAllAccounts(opts = {}) {
  return Promise.all(ACCOUNT_REGISTRY.map((entry) => readOneAccount(entry, opts)));
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
