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

export function getHandoffFlagPath(env = process.env) {
  const dir = env.LEO_COMPACT_FLAG_DIR || path.join(os.homedir(), '.claude', 'flags');
  return path.join(dir, 'compact-after-handoff.json');
}

export function writeCompactAfterHandoffFlag(handoffType, sdId, env = process.env) {
  try {
    const mode = resolveCompactAfterHandoffMode(env);
    if (mode === 'off') return { written: false, reason: 'mode_off' };

    const tier = getHandoffTier(handoffType);
    if (!tier) return { written: false, reason: 'unknown_handoff_type' };

    const flagPath = getHandoffFlagPath(env);
    const flagDir = path.dirname(flagPath);
    if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true });

    const payload = {
      sd_id: sdId || null,
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
