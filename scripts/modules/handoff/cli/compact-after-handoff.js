// QF-20260510-387: Phase-aware /compact nudge after handoff success.
//
// Writes ~/.claude/flags/compact-after-handoff.json on successful handoff;
// scripts/hooks/context-compact-nudge.js consumes it on the next PostToolUse
// or UserPromptSubmit invocation and surfaces a tier-based nudge.
//
// Tiers (drive nudge text + safety caveat):
//   LEAD-TO-PLAN, PLAN-TO-EXEC      → soft   (early phase, little reasoning to lose)
//   EXEC-TO-PLAN, PLAN-TO-LEAD      → medium (sub-agent verdicts in DB; warn about deliberation chains)
//   LEAD-FINAL-APPROVAL             → strong (post-retro; safest /compact point)
//
// Env vars:
//   LEO_COMPACT_AFTER_HANDOFF: off | nudge | auto (default: nudge)
//   LEO_COMPACT_FLAG_DIR     : test-only override for ~/.claude/flags/

import fs from 'fs';
import path from 'path';
import os from 'os';

export const HANDOFF_COMPACT_TIERS = Object.freeze({
  'LEAD-TO-PLAN': 'soft',
  'PLAN-TO-EXEC': 'soft',
  'EXEC-TO-PLAN': 'medium',
  'PLAN-TO-LEAD': 'medium',
  'LEAD-FINAL-APPROVAL': 'strong'
});

export function resolveCompactAfterHandoffMode(env = process.env) {
  const raw = (env.LEO_COMPACT_AFTER_HANDOFF || 'nudge').toLowerCase();
  return ['off', 'nudge', 'auto'].includes(raw) ? raw : 'nudge';
}

export function getHandoffTier(handoffType) {
  const key = (handoffType || '').toUpperCase();
  return HANDOFF_COMPACT_TIERS[key] || null;
}

// SD-LEO-INFRA-COMPACT-NUDGE-RACES-001: the flag is keyed to the session that
// EARNED it. Before this, one unscoped file meant whichever session next
// submitted a prompt consumed the nudge — so it reached the wrong session and
// never reached the one that ran the handoff. The session id also lands in the
// payload so an orphaned file can be attributed without parsing its name.
export const HANDOFF_FLAG_PREFIX = 'compact-after-handoff-';
export const HANDOFF_FLAG_SUFFIX = '.json';
// The pre-fix filename. Nothing reads or writes it any more, so on every
// machine that ever ran the old code it would sit in the flags directory
// forever unless the sweep is told to collect it.
export const LEGACY_HANDOFF_FLAG_NAME = 'compact-after-handoff.json';
const SESSION_ID_MAX_LENGTH = 64;

/**
 * Session ids are UUIDs, but this value reaches path.join() — anything outside
 * [A-Za-z0-9_-] is rejected outright rather than escaped, so a crafted id can
 * never traverse out of the flags directory.
 * @returns {string|null} the safe id, or null when there is no usable identity
 */
export function sanitizeSessionId(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed.slice(0, SESSION_ID_MAX_LENGTH);
}

export function getHandoffFlagDir(env = process.env) {
  return env.LEO_COMPACT_FLAG_DIR || path.join(os.homedir(), '.claude', 'flags');
}

/**
 * @returns {string|null} null when no session identity is available. Callers
 *   MUST treat null as "do not write / do not read" — falling back to a shared
 *   filename is the defect this SD exists to remove.
 */
export function getHandoffFlagPath(env = process.env, sessionId = undefined) {
  const sid = sanitizeSessionId(sessionId === undefined ? env.CLAUDE_SESSION_ID : sessionId);
  if (!sid) return null;
  return path.join(getHandoffFlagDir(env), `${HANDOFF_FLAG_PREFIX}${sid}${HANDOFF_FLAG_SUFFIX}`);
}

export function writeCompactAfterHandoffFlag(handoffType, sdId, env = process.env) {
  try {
    const mode = resolveCompactAfterHandoffMode(env);
    if (mode === 'off') return { written: false, reason: 'mode_off' };

    const tier = getHandoffTier(handoffType);
    if (!tier) return { written: false, reason: 'unknown_handoff_type' };

    // The handoff CLI is a Bash-tool descendant, so it genuinely has
    // CLAUDE_SESSION_ID (cli-main.js:755-763 pre-flights it). A miss is
    // surfaced explicitly instead of being swallowed into a bare written:false.
    const sessionId = sanitizeSessionId(env.CLAUDE_SESSION_ID);
    const flagPath = getHandoffFlagPath(env, sessionId);
    if (!flagPath) return { written: false, reason: 'no_session_id' };

    const flagDir = path.dirname(flagPath);
    if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true });

    const payload = {
      sd_id: sdId || null,
      session_id: sessionId,
      handoff_type: handoffType.toUpperCase(),
      tier,
      mode,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(flagPath, JSON.stringify(payload, null, 2));
    return { written: true, tier, mode, payload };
  } catch (err) {
    return { written: false, reason: 'write_error', error: err.message };
  }
}

/**
 * Per-session filenames break the old self-healing: readHandoffFlag() used to
 * discard the ONE known stale path, so any session could clean up after any
 * other. Now each session only ever constructs its own name, and a session that
 * runs a handoff then never prompts again (crash, session end, one-shot CLI)
 * leaves a file nobody knows to look for. This sweep is the replacement — it is
 * the only thing that keeps the flags directory from growing without bound.
 * @returns {{swept: string[], errors: number}}
 */
export function sweepStaleHandoffFlags(env = process.env, staleMinutes = 60, now = Date.now()) {
  const swept = [];
  let errors = 0;
  try {
    const dir = getHandoffFlagDir(env);
    if (!fs.existsSync(dir)) return { swept, errors };
    for (const name of fs.readdirSync(dir)) {
      const isScoped = name.startsWith(HANDOFF_FLAG_PREFIX) && name.endsWith(HANDOFF_FLAG_SUFFIX);
      if (!isScoped && name !== LEGACY_HANDOFF_FLAG_NAME) continue;
      const full = path.join(dir, name);
      try {
        // Age comes from mtime, not the payload: a corrupt or truncated file has
        // no readable timestamp and would otherwise be immortal.
        if (now - fs.statSync(full).mtimeMs > staleMinutes * 60 * 1000) {
          fs.unlinkSync(full);
          swept.push(name);
        }
      } catch { errors += 1; }
    }
  } catch { errors += 1; }
  return { swept, errors };
}
