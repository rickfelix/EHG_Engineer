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

// SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001 (FR-7): self-load .env so SUPABASE_* reads at
// lines further below resolve regardless of parent shell. Detached tick subprocess does NOT
// inherit other hooks' loaded env. Symmetric with capture-session-id.cjs FR-7 fix.
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TICK_MS = 30 * 1000;
const PARENT_POLL_MS = 5 * 1000;
const HTTP_TIMEOUT_MS = 3000;

// SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-4): early-exit telemetry threshold + sinks.
// If cleanupAndExit fires within EARLY_EXIT_THRESHOLD_MS of process start, emit a
// structured tick.early_exit event so operators can detect ancestor-discovery regressions.
const EARLY_EXIT_THRESHOLD_MS = 60 * 1000;
const EARLY_EXIT_HTTP_TIMEOUT_MS = 1000;
const startedAt = Date.now();
const earlyExitNdjsonPath = path.resolve(__dirname, '../.claude/pids/spawn-errors.log');

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

// SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001 (FR-1+FR-4): first-tick recovery path.
// Originally tickOnce always PATCHed — when no row existed (because
// capture-session-id.cjs upsert silent-failed at SessionStart), every tick was
// a 0-row no-op. Now the first tick after spawn does a POST with
// resolution=merge-duplicates so the row is created if missing. UNIQUE(session_id)
// + onConflict=session_id provides idempotency at the DB level. Subsequent ticks
// revert to PATCH so steady-state cost is unchanged.
let isFirstTick = true;

async function tickOnce() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const baseUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/claude_sessions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  const debug = process.env.LEO_TELEMETRY_DEBUG === '1';

  try {
    const now = new Date().toISOString();
    if (isFirstTick) {
      // FR-1+FR-4: insert-if-not-exists (POST + merge-duplicates) so a missing row
      // self-heals within ~30s. UNIQUE(session_id) + 409 path treated as success
      // gives race-on-race idempotency with capture-session-id.cjs upsertSessionRow.
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          session_id: sessionId,
          status: 'active',
          heartbeat_at: now,
          process_alive_at: now,
          pid: process.pid,
          hostname: require('os').hostname(),
          metadata: { cc_parent_pid: parentPid, source: 'session-tick-first' },
        }),
        signal: controller.signal,
      });
      // 2xx OR 409/conflict → row exists, ticks can revert to PATCH.
      if (res.ok || res.status === 409) {
        isFirstTick = false;
        if (debug && res.status === 409) {
          console.error(`session-tick: first-tick POST 409 (row already existed) — race resolved, switching to PATCH`);
        }
      } else {
        // Non-success: leave isFirstTick=true so the next tick retries the POST.
        if (debug) console.error(`session-tick: first-tick POST status=${res.status} — will retry on next tick`);
      }
    } else {
      // Steady state — SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 FR-4: update BOTH columns.
      // claim-guard.mjs keys claim TTL on heartbeat_at (300s stale threshold).
      const url = `${baseUrl}?session_id=eq.${encodeURIComponent(sessionId)}`;
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
    }
  } catch {
    // swallow — next tick will retry. Never crash the tick loop.
  } finally {
    clearTimeout(timer);
  }
}

// ── Main loop ────────────────────────────────────────────────────────────────

// SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-4): emit tick.early_exit telemetry when
// cleanupAndExit runs within 60s of process start. Two sinks:
//   1. NDJSON append to .claude/pids/spawn-errors.log (sync-safe, signal-handler-tolerant)
//   2. Best-effort PostgREST POST to session_lifecycle_events (queryable across fleet)
// Sink 1 is the durable record. Sink 2 is opportunistic — sync handlers may exit
// before the fetch resolves, so we do not await it.
function emitEarlyExitTelemetry(exitCode, lifetimeMs) {
  const event = {
    timestamp: new Date().toISOString(),
    event: 'tick.early_exit',
    session_id: sessionId,
    tick_pid: process.pid,
    cc_parent_pid: parentPid,
    lifetime_ms: lifetimeMs,
    exit_code: exitCode,
    hostname: require('os').hostname(),
  };

  // Sink 1: synchronous NDJSON append (guaranteed durability under signal teardown).
  try {
    fs.mkdirSync(path.dirname(earlyExitNdjsonPath), { recursive: true });
    fs.appendFileSync(earlyExitNdjsonPath, JSON.stringify(event) + '\n');
  } catch {
    // file write failures are non-fatal — DB sink may still capture the event
  }

  // Sink 2: best-effort PostgREST POST to session_lifecycle_events.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/session_lifecycle_events`;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), EARLY_EXIT_HTTP_TIMEOUT_MS);
    fetch(url, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type: 'tick.early_exit',
        session_id: sessionId,
        pid: process.pid,
        reason: 'ancestor_pid_exited',
        latency_ms: lifetimeMs,
        metadata: { cc_parent_pid: parentPid, exit_code: exitCode, hostname: event.hostname },
      }),
      signal: controller.signal,
    }).catch(() => { /* best-effort */ });
  } catch {
    /* best-effort */
  }
}

function cleanupAndExit(code) {
  const lifetimeMs = Date.now() - startedAt;
  if (lifetimeMs < EARLY_EXIT_THRESHOLD_MS) {
    try { emitEarlyExitTelemetry(code, lifetimeMs); } catch { /* never block exit */ }
  }
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

// Schedule periodic ticks.
// QF-20260424-001: Do NOT unref tickInterval — this setInterval is what keeps
// the detached daemon's Node event loop alive. If it is unref'd, the process
// exits ~260ms after the initial tickOnce() fetch resolves, leaving only one
// heartbeat write. Parent-liveness check (below) handles the exit path.
const tickInterval = setInterval(() => { tickOnce(); }, TICK_MS);

// Schedule parent liveness checks. Unref is intentional here — the parent
// poll never holds the loop alive on its own; tickInterval does.
const parentInterval = setInterval(() => {
  if (!parentAlive()) {
    clearInterval(tickInterval);
    clearInterval(parentInterval);
    cleanupAndExit(0);
  }
}, PARENT_POLL_MS);
parentInterval.unref?.();
