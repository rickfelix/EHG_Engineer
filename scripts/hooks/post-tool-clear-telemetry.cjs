#!/usr/bin/env node
/**
 * post-tool-clear-telemetry.cjs — PostToolUse hook.
 *
 * Part of SD-LEO-INFRA-WORKER-SOURCE-SIDE-001.
 *
 * Runs after EVERY tool call. Responsibilities:
 *   1. Clear tool-state telemetry (current_tool, current_tool_expected_end_at,
 *      expected_silence_until, current_tool_args_hash)
 *   2. Set last_activity_kind = 'idle' (worker is between tools)
 *   3. Throttle 30s — run `git log --since=<claimed_at>` and `git diff --stat`
 *      to update commits_since_claim / files_modified_since_claim
 *   4. Update heartbeat_at so the worker stays visible to the dashboard
 *
 * Fail-open: any error is swallowed. Hook MUST NEVER block tool completion.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const { resolveSessionId } = require('../../lib/hooks/session-id.cjs');
const { drainAndExit } = require('../../lib/hooks/drain-undici.cjs'); // QF-20260719-890: drain before post-fetch exits

// Never throw — the entire hook is wrapped.
(async function main() {
  try {
    // QF-20260504-765: stdin (Claude Code hook protocol) is canonical for
    // PostToolUse; env fallback covers manual node invocations and tests.
    const sessionId = await resolveSessionId();
    if (!sessionId) return;

    const nowMs = Date.now();

    // ── Step 1: read current session state (for last_git_metric_at throttle
    //    and claimed_at for the git query time-window).
    // QF-20260725-630: this branch is a PERMANENT, SILENT DEGRADATION and its old comment
    // ("No DB connection or no session row") named two very different causes and treated them
    // identically. clearToolState writes the tool clock but NEVER calls collectGitMetrics, so a
    // seat that lands here reports last_tool_at forever while commits_since_claim stays 0 — which
    // reads exactly like "this seat did no work", not like "this seat could not be measured".
    //
    // MEASURED 2026-07-26: I reproduced the fleet-wide commits_since_claim=0 symptom purely by
    // running the hook where getSupabaseConfig() returned null (no SUPABASE_SERVICE_ROLE_KEY in
    // the process env — hooks do NOT load dotenv themselves, they rely on injected env). With
    // creds present the whole path works end to end (13 commits / 15 files persisted). So the
    // no-creds case is not hypothetical: it is indistinguishable from a healthy seat that happens
    // to have no commits.
    //
    // Same defect family as QF-20260725-868: a could-not-determine collapsed into a verdict, with
    // the direction chosen by the code path rather than by the evidence. Fixed the same way — give
    // the third state a representation. The reason is NAMED so a consumer can tell the cases apart;
    // it stays FAIL-SOFT (a telemetry hook must never block a tool call), and the log is
    // debug-gated because this runs on EVERY tool call and unconditional stderr would be spam.
    const { state, reason } = await readSessionState(sessionId);
    if (!state) {
      if (process.env.LEO_TELEMETRY_DEBUG === '1') {
        process.stderr.write(
          `[post-tool-clear-telemetry] degraded to tool-clock-only (${reason}) — ` +
          'commits_since_claim/files_modified_since_claim will NOT be collected this call\n'
        );
      }
      await clearToolState(sessionId, nowMs);
      return;
    }

    const patch = {
      heartbeat_at: new Date(nowMs).toISOString(),
      // Tick-immune tool-activity clock (SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001):
      // this hook is the column's ONLY writer — heartbeat_at/process_alive_at are
      // also PATCHed by session-tick every 30s and keep ticking through a
      // window-level prompt block, so they cannot prove a tool actually ran.
      last_tool_at: new Date(nowMs).toISOString(),
      current_tool: null,
      current_tool_args_hash: null,
      current_tool_expected_end_at: null,
      expected_silence_until: null,
      last_activity_kind: 'idle',
    };

    // ── Step 2: throttled git metrics
    const metadata = state.metadata && typeof state.metadata === 'object' ? state.metadata : {};
    const lastGitMetricAtMs = Number(metadata.last_git_metric_at_ms) || 0;
    const THROTTLE_MS = 30 * 1000;

    if (nowMs - lastGitMetricAtMs >= THROTTLE_MS) {
      const gitMetrics = collectGitMetrics(state.worktree_path, state.claimed_at);
      if (gitMetrics) {
        patch.commits_since_claim = gitMetrics.commits;
        patch.files_modified_since_claim = gitMetrics.files;
        patch.metadata = { ...metadata, last_git_metric_at_ms: nowMs };
      }
    }

    await writePatch(sessionId, patch);
  } catch (err) {
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      process.stderr.write(
        `[post-tool-clear-telemetry] swallow error: ${err?.message || err}\n`
      );
    }
  }
})().then(() => drainAndExit(0)); // QF-20260509-199 exit kept; QF-20260719-890: drain first (post-fetch exit)

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * QF-20260725-630: returns {state, reason} rather than a bare null, because the caller must be able
 * to tell WHY it has no state. The four outcomes are genuinely different and only one of them is
 * benign:
 *   no_config    — no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in this hook process. PERMANENT for
 *                  that seat: git metrics will never be collected, silently, forever.
 *   http_<code>  — reachable but refused (auth/RLS/schema). Also effectively permanent.
 *   fetch_failed — network/abort (the 1500ms budget). TRANSIENT; self-heals next tool call.
 *   no_row       — genuinely no claude_sessions row for this session. The only benign case.
 * Never throws; every path resolves to a reason string so the caller cannot mistake one for another.
 */
async function readSessionState(sessionId) {
  const cfg = getSupabaseConfig();
  if (!cfg) return { state: null, reason: 'no_config' };
  try {
    const url =
      `${cfg.url.replace(/\/$/, '')}/rest/v1/claude_sessions` +
      `?session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=metadata,claimed_at,worktree_path`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: authHeaders(cfg.key),
    }, 1500);
    if (!res) return { state: null, reason: 'fetch_failed' };
    if (!res.ok) return { state: null, reason: `http_${res.status}` };
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length) return { state: rows[0], reason: null };
    return { state: null, reason: 'no_row' };
  } catch (e) {
    return { state: null, reason: `fetch_failed:${(e && e.name) || 'unknown'}` };
  }
}

async function writePatch(sessionId, patch) {
  try {
    // QF-20260726-163: MUST await. This is a short-lived PostToolUse process, so the
    // fire-and-forget writeTelemetry() returned before its fetch flushed and the
    // process exited with the PATCH still pending — every write was silently lost,
    // which is why last_tool_at read NULL on 0-of-15 seats and a parked worker was
    // indistinguishable from a working one. allowToolClock opts this ONE legitimate
    // owner into writing last_tool_at without opening it to session-tick.
    const { writeTelemetryAwait } = require('./lib/session-telemetry-writer.cjs');
    await writeTelemetryAwait(sessionId, patch, { allowToolClock: true });
  } catch {
    // best effort — telemetry must never break a tool call
  }
}

async function clearToolState(sessionId, nowMs) {
  await writePatch(sessionId, {
    heartbeat_at: new Date(nowMs).toISOString(),
    last_tool_at: new Date(nowMs).toISOString(),
    current_tool: null,
    current_tool_args_hash: null,
    current_tool_expected_end_at: null,
    expected_silence_until: null,
    last_activity_kind: 'idle',
  });
}

function collectGitMetrics(worktreePath, claimedAtIso) {
  if (!claimedAtIso) return null;
  const cwd = worktreePath && isAbsolute(worktreePath) ? worktreePath : process.cwd();
  const opts = { cwd, timeout: 2000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };

  let commits = 0;
  let files = 0;

  try {
    // git log --since respects ISO timestamps
    const out = execSync(`git log --since="${claimedAtIso}" --oneline`, opts);
    commits = out.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }

  try {
    // Count unique files in the diff since claimed_at. `git diff --stat` last
    // line is "N files changed"; we parse it. Fall back to name-only if needed.
    const nameOnly = execSync(
      `git log --since="${claimedAtIso}" --name-only --pretty=format: -- .`,
      opts
    );
    const unique = new Set(
      nameOnly.split('\n').map(s => s.trim()).filter(Boolean)
    );
    files = unique.size;
  } catch {
    // leave files = 0
  }

  return { commits, files };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function authHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function isAbsolute(p) {
  try { return path.isAbsolute(p); } catch { return false; }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
