/**
 * Requires-invocation classifier (FR-2) — SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-B.
 *
 * Decide whether a script NEEDS a live production trigger (autonomous-runnable: crons, loops,
 * sweeps, scheduled writers) versus NOT (libraries, test-only, one-off, manually-invoked CLIs,
 * sub-agent helpers). Pairs with the FR-1 detector (./index.js): a VIOLATION is a script that
 * requires-invocation AND lacks an invocation path.
 *
 * CONSERVATIVE / FAIL-OPEN: the bad outcome is a FALSE violation (calling a library/helper/
 * manual-CLI "needs a trigger" → the gate then flags a missing trigger it never needed). So:
 *   - negative gates (excluded/test/library) run FIRST and content-INDEPENDENTLY, and
 *   - requiresInvocation=TRUE requires a GENUINE autonomous signal, never a bare filename
 *     substring: a declared loop-contract entrypoint, a cron/clockwork directory, a
 *     suffix-anchored -loop/-cron/-sweep/-daemon/-worker filename, or real in-code scheduling
 *     semantics (setInterval / cron / --once / every-N / while(true)).
 * False NEGATIVES (a real runner with an unconventional name not in cron/clockwork/registry) are
 * the SAFE direction (no false violation) — by convention such runners belong in the
 * loop-contract registry or a cron/clockwork dir, where they ARE caught. Pure.
 */
import { isExcludedEntry, normalizeEntry } from './index.js';

/** Autonomous-by-LOCATION: cron/clockwork dirs hold scheduled runners (NOT lib/loops, a data dir). */
const AUTONOMOUS_DIR_RE = /(?:^|\/)(?:cron|clockwork)\//i;
/** Autonomous-by-SUFFIX: a filename ending in -loop/-cron/-sweep/-daemon/-worker (anchored, so a
 *  'scroll-loop-helper' / 'action-dispatcher' substring does NOT match). */
const AUTONOMOUS_SUFFIX_RE = /-(?:loop|cron|sweep|sweeper|daemon|worker|autotriage)\.[cm]?js$/i;
/** Autonomous-by-CONTENT: real scheduling/tick semantics in code (not a comment word). */
const SCHEDULE_CONTENT_RE = /\bsetInterval\s*\(|\bcron\b|--once\b|\bevery\s+\d+\s*(?:ms|s|m|min|mins|minutes|hours?|h)\b|while\s*\(\s*true\s*\)/i;
/** A runnable program surface (shebang / main / argv). Used to corroborate the content path. */
const RUNNABLE_RE = /#!.*node|\basync function main\b|\bfunction main\b|\bprocess\.argv\b|\.parse\(process\.argv/;

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

  // ── Negative gates first (conservative, content-INDEPENDENT). ──
  if (!target) return { ...NOT_REQUIRED, reason: 'empty path', confidence: 100 };
  if (isExcludedEntry(target)) return { ...NOT_REQUIRED, reason: 'excluded (one-off/archive/test)', confidence: 95 };
  if (/\.(test|spec)\.[cm]?js$/.test(target) || /(?:^|\/)tests?\//.test(target)) {
    return { ...NOT_REQUIRED, reason: 'test file', confidence: 95 };
  }

  // ── Strongest positive: an explicit loop-contract registry entry overrides location. ──
  if (isLoopContractEntrypoint(target, ctx.loopContracts)) {
    return { requiresInvocation: true, reason: 'declared loop-contract entrypoint', confidence: 95 };
  }

  // Libraries live under lib/ and are reached via import — never self-triggered (the registry
  // case above already handled the rare lib-as-entrypoint). Content-independent → kills the
  // path-only false-positive where an autonomous-NAMED lib file slipped past a content-gated check.
  if (/^lib\//.test(target)) {
    return { ...NOT_REQUIRED, reason: 'library module (import-reached, not self-triggered)', confidence: 85 };
  }

  // ── Genuine autonomous signals (never a bare filename substring). ──
  if (AUTONOMOUS_DIR_RE.test(target)) {
    return { requiresInvocation: true, reason: 'lives under a cron/clockwork dir', confidence: 90 };
  }
  if (AUTONOMOUS_SUFFIX_RE.test(target)) {
    // A -loop/-sweep suffix asserts intent, BUT a pure LIBRARY can carry a loop-ish name
    // (scripts/modules/**/rewrite-loop.js, rca-feedback-loop.js — exports only, no main()). When
    // content is available and shows NO runnable surface, treat it as a library, not a runner
    // (adversarial false-positive). Path-only (no content) trusts the suffix. The lib/ guard above
    // already covers lib/-rooted modules; this covers scripts/modules/** library helpers.
    if (!content || RUNNABLE_RE.test(content)) {
      return { requiresInvocation: true, reason: 'autonomous-runner filename suffix (-loop/-cron/-sweep/…)', confidence: content ? 85 : 70 };
    }
  }
  if (content && RUNNABLE_RE.test(content) && SCHEDULE_CONTENT_RE.test(content)) {
    return { requiresInvocation: true, reason: 'runnable program with in-code scheduling semantics', confidence: 78 };
  }

  // ── Conservative default: a plain CLI tool, sub-agent helper, or autonomous-named-but-
  // unconventional script with no genuine signal is treated as manual/import-invoked. ──
  return { ...NOT_REQUIRED, reason: 'no genuine autonomous signal (treated as manual/library/helper)', confidence: 55 };
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
