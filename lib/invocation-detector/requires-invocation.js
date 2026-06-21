/**
 * Requires-invocation classifier (FR-2) — SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-B.
 *
 * Decide whether a script NEEDS a live production trigger (autonomous-runnable: crons, loops,
 * sweeps, scheduled writers) versus NOT (libraries, test-only, one-off, manually-invoked CLIs,
 * sub-agent helpers). Pairs with the FR-1 detector (./index.js): a VIOLATION is a script that
 * requires-invocation AND lacks an invocation path.
 *
 * CONSERVATIVE / FAIL-OPEN: the bad outcome is a FALSE violation (calling a library/helper
 * "needs a trigger" → the gate then flags it for a missing trigger it never needed). So we
 * default to requiresInvocation=FALSE and only return TRUE on a POSITIVE autonomous signal.
 * Pure (path/content/registry in → verdict out), so it is fully unit-testable.
 */
import { isExcludedEntry, normalizeEntry } from './index.js';

/** Filename/path tokens that denote an autonomously-scheduled runner. */
const AUTONOMOUS_NAME_RE = /(?:^|[/-])(cron|loop|sweep|sweeper|reaper|monitor|scheduler|poller|heartbeat|watcher|populator|starter|dispatcher|forecaster|backfill|autotriage)(?:[-./]|$)/i;
/** A script living under a cron/clockwork/loops directory is autonomous by location. */
const AUTONOMOUS_DIR_RE = /(?:^|\/)(cron|clockwork|loops|schedulers?)\//i;
/** Content signals that the script is meant to run autonomously on a schedule/tick. */
const AUTONOMOUS_CONTENT_RE = /\b(cron|schedule[ds]?|setInterval|every\s+\d|--once\b|tick\b|autonomous|nightly|hourly|daily)\b/i;
/** A runnable program: a top-level main()/IIFE or process.argv/exit usage (has a CLI surface). */
const RUNNABLE_RE = /\b(process\.argv|process\.exit|#!.*node|async function main\b|function main\b|\.parse\(process\.argv|yargs|commander)\b/;

const NOT_REQUIRED = Object.freeze({ requiresInvocation: false });

/**
 * Is this a loop-contract entrypoint? Such a script is DECLARED to run on a cadence, so it
 * unambiguously requires a live trigger. Pure.
 */
export function isLoopContractEntrypoint(scriptPath, loopContracts = []) {
  const target = normalizeEntry(scriptPath);
  return (loopContracts || []).some((c) =>
    (c && Array.isArray(c.tasks) ? c.tasks : []).some((t) => t && t.file && normalizeEntry(t.file) === target));
}

/**
 * Classify whether a script requires a live invocation trigger. Pure.
 *
 * @param {string} scriptPath
 * @param {{content?: string, loopContracts?: Array}} [ctx]
 * @returns {{requiresInvocation: boolean, reason: string, confidence: number}}
 */
export function classifyRequiresInvocation(scriptPath, ctx = {}) {
  const target = normalizeEntry(scriptPath);
  const content = ctx.content || '';

  // ── Negative gates first (conservative): things that NEVER need their own trigger. ──
  if (!target) return { ...NOT_REQUIRED, reason: 'empty path', confidence: 100 };
  if (isExcludedEntry(target)) return { ...NOT_REQUIRED, reason: 'excluded (one-off/archive/test)', confidence: 95 };
  if (/\.(test|spec)\.[cm]?js$/.test(target) || /(^|\/)tests?\//.test(target)) {
    return { ...NOT_REQUIRED, reason: 'test file', confidence: 95 };
  }
  // A pure library module: under lib/ with no runnable surface (no shebang/main/argv). Libraries
  // are reached via import from an entry point — they are never themselves triggered.
  if (/^lib\//.test(target) && content && !RUNNABLE_RE.test(content)) {
    return { ...NOT_REQUIRED, reason: 'library module (no runnable entry surface)', confidence: 85 };
  }

  // ── Positive autonomous signals → requires a live trigger. ──
  if (isLoopContractEntrypoint(target, ctx.loopContracts)) {
    return { requiresInvocation: true, reason: 'declared loop-contract entrypoint', confidence: 95 };
  }
  if (AUTONOMOUS_DIR_RE.test(target)) {
    return { requiresInvocation: true, reason: 'lives under a cron/clockwork/loops dir', confidence: 90 };
  }
  if (AUTONOMOUS_NAME_RE.test(target)) {
    // Strong if it also looks runnable; still TRUE on the name alone (the name asserts intent).
    const runnable = !content || RUNNABLE_RE.test(content);
    return { requiresInvocation: true, reason: 'autonomous-runner filename pattern', confidence: runnable ? 85 : 70 };
  }
  if (content && RUNNABLE_RE.test(content) && AUTONOMOUS_CONTENT_RE.test(content)) {
    return { requiresInvocation: true, reason: 'runnable program with schedule/tick semantics', confidence: 75 };
  }

  // ── Default: NOT required (conservative). A plain CLI tool, sub-agent helper, or a script
  // with no autonomous signal is treated as manually/import-invoked → not a violation source. ──
  return { ...NOT_REQUIRED, reason: 'no autonomous signal (treated as manual/library/helper)', confidence: 60 };
}

/**
 * Convenience pairing with the FR-1 detector: a script is a VIOLATION when it requires a live
 * trigger but the detector found none. `invokedResult` is the {invoked,...} from
 * detectInvocationPath. Pure. @returns {{violation:boolean, requires, reason}}
 */
export function isMissingInvocationViolation(scriptPath, invokedResult, ctx = {}) {
  const requires = classifyRequiresInvocation(scriptPath, ctx);
  const invoked = !!(invokedResult && invokedResult.invoked);
  return {
    violation: requires.requiresInvocation && !invoked,
    requires,
    reason: requires.requiresInvocation
      ? (invoked ? 'requires + invoked → ok' : 'requires a live trigger but none found → VIOLATION')
      : 'does not require a live trigger',
  };
}
