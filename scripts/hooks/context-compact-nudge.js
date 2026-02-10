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

const SESSION_ID = process.env.CLAUDE_SESSION_ID || 'default';
const STATE_DIR = path.join(os.tmpdir(), 'leo-context-nudge');
const STATE_FILE = path.join(STATE_DIR, `session-${SESSION_ID}.json`);

// Flag file that Claude sees - signals it should auto-invoke /context-compact
const FLAG_DIR = path.join(os.homedir(), '.claude', 'flags');
const FLAG_FILE = path.join(FLAG_DIR, 'context-compact-needed.json');

// Compaction marker written by PreCompact hook when auto-compaction occurs
const COMPACTION_MARKER = path.join(FLAG_DIR, 'last-compaction.json');

// ============================================================================
// HELPERS
// ============================================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
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

function writeState(state) {
  ensureDir(STATE_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function writeFlag(level, sessionAge, counts) {
  ensureDir(FLAG_DIR);
  fs.writeFileSync(FLAG_FILE, JSON.stringify({
    level,
    sessionId: SESSION_ID,
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

function formatDuration(minutes) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  if (!ENABLED) {
    process.exit(0);
  }

  try {
    const state = readState();

    // Increment the appropriate counter
    if (TIME_ONLY) {
      state.toolCallCount = (state.toolCallCount || 0) + 1;

      // Throttle: only do full evaluation every Nth tool call
      if (CHECK_INTERVAL > 1 && state.toolCallCount % CHECK_INTERVAL !== 0) {
        writeState(state);
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

    // If compaction happened recently, clear flag and skip
    if (minutesSinceCompaction < COOLDOWN_MINUTES) {
      clearFlag();
      writeState(state);
      process.exit(0);
    }

    // Cooldown from last nudge
    if (minutesSinceLastNudge < COOLDOWN_MINUTES) {
      writeState(state);
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
      const age = formatDuration(sessionAgeMinutes);
      const source = TIME_ONLY ? 'AUTO-PROCEED' : 'interactive';

      if (level === 'CRITICAL') {
        console.log(`[context-compact-nudge] CRITICAL (${source}): Session running ${age}. Run /context-compact NOW to prevent API serialization errors.`);
      } else {
        console.log(`[context-compact-nudge] WARNING (${source}): Session running ${age}. Consider running /context-compact to reduce context size.`);
      }

      writeFlag(level, Math.round(sessionAgeMinutes), state);

      state.lastNudgeTime = new Date().toISOString();
      state.nudgeCount = (state.nudgeCount || 0) + 1;
    }

    writeState(state);
    process.exit(0);

  } catch (err) {
    console.error(`[context-compact-nudge] Error: ${err.message}`);
    process.exit(0);
  }
}

main();
