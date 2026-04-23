#!/usr/bin/env node
/**
 * session-tick.cjs — Detached background tick process.
 *
 * Part of SD-LEO-INFRA-WORKER-SOURCE-SIDE-001.
 *
 * Lifecycle:
 *   - Spawned at SessionStart by scripts/hooks/capture-session-id.cjs
 *   - Runs detached with stdio ignored; parent can exit cleanly (unref).
 *   - Every 30 seconds: PATCH claude_sessions.process_alive_at = NOW()
 *   - Every 5 seconds: check parent CC PID via process.kill(ppid, 0).
 *                       On ESRCH → cleanup marker + process.exit(0).
 *   - On uncaught error: cleanup marker + process.exit(1) (fail-closed).
 *
 * Required env at spawn time (set by capture-session-id.cjs):
 *   CLAUDE_SESSION_ID    — UUID of the Claude Code conversation
 *   CC_PARENT_PID        — parent node.exe PID to watch for liveness
 *
 * Marker file: .claude/pids/tick-<session_id>.json  (for sweep orphan cleanup)
 *
 * This script MUST stay dependency-free beyond Node built-ins + the already-
 * available global fetch (Node 18+) so cold-start latency stays negligible.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TICK_MS = 30 * 1000;
const PARENT_POLL_MS = 5 * 1000;
const HTTP_TIMEOUT_MS = 3000;

const sessionId = process.env.CLAUDE_SESSION_ID || '';
const parentPid = Number(process.env.CC_PARENT_PID) || 0;

if (!sessionId) {
  // No session → nothing to tick. Exit quietly.
  process.exit(0);
}
if (!parentPid) {
  // No parent to watch → exit rather than risk leaking forever.
  process.exit(0);
}

// Marker file lives under .claude/pids/tick-<session_id>.json.
// Resolve path relative to this script (scripts/) so it works from any cwd.
const pidsDir = path.resolve(__dirname, '../.claude/pids');
const markerPath = path.join(pidsDir, `tick-${sessionId}.json`);

// ── Marker management ────────────────────────────────────────────────────────

function writeMarker() {
  try {
    fs.mkdirSync(pidsDir, { recursive: true });
    const marker = {
      session_id: sessionId,
      tick_pid: process.pid,
      cc_parent_pid: parentPid,
      started_at: new Date().toISOString(),
      hostname: require('os').hostname(),
    };
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
  } catch {
    // marker failures are non-fatal
  }
}

function deleteMarker() {
  try { fs.unlinkSync(markerPath); } catch { /* ignore */ }
}

// ── Parent liveness ──────────────────────────────────────────────────────────

function parentAlive() {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'ESRCH') return false;
    if (err && err.code === 'EPERM') return true; // exists but no permission
    return false;
  }
}

// ── Telemetry write ──────────────────────────────────────────────────────────

async function tickOnce() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const url =
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/claude_sessions` +
    `?session_id=eq.${encodeURIComponent(sessionId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    // SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 FR-4: update BOTH columns.
    // claim-guard.mjs keys claim TTL on heartbeat_at (300s stale threshold).
    // Updating only process_alive_at leaves the claim vulnerable to stale-claim
    // cleanup during long Edit/Write/Read bursts that don't invoke any CLI script.
    const now = new Date().toISOString();
    await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        process_alive_at: now,
        heartbeat_at: now,
      }),
      signal: controller.signal,
    });
  } catch {
    // swallow — next tick will retry. Never crash the tick loop.
  } finally {
    clearTimeout(timer);
  }
}

// ── Main loop ────────────────────────────────────────────────────────────────

function cleanupAndExit(code) {
  deleteMarker();
  process.exit(code);
}

process.on('SIGINT',  () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));
process.on('uncaughtException', (err) => {
  if (process.env.LEO_TELEMETRY_DEBUG === '1') {
    process.stderr.write(`[session-tick] uncaught: ${err?.message}\n`);
  }
  cleanupAndExit(1);
});

writeMarker();

// Fire the first tick immediately so DB sees a fresh process_alive_at ASAP.
tickOnce();

// Schedule periodic ticks
const tickInterval = setInterval(() => { tickOnce(); }, TICK_MS);
tickInterval.unref?.();

// Schedule parent liveness checks
const parentInterval = setInterval(() => {
  if (!parentAlive()) {
    clearInterval(tickInterval);
    clearInterval(parentInterval);
    cleanupAndExit(0);
  }
}, PARENT_POLL_MS);
parentInterval.unref?.();
