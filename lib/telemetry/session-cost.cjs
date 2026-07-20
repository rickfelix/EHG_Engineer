'use strict';
/**
 * Session/agent cost telemetry reader — SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 (W3, FR-6/TR-4).
 *
 * The AUTHORITATIVE per-session cost telemetry at write time is the statusline hook's real-time
 * usage log (.claude/logs/context-usage.jsonl). The hook appends one JSONL snapshot per session
 * every ~10s: { ts, session, model, context_used, input, output, cache_create, cache_read, ... }.
 * scripts/sync-context-usage.js treats this exact file as the source of truth it uploads into the
 * context_usage_log DB table, so reading it directly is reading the same authoritative signal at
 * write time (not a backfilled estimate).
 *
 * FAIL-SOFT (TR-4): every failure mode — log absent, unreadable, no snapshot for this session, an
 * unusable snapshot — returns { captured: false, reason } and NEVER throws. The caller writes the
 * ledger row anyway with cost_tokens/cost_wall_ms = null + cost_captured = false.
 */
const fs = require('fs');
const path = require('path');

// The module lives at <repo-root>/lib/telemetry/; the log lives at <repo-root>/.claude/logs/.
function defaultLogPath() {
  return path.resolve(__dirname, '..', '..', '.claude', 'logs', 'context-usage.jsonl');
}

function toFiniteNumber(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

// Total tokens accounted to one snapshot: prefer the server-authoritative context_used, else fall
// back to summing the raw token fields the same snapshot carries.
function snapshotTokens(e) {
  const ctx = toFiniteNumber(e && e.context_used);
  if (ctx != null) return ctx;
  const sum = ['input', 'output', 'cache_create', 'cache_read']
    .reduce((acc, k) => acc + (toFiniteNumber(e && e[k]) || 0), 0);
  return sum > 0 ? sum : null;
}

/**
 * Read the authoritative session cost telemetry for `sessionId` at write time.
 * @param {object} o
 * @param {string}  o.sessionId    the writing session's CLAUDE_SESSION_ID
 * @param {string} [o.logPath]     override the JSONL path (else CONTEXT_USAGE_LOG env, else default)
 * @param {number} [o.nowMs]       injectable clock (defaults to Date.now())
 * @param {string} [o.logContent]  inject raw JSONL directly (tests) instead of reading a file
 * @returns {{captured:boolean, costTokens?:number, wallMs?:number, source?:string, reason?:string}}
 *   captured=true  → costTokens (latest snapshot's total tokens) + wallMs (session wall-clock
 *                    elapsed, from its FIRST telemetry snapshot to now) are both non-null.
 *   captured=false → telemetry unavailable; caller must fail-soft to nulls.
 */
function readSessionCostTelemetry({ sessionId, logPath, nowMs = Date.now(), logContent = null } = {}) {
  try {
    if (!sessionId) return { captured: false, reason: 'no sessionId' };
    let content = logContent;
    if (content == null) {
      const p = logPath || process.env.CONTEXT_USAGE_LOG || defaultLogPath();
      if (!fs.existsSync(p)) return { captured: false, reason: `no telemetry log at ${p}` };
      content = fs.readFileSync(p, 'utf8');
    }
    const matching = [];
    for (const line of String(content).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let e;
      try { e = JSON.parse(t); } catch { continue; }
      if (e && e.session === sessionId) matching.push(e);
    }
    if (matching.length === 0) return { captured: false, reason: `no telemetry snapshot for session ${sessionId}` };

    const costTokens = snapshotTokens(matching[matching.length - 1]);
    if (costTokens == null) return { captured: false, reason: 'latest snapshot has no usable token count' };

    let earliestMs = null;
    for (const e of matching) {
      const ms = Date.parse(e && e.ts);
      if (Number.isFinite(ms) && (earliestMs == null || ms < earliestMs)) earliestMs = ms;
    }
    if (earliestMs == null) return { captured: false, reason: 'no parseable telemetry timestamp' };

    return { captured: true, costTokens, wallMs: Math.max(0, nowMs - earliestMs), source: 'context-usage.jsonl' };
  } catch (e) {
    return { captured: false, reason: (e && e.message) || String(e) };
  }
}

module.exports = { readSessionCostTelemetry, snapshotTokens, defaultLogPath };
