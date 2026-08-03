#!/usr/bin/env node
/**
 * Context Compact Nudge Hook (UserPromptSubmit + PostToolUse)
 *
 * Proactively nudges Claude to run /context-compact before context
 * grows large enough to cause serialization errors (e.g., Unicode
 * surrogate issues at ~300KB+ API payloads).
 *
 * Works in TWO modes:
 * - UserPromptSubmit: Checks every prompt using time + turn thresholds
 * - PostToolUse (--time-only --interval N): Checks every Nth tool call,
 *   using time thresholds only (tool calls are too frequent for turn-based)
 *
 * Nudge thresholds:
 * - WARNING: 45+ minutes OR 40+ user turns (whichever first)
 * - CRITICAL: 90+ minutes OR 80+ user turns
 * - Cooldown: 30 minutes between nudges (prevents spam)
 *
 * Usage:
 *   node context-compact-nudge.js                        # UserPromptSubmit
 *   node context-compact-nudge.js --time-only --interval 10  # PostToolUse
 *
 * Environment variables:
 * - LEO_COMPACT_NUDGE_ENABLED: Set to 'false' to disable (default: true)
 * - LEO_COMPACT_WARNING_MINUTES: Minutes before WARNING (default: 45)
 * - LEO_COMPACT_WARNING_TURNS: User turns before WARNING (default: 40)
 * - LEO_COMPACT_CRITICAL_MINUTES: Minutes before CRITICAL (default: 90)
 * - LEO_COMPACT_CRITICAL_TURNS: User turns before CRITICAL (default: 80)
 * - LEO_COMPACT_COOLDOWN_MINUTES: Minutes between nudges (default: 30)
 *
 * Exit codes:
 *   0 - Always (advisory mode - doesn't block)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getHandoffFlagPath,
  sanitizeSessionId,
  sweepStaleHandoffFlags
} from '../modules/handoff/cli/compact-after-handoff.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ENABLED = process.env.LEO_COMPACT_NUDGE_ENABLED !== 'false';
const WARNING_MINUTES = parseInt(process.env.LEO_COMPACT_WARNING_MINUTES || '45');
const WARNING_TURNS = parseInt(process.env.LEO_COMPACT_WARNING_TURNS || '40');
const CRITICAL_MINUTES = parseInt(process.env.LEO_COMPACT_CRITICAL_MINUTES || '90');
const CRITICAL_TURNS = parseInt(process.env.LEO_COMPACT_CRITICAL_TURNS || '80');
const COOLDOWN_MINUTES = parseInt(process.env.LEO_COMPACT_COOLDOWN_MINUTES || '30');

// Flags
const TIME_ONLY = process.argv.includes('--time-only');
const intervalIdx = process.argv.indexOf('--interval');
const CHECK_INTERVAL = intervalIdx !== -1 ? parseInt(process.argv[intervalIdx + 1] || '1') : 1;

// SD-LEO-INFRA-COMPACT-NUDGE-RACES-001 — READ THIS BEFORE "SIMPLIFYING" IT BACK.
// This used to read `process.env.CLAUDE_SESSION_ID || 'default'` at module
// scope. Hooks are NOT Bash-tool invocations, and capture-session-id.cjs
// persists the id via CLAUDE_ENV_FILE precisely so BASH TOOL children inherit
// it (see its docblock, GH #17188) — so in a hook the variable is normally
// absent and every session fell through to the same `session-default.json`.
// Measured on this machine before the fix: session-default.json held 3670 user
// turns and 10914 tool calls aggregated across sessions, while a 17-hour
// session had no file of its own. lastNudgeTime lives in that shared file and
// is checked at :227 BEFORE the handoff flag is read, so one session's nudge
// suppressed every other session's handoff nudge for the whole cooldown.
// Identity now comes from the hook's stdin payload (resolveSessionId below).
// LEO_COMPACT_STATE_DIR mirrors LEO_COMPACT_FLAG_DIR: without it a test that
// exercises the unidentified path writes to the REAL session-default.json that
// every session on the machine shares — which both corrupts live state and lets
// a real cooldown short-circuit the run, so the test passes without reaching
// the code it is meant to exercise. That is how a mutant survived here twice.
const STATE_DIR = process.env.LEO_COMPACT_STATE_DIR || path.join(os.tmpdir(), 'leo-context-nudge');
const UNATTRIBUTED_SESSION = 'default';

function stateFileFor(sessionId) {
  return path.join(STATE_DIR, `session-${sessionId || UNATTRIBUTED_SESSION}.json`);
}

// Flag file that Claude sees - signals it should auto-invoke /context-compact
// LEO_COMPACT_FLAG_DIR env override exists for test isolation.
const FLAG_DIR = process.env.LEO_COMPACT_FLAG_DIR || path.join(os.homedir(), '.claude', 'flags');
const FLAG_FILE = path.join(FLAG_DIR, 'context-compact-needed.json');

// Compaction marker written by PreCompact hook when auto-compaction occurs
const COMPACTION_MARKER = path.join(FLAG_DIR, 'last-compaction.json');

// QF-20260510-387: Phase-aware compact nudge after handoff success.
// cli-main.js writes this flag on handoff success; we surface a tier-based
// nudge here. Stale flags (>60 min) are discarded.
// The path is now imported from the writer module rather than re-derived here —
// there were three independent copies of this filename literal and any fix that
// updated only one of them would have silently disconnected writer from reader.
const HANDOFF_FLAG_STALE_MINUTES = 60;
const HANDOFF_NUDGE_MESSAGES = {
  soft: (h) => `[context-compact-nudge] ${h.handoff_type} complete (SD ${h.sd_id}). Optional /compact available; phase reasoning is minimal.`,
  medium: (h) => `[context-compact-nudge] ${h.handoff_type} complete (SD ${h.sd_id}). /compact recommended — sub-agent verdicts are in DB. Caveat: deliberation chains will be lost; capture key reasoning in PRD/retro before compacting.`,
  strong: (h) => `[context-compact-nudge] ${h.handoff_type} complete (SD ${h.sd_id}); retrospective published. SAFE to /compact — all phase state is in DB.`
};

// ============================================================================
// HELPERS
// ============================================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readState(stateFile) {
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch {
    // Corrupted - start fresh
  }
  return {
    userTurnCount: 0,
    toolCallCount: 0,
    startTime: new Date().toISOString(),
    lastNudgeTime: null,
    nudgeCount: 0,
    lastCompactionTime: null
  };
}

function writeState(stateFile, state) {
  ensureDir(STATE_DIR);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function writeFlag(level, sessionAge, counts, sessionId) {
  ensureDir(FLAG_DIR);
  fs.writeFileSync(FLAG_FILE, JSON.stringify({
    level,
    sessionId: sessionId || UNATTRIBUTED_SESSION,
    sessionAgeMinutes: sessionAge,
    userTurns: counts.userTurnCount,
    toolCalls: counts.toolCallCount,
    timestamp: new Date().toISOString()
  }, null, 2));
}

function clearFlag() {
  try {
    if (fs.existsSync(FLAG_FILE)) {
      fs.unlinkSync(FLAG_FILE);
    }
  } catch {
    // Ignore
  }
}

function readHandoffFlag(flagFile) {
  // No identity => no flag. Falling back to a shared filename here would
  // reintroduce the exact misdelivery this SD removes, so an unidentified
  // session simply never consumes a handoff nudge.
  if (!flagFile) return null;
  try {
    if (!fs.existsSync(flagFile)) return null;
    const data = JSON.parse(fs.readFileSync(flagFile, 'utf8'));
    if (!data || !data.tier || !data.timestamp) return null;
    if (minutesSince(data.timestamp) > HANDOFF_FLAG_STALE_MINUTES) {
      try { fs.unlinkSync(flagFile); } catch { /* ignore */ }
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearHandoffFlag(flagFile) {
  if (!flagFile) return;
  try {
    if (fs.existsSync(flagFile)) fs.unlinkSync(flagFile);
  } catch { /* ignore */ }
}

/**
 * Claude Code passes the hook payload as JSON on stdin; session_id is the only
 * identifier a hook subprocess can rely on (CLAUDE_ENV_FILE reaches Bash-tool
 * children, not hooks). Same mechanism as scripts/hooks/coordination-inbox.cjs.
 * The env var is kept as a fallback for direct/manual invocation only.
 */
function resolveSessionId(timeoutMs = 250) {
  return new Promise((resolve) => {
    const envFallback = () => sanitizeSessionId(process.env.CLAUDE_SESSION_ID);
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    let buf = '';
    const timer = setTimeout(() => finish(envFallback()), timeoutMs);
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { buf += c; });
      process.stdin.on('end', () => {
        clearTimeout(timer);
        let fromStdin = null;
        try { fromStdin = sanitizeSessionId(JSON.parse(buf)?.session_id); } catch { /* not JSON */ }
        finish(fromStdin || envFallback());
      });
      process.stdin.on('error', () => { clearTimeout(timer); finish(envFallback()); });
    } catch {
      clearTimeout(timer);
      finish(envFallback());
    }
  });
}

function getLastCompactionTime(stateTime) {
  try {
    if (fs.existsSync(COMPACTION_MARKER)) {
      const marker = JSON.parse(fs.readFileSync(COMPACTION_MARKER, 'utf8'));
      if (marker.timestamp) {
        const markerMs = new Date(marker.timestamp).getTime();
        const stateMs = stateTime ? new Date(stateTime).getTime() : 0;
        return markerMs > stateMs ? marker.timestamp : stateTime;
      }
    }
  } catch {
    // Ignore
  }
  return stateTime;
}

function minutesSince(isoTime) {
  if (!isoTime) return Infinity;
  return (Date.now() - new Date(isoTime).getTime()) / 60000;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  if (!ENABLED) {
    process.exit(0);
  }

  // One identity resolution feeds BOTH the per-session state file (which owns
  // the nudge cooldown) and the per-session handoff flag.
  const sessionId = await resolveSessionId();
  const stateFile = stateFileFor(sessionId);
  const handoffFlagFile = getHandoffFlagPath(process.env, sessionId);

  try {
    const state = readState(stateFile);

    // Increment the appropriate counter
    if (TIME_ONLY) {
      state.toolCallCount = (state.toolCallCount || 0) + 1;

      // Throttle: only do full evaluation every Nth tool call
      if (CHECK_INTERVAL > 1 && state.toolCallCount % CHECK_INTERVAL !== 0) {
        writeState(stateFile, state);
        process.exit(0);
      }
    } else {
      state.userTurnCount = (state.userTurnCount || 0) + 1;
    }

    // Shared evaluation logic
    const sessionAgeMinutes = minutesSince(state.startTime);

    // Check compaction marker from PreCompact hook
    const lastCompactionTime = getLastCompactionTime(state.lastCompactionTime);
    if (lastCompactionTime !== state.lastCompactionTime) {
      state.lastCompactionTime = lastCompactionTime;
    }

    const minutesSinceCompaction = minutesSince(state.lastCompactionTime);
    const minutesSinceLastNudge = minutesSince(state.lastNudgeTime);

    // Orphaned per-session flags can no longer be discarded by whichever
    // session happens to read the one shared path, so sweep on every full
    // evaluation. Bounded: one readdir over a directory of small JSON files.
    sweepStaleHandoffFlags(process.env, HANDOFF_FLAG_STALE_MINUTES);

    // If compaction happened recently, clear flag and skip
    if (minutesSinceCompaction < COOLDOWN_MINUTES) {
      clearFlag();
      writeState(stateFile, state);
      process.exit(0);
    }

    // Cooldown from last nudge
    if (minutesSinceLastNudge < COOLDOWN_MINUTES) {
      writeState(stateFile, state);
      process.exit(0);
    }

    // QF-20260510-387: Phase-aware nudge takes precedence over time/turn-based level.
    const handoffFlag = readHandoffFlag(handoffFlagFile);
    if (handoffFlag && HANDOFF_NUDGE_MESSAGES[handoffFlag.tier]) {
      console.log(HANDOFF_NUDGE_MESSAGES[handoffFlag.tier](handoffFlag));
      clearHandoffFlag(handoffFlagFile);
      state.lastNudgeTime = new Date().toISOString();
      state.nudgeCount = (state.nudgeCount || 0) + 1;
      writeState(stateFile, state);
      process.exit(0);
    }

    // Determine nudge level
    let level = null;
    const userTurns = state.userTurnCount || 0;

    // Time thresholds apply in both modes
    const timeCritical = sessionAgeMinutes >= CRITICAL_MINUTES;
    const timeWarning = sessionAgeMinutes >= WARNING_MINUTES;

    // Turn thresholds only apply in user-prompt mode (not --time-only)
    const turnCritical = !TIME_ONLY && userTurns >= CRITICAL_TURNS;
    const turnWarning = !TIME_ONLY && userTurns >= WARNING_TURNS;

    if (timeCritical || turnCritical) {
      level = 'CRITICAL';
    } else if (timeWarning || turnWarning) {
      level = 'WARNING';
    }

    if (level) {
      const source = TIME_ONLY ? 'AUTO-PROCEED' : 'interactive';

      // Check if AUTO-PROCEED is active — downgrade CRITICAL to ADVISORY
      // to avoid interrupting autonomous execution (SD-LEO-INFRA-AUTO-PROCEED-CONTEXT-001)
      let isAutoProceed = false;
      try {
        const apStatePath = path.join(process.cwd(), '.claude', 'auto-proceed-state.json');
        if (fs.existsSync(apStatePath)) {
          const apState = JSON.parse(fs.readFileSync(apStatePath, 'utf8'));
          isAutoProceed = apState.isActive === true;
        }
      } catch { /* fail-safe: default to non-auto-proceed (show CRITICAL) */ }

      if (level === 'CRITICAL' && isAutoProceed) {
        console.log('[context-compact-nudge] ADVISORY (AUTO-PROCEED active): Context compaction recommended at next SD boundary.');
      } else if (level === 'CRITICAL') {
        console.log(`[context-compact-nudge] CRITICAL (${source}): Run /context-compact NOW to prevent API serialization errors.`);
      } else {
        console.log(`[context-compact-nudge] WARNING (${source}): Consider running /context-compact to reduce context size.`);
      }

      writeFlag(level, Math.round(sessionAgeMinutes), state, sessionId);

      state.lastNudgeTime = new Date().toISOString();
      state.nudgeCount = (state.nudgeCount || 0) + 1;
    }

    writeState(stateFile, state);
    process.exit(0);

  } catch (err) {
    console.error(`[context-compact-nudge] Error: ${err.message}`);
    process.exit(0);
  }
}

main().catch((err) => {
  // Advisory hook: never block the session on our own failure.
  console.error(`[context-compact-nudge] Error: ${err?.message || err}`);
  process.exit(0);
});
