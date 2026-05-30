'use strict';

/**
 * retry-state-manager.cjs — Transient per-SD tool retry counter.
 *
 * Backs ENFORCEMENT 11 (RCA Tiered Enforcement) in pre-tool-enforce.cjs.
 *
 * - State file:   .claude/retry-state-<session_id>.json (ephemeral, per session)
 * - Window:       10 minutes — invocations older than this do not count.
 * - Reset signal: a row in sub_agent_execution_results for sub_agent_code='RCA'
 *                 with created_at > state.reset_at clears all counters.
 *
 * Returned counts are tool+target specific:
 *   - Bash   → signature = 'Bash:' + sha256(command).slice(0, 16)
 *   - Edit/Write/MultiEdit → signature = '<tool>:' + absolute_file_path
 *
 * All disk / network errors are swallowed and the caller sees fail-open results
 * (attempts=0, rcaResetApplied=false) — the hook must never block on internal
 * bookkeeping failures.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RETRY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001 — UUID-shape regex.
// fetchRcaInvocationSince queries sub_agent_execution_results.sd_id which is
// UUID-typed. Callers may pass either UUID or sd_key string; non-UUID inputs
// must be resolved before the PostgREST filter (silent miss otherwise).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Module-scope 60s TTL cache for sd_key→UUID resolutions.
const _sdKeyToUuidCache = new Map(); // key -> { uuid: string|null, expires_at: number }
const SD_KEY_CACHE_TTL_MS = 60 * 1000;

// QF-20260504-830 — known-idempotent monitoring commands are exempt from
// signature dedup. RCA-TIERED ENFORCEMENT was tripping the 4th invocation of
// /coordinator periodic probes (all exit 0) the same way it gates retry loops.
// Patterns are matched against the raw Bash command string.
const EXEMPT_PATTERNS = [
  /\bscripts[/\\]stale-session-sweep\.cjs\b/,
  /\bscripts[/\\]fleet-dashboard\.cjs\b/,
  /\bscripts[/\\]assign-fleet-identities\.cjs\b/,
  /[/\\]?\.claude[/\\]tmp[/\\]coord-[\w-]+\.(?:cjs|mjs)\b/,
];

/**
 * Whether a Bash command should bypass invocation tracking entirely.
 * Returns false for any non-string input.
 * @param {string} commandStr
 * @returns {boolean}
 */
function isExempt(commandStr) {
  if (typeof commandStr !== 'string' || !commandStr) return false;
  return EXEMPT_PATTERNS.some(rx => rx.test(commandStr));
}

/**
 * Resolve the on-disk state path for a session.
 * @param {string} sessionId
 * @returns {string}
 */
function stateFilePath(sessionId) {
  const override = process.env.LEO_RETRY_STATE_DIR;
  const dir = override
    ? path.resolve(override)
    : path.resolve(__dirname, '../../.claude');
  return path.join(dir, `retry-state-${sessionId}.json`);
}

/**
 * Build a stable signature for a tool invocation.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: optional `lastOutcome` param mixes a
 * digest of {exit_code, stderr_sha} into the Bash signature so iterative TDD
 * (different failure each retry) does NOT collapse into the stuck-loop signature.
 * Same outcome → same digest → stuck-loop detection preserved.
 *
 * Edit/Write/MultiEdit signatures are unchanged — file_path is the natural key.
 *
 * @param {string} toolName
 * @param {Object} input
 * @param {{exit_code?: number|string, stderr_sha?: string}} [lastOutcome] - optional outcome
 *        from the prior tool call (captured by post-tool-rca-outcome.cjs).
 *        Without it, returns the legacy command-only signature (back-compat).
 * @returns {string|null}
 */
function signatureFor(toolName, input, lastOutcome) {
  if (!toolName || !input) return null;
  if (toolName === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (!cmd) return null;
    const hash = crypto.createHash('sha256').update(cmd).digest('hex').slice(0, 16);
    // Outcome admixture (back-compat: missing/malformed lastOutcome → command-only signature).
    if (
      lastOutcome &&
      typeof lastOutcome === 'object' &&
      (lastOutcome.exit_code !== undefined || lastOutcome.stderr_sha !== undefined)
    ) {
      const ec = lastOutcome.exit_code === undefined ? '' : String(lastOutcome.exit_code);
      const ss = typeof lastOutcome.stderr_sha === 'string' ? lastOutcome.stderr_sha : '';
      const outcomeDigest = crypto.createHash('sha256').update(`${ec}|${ss}`).digest('hex').slice(0, 8);
      return `Bash:${hash}:${outcomeDigest}`;
    }
    return `Bash:${hash}`;
  }
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit') {
    const fp = typeof input.file_path === 'string' ? input.file_path : '';
    if (!fp) return null;
    // SD-FDBK-ENH-PRE-TOOL-ENFORCE-001: mix an edit-CONTENT digest so DISTINCT edits to the
    // same file (a legit multi-part change) get DISTINCT signatures and do NOT accumulate as
    // retries; only IDENTICAL re-attempts (same content - the true blind-retry signal) share a
    // signature and trip the 3-strikes counter. Mirrors the Bash command+outcome admixture.
    let contentKey = '';
    if (toolName === 'Edit') {
      const o = typeof input.old_string === 'string' ? input.old_string : '';
      const n = typeof input.new_string === 'string' ? input.new_string : '';
      contentKey = JSON.stringify([o, n]);
    } else if (toolName === 'Write') {
      contentKey = typeof input.content === 'string' ? input.content : '';
    } else {
      try { contentKey = JSON.stringify(input.edits || []); } catch { contentKey = ''; }
    }
    const cdig = crypto.createHash('sha256').update(contentKey).digest('hex').slice(0, 12);
    return `${toolName}:${fp}:${cdig}`;
  }
  return null;
}

/**
 * Resolve sd_key string → UUID for sub_agent_execution_results.sd_id queries.
 * Returns null when input is null/undefined/unknown.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: closes silent UUID-vs-sd_key mismatch
 * (6th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * @param {string|null|undefined} sdKeyOrUuid
 * @returns {Promise<string|null>}
 */
async function resolveSdKeyToUuid(sdKeyOrUuid) {
  if (typeof sdKeyOrUuid !== 'string' || !sdKeyOrUuid) return null;
  // Already a UUID — pass through.
  if (UUID_REGEX.test(sdKeyOrUuid)) return sdKeyOrUuid;

  // Cache hit?
  const now = Date.now();
  const cached = _sdKeyToUuidCache.get(sdKeyOrUuid);
  if (cached && cached.expires_at > now) {
    return cached.uuid;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  // OR-query against strategic_directives_v2 (sd_key.eq.X OR id.eq.X).
  // Note: id column is UUID but PostgREST tolerates string equality in or() filter.
  const params = new URLSearchParams();
  params.set('select', 'id');
  params.set('or', `(sd_key.eq.${sdKeyOrUuid},id.eq.${sdKeyOrUuid})`);
  params.set('limit', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  let resolved = null;
  try {
    const resp = await fetch(`${url}/rest/v1/strategic_directives_v2?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].id === 'string') {
        resolved = rows[0].id;
      }
    }
  } catch {
    clearTimeout(timer);
    // Fail-open
  }

  _sdKeyToUuidCache.set(sdKeyOrUuid, { uuid: resolved, expires_at: now + SD_KEY_CACHE_TTL_MS });
  if (!resolved && process.env.LEO_TELEMETRY_DEBUG === '1') {
    process.stderr.write(`[retry-state-manager] sd_key resolution failed: ${sdKeyOrUuid}\n`);
  }
  return resolved;
}

/**
 * Read current state from disk. Returns an empty state on any error.
 * @param {string} sessionId
 * @returns {{ reset_at: string|null, invocations: Object<string, Array<number>> }}
 */
function readState(sessionId) {
  const empty = { reset_at: null, invocations: {} };
  try {
    const fp = stateFilePath(sessionId);
    if (!fs.existsSync(fp)) return empty;
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    if (!parsed.invocations || typeof parsed.invocations !== 'object') parsed.invocations = {};
    return parsed;
  } catch {
    return empty;
  }
}

/**
 * Atomically write state to disk. Swallows errors.
 * @param {string} sessionId
 * @param {Object} state
 */
function writeState(sessionId, state) {
  try {
    const fp = stateFilePath(sessionId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, fp);
  } catch {
    // Fail-open: bookkeeping failures never block enforcement.
  }
}

/**
 * Drop entries older than the retry window to keep state bounded.
 * @param {Object} state
 * @param {number} nowMs
 */
function pruneStale(state, nowMs) {
  for (const sig of Object.keys(state.invocations)) {
    const ts = state.invocations[sig].filter(t => nowMs - t <= RETRY_WINDOW_MS);
    if (ts.length === 0) {
      delete state.invocations[sig];
    } else {
      state.invocations[sig] = ts;
    }
  }
}

/**
 * Check Supabase for a recent rca-agent invocation tied to this SD.
 * Used to reset counters once the caller acts on an RCA.
 * @param {string} sdKey
 * @param {string|null} lastResetAt - ISO timestamp of prior reset (or null)
 * @returns {Promise<string|null>} Newest matching created_at, or null on none / error
 */
async function fetchRcaInvocationSince(sdKey, lastResetAt) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !sdKey) return null;

  // SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: resolve sd_key→UUID before the
  // PostgREST filter. sub_agent_execution_results.sd_id is UUID-typed; passing
  // a sd_key string silently mismatches and the reset never fires.
  const sdUuid = await resolveSdKeyToUuid(sdKey);
  if (!sdUuid) return null;

  const params = new URLSearchParams();
  params.set('select', 'created_at');
  params.set('sub_agent_code', 'eq.RCA');
  params.set('sd_id', `eq.${sdUuid}`);
  params.set('order', 'created_at.desc');
  params.set('limit', '1');
  if (lastResetAt) params.set('created_at', `gt.${lastResetAt}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const resp = await fetch(`${url}/rest/v1/sub_agent_execution_results?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0].created_at) {
      return rows[0].created_at;
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Record a tool invocation and return the current attempt count.
 * Also performs RCA-reset lookup and state pruning. Fail-open on all errors.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: optional `lastOutcome` param threads
 * the prior tool's outcome digest into the signature, allowing iterative TDD
 * to track at attempts=1 while preserving stuck-loop detection.
 *
 * @param {string} sessionId
 * @param {string} sdKey
 * @param {string} toolName
 * @param {Object} toolInput
 * @param {Object} [opts]
 * @param {Function} [opts.rcaCheck] - injectable async (sdKey, lastResetAt) => ISO|null
 * @param {number}   [opts.now]      - injectable current time in ms (for tests)
 * @param {Object}   [opts.lastOutcome] - {exit_code, stderr_sha} from prior tool call
 * @returns {Promise<{ attempts: number, signature: string|null, rcaResetApplied: boolean }>}
 */
async function recordAndCount(sessionId, sdKey, toolName, toolInput, opts = {}) {
  const signature = signatureFor(toolName, toolInput, opts.lastOutcome);
  if (!sessionId || !signature) {
    return { attempts: 0, signature: null, rcaResetApplied: false };
  }

  if (toolName === 'Bash' && isExempt(toolInput && toolInput.command)) {
    return { attempts: 0, signature, rcaResetApplied: false };
  }

  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const rcaCheck = opts.rcaCheck || fetchRcaInvocationSince;

  const state = readState(sessionId);
  pruneStale(state, now);

  let rcaResetApplied = false;
  try {
    const rcaAt = await rcaCheck(sdKey, state.reset_at);
    if (rcaAt) {
      state.invocations = {};
      state.reset_at = rcaAt;
      rcaResetApplied = true;
    }
  } catch {
    // Fail-open: don't block on reset-check errors.
  }

  const existing = Array.isArray(state.invocations[signature]) ? state.invocations[signature] : [];
  existing.push(now);
  state.invocations[signature] = existing;

  writeState(sessionId, state);

  return { attempts: existing.length, signature, rcaResetApplied };
}

module.exports = {
  recordAndCount,
  signatureFor,
  readState,
  writeState,
  fetchRcaInvocationSince,
  resolveSdKeyToUuid,
  pruneStale,
  stateFilePath,
  isExempt,
  RETRY_WINDOW_MS,
  UUID_REGEX,
  // Test-only export for cache reset between test cases
  _resetSdKeyCache: () => { _sdKeyToUuidCache.clear(); },
};
