/**
 * session-telemetry-writer.cjs — Non-blocking writer for claude_sessions telemetry columns.
 *
 * Part of SD-LEO-INFRA-WORKER-SOURCE-SIDE-001.
 *
 * Constraints this module lives under:
 *   1. MUST NOT block the tool call — all failures silently swallowed (debug log only)
 *   2. MUST NOT add new runtime deps — only `node:fetch` (Node 18+, already required)
 *   3. MUST stay under ~50ms p95 added to the PreToolUse/PostToolUse hooks
 *
 * How it works:
 *   Supabase exposes the PostgREST REST API at <SUPABASE_URL>/rest/v1/<table>.
 *   We fire a PATCH with ?session_id=eq.<id> — a standard PostgREST selector —
 *   using service-role auth. The HTTP request uses a hard 1.5s timeout (abort
 *   on slow DB) and we do NOT await the response — the hook returns immediately
 *   after sending the request. This is "fire-and-forget" but with a bounded
 *   timeout so we don't accumulate orphan connections.
 *
 *   The rationale for fetch-based writes (rather than spawning @supabase/supabase-js):
 *   hook processes are short-lived and started on every tool call. Importing the
 *   full Supabase SDK (>3MB of dependency graph) adds significant cold-start
 *   latency. A raw fetch keeps the hot path tiny.
 */

'use strict';

const TELEMETRY_TABLE = 'claude_sessions';
const TELEMETRY_FETCH_TIMEOUT_MS = 1500;

// QF-20260726-163: every telemetry write silently no-opped fleet-wide because this
// resolver read process.env ONLY. Claude Code does not propagate SUPABASE_* into
// PostToolUse subprocesses, so getSupabaseConfig() returned null on every tool call,
// the PATCH was never sent, and `Prefer: return=minimal` made the no-op indistinguishable
// from success — last_tool_at sat NULL on 0-of-15 seats and expected_silence_until never
// cleared, which is why a PARKED worker looked identical to a working one.
// The arm-side writer (loop-state-tracker.cjs -> lib/supabase-client.cjs) always worked
// precisely because that helper walks ancestors for .env. We must NOT require() that
// helper here: it pulls the ~3MB Supabase SDK onto a per-tool hot path (see header).
// So: keep the raw-fetch design and load .env ourselves, ONLY on the miss path.
// Ancestor walk rather than plain dotenv.config() (the sibling fallback in
// claim-heartbeat-on-tool.cjs) because workers run in .worktrees/* which have NO .env.
let envFallbackTried = false;
function loadEnvFallback() {
  if (envFallbackTried) return;
  envFallbackTried = true; // once per process — hooks are short-lived, never retry
  try {
    const fs = require('fs');
    const path = require('path');
    const starts = [process.env.CLAUDE_PROJECT_DIR, process.cwd(), __dirname].filter(Boolean);
    for (const start of starts) {
      let dir = path.resolve(start);
      for (let i = 0; i < 8; i++) {
        const envFile = path.join(dir, '.env');
        if (fs.existsSync(envFile)) {
          require('dotenv').config({ path: envFile, override: false, quiet: true });
          if (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) return;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
  } catch { /* best-effort: telemetry must never break a tool call */ }
}

function getSupabaseConfig() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    loadEnvFallback();
    url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  if (!url || !key) return null;
  return { url, key };
}

/**
 * Fire a non-blocking PATCH to claude_sessions for the given session_id.
 * Returns immediately; errors are swallowed (debug-only stderr).
 *
 * @param {string} sessionId — CLAUDE_SESSION_ID env value
 * @param {Object} patch — column → value map (only the 8 telemetry columns + metadata)
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=TELEMETRY_FETCH_TIMEOUT_MS]
 */
function writeTelemetry(sessionId, patch, options) {
  if (!sessionId || typeof sessionId !== 'string') return;
  if (!patch || typeof patch !== 'object') return;

  const cfg = getSupabaseConfig();
  if (!cfg) {
    // No credentials in this process — silently skip. Hooks must not fail.
    return;
  }

  const timeoutMs = Number(options?.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : TELEMETRY_FETCH_TIMEOUT_MS;

  // Whitelist the columns we're allowed to write via this helper — defense
  // against an accidental `status = 'released'` slipping through from a caller.
  const allowed = new Set([
    'current_tool',
    'current_tool_args_hash',
    'current_tool_expected_end_at',
    'last_activity_kind',
    'commits_since_claim',
    'files_modified_since_claim',
    'process_alive_at',
    'expected_silence_until',
    'heartbeat_at',   // convenient — hooks often bump this alongside telemetry
    'last_tool_at',   // SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 — tick-immune tool
                      // clock. In THIS allowlist only, NOT writeTelemetryAwait's:
                      // the await variant is session-tick's path, and letting the
                      // tick write last_tool_at would re-create the exact
                      // contamination that broke heartbeat_at/process_alive_at.
    'metadata',       // needed for last_git_metric_at throttle state
    'current_branch', // SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001 — hooks may
                      // stamp branch when they know it; resolution happens
                      // upstream via lib/session-writer.cjs, never on this
                      // hot path.
  ]);

  const body = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.has(k)) body[k] = v;
  }
  if (Object.keys(body).length === 0) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/${TELEMETRY_TABLE}?session_id=eq.${encodeURIComponent(sessionId)}`;

  // Fire-and-forget — we intentionally do NOT await the fetch.
  // The .catch() is there to suppress unhandled rejections.
  fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(() => clearTimeout(timer))
    .catch((err) => {
      clearTimeout(timer);
      // Debug-only — never block the hook.
      if (process.env.LEO_TELEMETRY_DEBUG === '1') {
        console.error(
          `[session-telemetry-writer] swallow error: ${err?.name || 'unknown'}: ${err?.message || ''}`
        );
      }
    });
}

/**
 * Await-able variant used by tests and by session-tick.cjs (where blocking is OK).
 * Returns true on HTTP 2xx, false otherwise. Still never throws.
 *
 * @param {string} sessionId
 * @param {Object} patch
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
async function writeTelemetryAwait(sessionId, patch, options) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  if (!patch || typeof patch !== 'object') return false;

  const cfg = getSupabaseConfig();
  if (!cfg) return false;

  const timeoutMs = Number(options?.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : TELEMETRY_FETCH_TIMEOUT_MS;

  const allowed = new Set([
    'current_tool',
    'current_tool_args_hash',
    'current_tool_expected_end_at',
    'last_activity_kind',
    'commits_since_claim',
    'files_modified_since_claim',
    'process_alive_at',
    'expected_silence_until',
    'heartbeat_at',
    'metadata',
    'current_branch', // SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001 — see
                      // writeTelemetry whitelist for rationale.
  ]);
  // QF-20260726-163: last_tool_at stays OUT of the set above on purpose — this is
  // session-tick's path, and a tick-written tool clock would recreate the
  // heartbeat_at/process_alive_at contamination. But the ONE writer that legitimately
  // owns the clock (post-tool-clear-telemetry) must AWAIT its write: it is a
  // short-lived hook process, so the fire-and-forget variant it used before was
  // discarded when the process exited (measured: expected_silence_until cleared via
  // the awaited call, last_activity_kind never moved via the unawaited one). Explicit
  // per-call opt-in, so the tick — which never passes it — still cannot write it.
  if (options?.allowToolClock === true) allowed.add('last_tool_at');

  const body = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.has(k)) body[k] = v;
  }
  if (Object.keys(body).length === 0) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/${TELEMETRY_TABLE}?session_id=eq.${encodeURIComponent(sessionId)}`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch (err) {
    clearTimeout(timer);
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      console.error(
        `[session-telemetry-writer] await swallow error: ${err?.name || 'unknown'}: ${err?.message || ''}`
      );
    }
    return false;
  }
}

module.exports = {
  writeTelemetry,
  writeTelemetryAwait,
  TELEMETRY_TABLE,
  TELEMETRY_FETCH_TIMEOUT_MS,
};
