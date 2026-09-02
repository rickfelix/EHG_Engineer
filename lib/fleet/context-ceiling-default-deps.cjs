// SD-FDBK-INFRA-COORDINATION-VOLUME-DEGRADES-001: the REAL (non-injected) implementations of
// context-ceiling-checker.cjs's three deps, for production wiring into a seat's own tick loop.
// Kept separate from the pure checker module so the checker's unit tests never touch a
// filesystem — these three functions are exercised by their own tests below instead.
'use strict';

const fs = require('fs');
const path = require('path');

// Same log + same env override as lib/telemetry/session-cost.cjs's readSessionCostTelemetry —
// the statusline hook's local, real-time JSONL (.claude/context-usage-feed.cjs buildUsageEntry)
// is the authoritative write-time signal; scripts/sync-context-usage.js is what later mirrors it
// into the context_usage_log DB table. Reading the local file directly means this checker is NOT
// subject to the ~12-minute DB sync lag LEAD-TO-PLAN's VALIDATION evidence measured in production.
function defaultLogPath() {
  return path.resolve(__dirname, '..', '..', '.claude', 'logs', 'context-usage.jsonl');
}

/**
 * @param {string} sessionId
 * @param {object} [opts]
 * @param {string} [opts.logPath]
 * @returns {Promise<{usage_percent:number, created_at:string}|null>} the LATEST matching
 *   snapshot for sessionId, or null if the log is absent/unreadable/has no match — never throws.
 */
async function defaultReadLatestUsageRow(sessionId, opts = {}) {
  try {
    if (!sessionId) return null;
    const p = opts.logPath || process.env.CONTEXT_USAGE_LOG || defaultLogPath();
    if (!fs.existsSync(p)) return null;
    const content = fs.readFileSync(p, 'utf8');
    let latest = null;
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let e;
      try { e = JSON.parse(t); } catch { continue; }
      if (e && e.session_id === sessionId && typeof e.usage_percent === 'number') latest = e;
    }
    if (!latest) return null;
    return { usage_percent: latest.usage_percent, created_at: latest.timestamp };
  } catch {
    return null;
  }
}

/**
 * The tick script itself CANNOT programmatically invoke the .claude/commands/context-compact.md
 * skill -- that file is plain markdown instructions for an INTERACTIVE agent turn, with no
 * CLI/API entrypoint (confirmed by direct read; flagged to the coordinator, signal 04cf607d).
 * For a role seat that invokes its own quiet-tick script via Bash as part of its own live turn
 * (Adam and the coordinator both do), the printed QUIET_TICK_CONTEXT_CEILING line lands directly
 * in that same turn's tool result -- so THIS function's only honest job is to print an
 * unmissable, distinctly-named action line the calling agent's own protocol can react to by
 * then calling the Skill tool itself. It is not a silent no-op: omitting the line would make
 * this exactly the pre-SD 'remembered, not enforced' behavior again.
 * @returns {Promise<void>}
 */
async function defaultInvokeCompactSkill() {
  // eslint-disable-next-line no-console
  console.log('COMPACT_ACTION_REQUIRED: run the context-compact skill now, in this same turn.');
}

/**
 * Best-effort local JSONL append (mirrors context-usage.jsonl's own pattern) -- avoids a new DB
 * migration for FR-4; before/after window size is what makes the saving measurable per the SD's
 * second success criterion.
 * @param {object} event shape produced by checkContextCeiling's CEILING branch
 * @param {object} [opts]
 * @param {string} [opts.logPath]
 * @returns {Promise<void>}
 */
async function defaultPersistCeilingEvent(event, opts = {}) {
  try {
    const p = opts.logPath || process.env.CONTEXT_CEILING_EVENTS_LOG
      || path.resolve(__dirname, '..', '..', '.claude', 'logs', 'context-ceiling-events.jsonl');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(event) + '\n');
  } catch {
    // best-effort -- a failed persist must not mask the enforcement action already taken.
  }
}

module.exports = { defaultReadLatestUsageRow, defaultInvokeCompactSkill, defaultPersistCeilingEvent, defaultLogPath };
