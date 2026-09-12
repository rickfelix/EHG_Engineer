/**
 * QF-20260905-768. Solomon drift flag 91dd8669: D3 (silence/cost-discipline) counted consult
 * volume only -- an idle or overrun Task-tool gatherer Solomon spawned during a deep sweep was
 * invisible to both the self-adherence review and the rubric writer, so a seat could leave one
 * running past its report and still score D3 clean.
 *
 * A standalone Node script has no live view into a Claude Code session's attached Task-tool
 * agents (that graph only exists inside the live session). So the WRITE side is procedural: a
 * live Solomon session takes its own attached-agent snapshot (ListAgents/TaskList) and writes it
 * as JSON to the path in SOLOMON_ATTACHED_AGENTS_FILE before invoking these scripts (see
 * CLAUDE_SOLOMON.md Mode B). This module is the READ side both scripts share, pure and testable.
 *
 * Three-state contract (mirrors quota_breach_count): file unset/unreadable -> null (inconclusive,
 * never a fabricated clean 0); file present (even `[]`) -> a real, honest count.
 */
const fs = require('fs');

const DEFAULT_IDLE_CUT_MINUTES = 60;
const DEFAULT_OVERRUN_CUT_MINUTES = 120; // "2h past report"

/**
 * @param {Array<{name:string, state:'idle'|'running', ageMinutes:number}>} agents
 * @param {{idleCutMinutes?:number, overrunCutMinutes?:number}} [opts]
 * @returns {Array<object>} the subset that should flag
 */
function classifyAttachedAgents(agents, { idleCutMinutes = DEFAULT_IDLE_CUT_MINUTES, overrunCutMinutes = DEFAULT_OVERRUN_CUT_MINUTES } = {}) {
  return (Array.isArray(agents) ? agents : []).filter((a) => {
    if (!a || typeof a.ageMinutes !== 'number') return false;
    if (a.state === 'idle') return a.ageMinutes > idleCutMinutes;
    if (a.state === 'running') return a.ageMinutes > overrunCutMinutes;
    return false;
  });
}

/** Reads the snapshot a live Solomon session wrote; null (not []) when the file is absent/bad. */
function readAttachedAgentsSnapshot(envVar = 'SOLOMON_ATTACHED_AGENTS_FILE', env = process.env) {
  const path = env[envVar];
  if (!path) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_IDLE_CUT_MINUTES,
  DEFAULT_OVERRUN_CUT_MINUTES,
  classifyAttachedAgents,
  readAttachedAgentsSnapshot,
};
