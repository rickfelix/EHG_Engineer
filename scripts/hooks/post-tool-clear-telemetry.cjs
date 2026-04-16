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

// Never throw — the entire hook is wrapped.
(async function main() {
  try {
    const sessionId = process.env.CLAUDE_SESSION_ID;
    if (!sessionId) return;

    const nowMs = Date.now();

    // ── Step 1: read current session state (for last_git_metric_at throttle
    //    and claimed_at for the git query time-window).
    const state = await readSessionState(sessionId);
    if (!state) {
      // No DB connection or no session row — best-effort clear still useful
      await clearToolState(sessionId, nowMs);
      return;
    }

    const patch = {
      heartbeat_at: new Date(nowMs).toISOString(),
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
})().then(() => { process.exitCode = 0; });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readSessionState(sessionId) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  try {
    const url =
      `${cfg.url.replace(/\/$/, '')}/rest/v1/claude_sessions` +
      `?session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=metadata,claimed_at,worktree_path`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: authHeaders(cfg.key),
    }, 1500);
    if (!res || !res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

async function writePatch(sessionId, patch) {
  try {
    const { writeTelemetry } = require('./lib/session-telemetry-writer.cjs');
    writeTelemetry(sessionId, patch);
  } catch {
    // best effort
  }
}

async function clearToolState(sessionId, nowMs) {
  await writePatch(sessionId, {
    heartbeat_at: new Date(nowMs).toISOString(),
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
