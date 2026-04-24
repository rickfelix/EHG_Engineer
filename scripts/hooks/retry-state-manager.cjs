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
 * @param {string} toolName
 * @param {Object} input
 * @returns {string|null}
 */
function signatureFor(toolName, input) {
  if (!toolName || !input) return null;
  if (toolName === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (!cmd) return null;
    const hash = crypto.createHash('sha256').update(cmd).digest('hex').slice(0, 16);
    return `Bash:${hash}`;
  }
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit') {
    const fp = typeof input.file_path === 'string' ? input.file_path : '';
    if (!fp) return null;
    return `${toolName}:${fp}`;
  }
  return null;
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

  const params = new URLSearchParams();
  params.set('select', 'created_at');
  params.set('sub_agent_code', 'eq.RCA');
  params.set('sd_id', `eq.${sdKey}`);
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
 * @param {string} sessionId
 * @param {string} sdKey
 * @param {string} toolName
 * @param {Object} toolInput
 * @param {Object} [opts]
 * @param {Function} [opts.rcaCheck] - injectable async (sdKey, lastResetAt) => ISO|null
 * @param {number}   [opts.now]      - injectable current time in ms (for tests)
 * @returns {Promise<{ attempts: number, signature: string|null, rcaResetApplied: boolean }>}
 */
async function recordAndCount(sessionId, sdKey, toolName, toolInput, opts = {}) {
  const signature = signatureFor(toolName, toolInput);
  if (!sessionId || !signature) {
    return { attempts: 0, signature: null, rcaResetApplied: false };
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
  pruneStale,
  stateFilePath,
  RETRY_WINDOW_MS
};
