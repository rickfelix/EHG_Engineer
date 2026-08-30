#!/usr/bin/env node
/**
 * run-with-exit-witness.cjs — QF-20260830-922.
 *
 * WHY: QF-20260830-603's in-process abnormal-exit witness (a start/finish marker file inside
 * scripts/sms-status-relay-drain.cjs itself) is structurally blind to a native abort at process
 * teardown — the marker is cleared on clean completion BEFORE the abort fires (the observed
 * UV_HANDLE_CLOSING abort happens AFTER main() returns), so the witness never sees exactly the
 * failure it exists to catch. A witness living inside the process it observes cannot survive
 * that process's own death.
 *
 * FIX, part 1: move the observation OUTSIDE the observed process. This wrapper spawns the
 * target script as a CHILD and observes how it exits from the PARENT side — a native abort in
 * the child still produces a nonzero exit code / signal visible to the parent, even though the
 * child cannot run its own JS exit handlers to report it.
 *
 * FIX, part 2 (coordinator live-run measurement, 10 controlled runs, 2026-08-30): the abort
 * exits NON-ZERO (measured: 127, "command not found" by long convention) AFTER the drain's
 * work has already completed and printed its output. Naively propagating that exit code
 * upward would make a SUCCESSFUL tick read as a failure to any exit-code supervisor (cron
 * wrapper, loop-health gauge, CI) — the inverse lie of the blind in-process witness, and worse
 * because 127 actively misdirects debugging toward a nonexistent path problem. So this wrapper
 * correlates the child's abnormal exit against an APPEND-ONLY completion log the target script
 * writes on every successful run (see scripts/sms-status-relay-drain.cjs's markTickCompleted,
 * convention: <script-basename>-completions.ndjson in .artifacts/, keyed by pid+timestamp).
 * If a completion entry for this exact child pid appears AFTER the child started, the work
 * demonstrably finished before the abort — a teardown-abort-after-completion, still durably
 * logged as an anomaly, but NOT propagated as a failure (exit 0). If no matching completion
 * entry exists, the abort is treated as a genuine failure (mid-drain death, real error, or a
 * real 127) and the nonzero exit propagates as before.
 *
 * Usage: node scripts/run-with-exit-witness.cjs <script-path> [args...]
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', '.artifacts', 'abnormal-exit-witness.ndjson');

function completionLogPathFor(scriptPathArg) {
  const base = path.basename(scriptPathArg, path.extname(scriptPathArg));
  return path.join(__dirname, '..', '.artifacts', `${base}-completions.ndjson`);
}

/** Did the given pid append a completion entry at/after startTimeMs? Fail-open (false) on any read error. */
function hasMatchingCompletion(completionLogPath, pid, startTimeMs) {
  try {
    if (!fs.existsSync(completionLogPath)) return false;
    const lines = fs.readFileSync(completionLogPath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.some((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.pid === pid && Date.parse(entry.ts) >= startTimeMs;
      } catch { return false; }
    });
  } catch {
    return false;
  }
}

function recordAbnormalExit(record) {
  console.error(`[run-with-exit-witness] ABNORMAL EXIT: ${JSON.stringify(record)}`);
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(record) + '\n');
  } catch (e) {
    console.error(`[run-with-exit-witness] durable log write failed (non-fatal): ${(e && e.message) || e}`);
  }
}

function runOnce(scriptPathArg, argsArg) {
  const startTimeMs = Date.now();
  const result = spawnSync(process.execPath, [scriptPathArg, ...argsArg], { stdio: 'inherit' });
  const abnormal = Boolean(result.error) || result.signal !== null || (result.status !== null && result.status !== 0);
  if (!abnormal) return { abnormal: false, exitCode: result.status, workCompleted: true };

  const completionLogPath = completionLogPathFor(scriptPathArg);
  const workCompleted = result.pid != null && hasMatchingCompletion(completionLogPath, result.pid, startTimeMs);

  recordAbnormalExit({
    ts: new Date().toISOString(),
    script: scriptPathArg,
    exitCode: result.status,
    signal: result.signal,
    spawnError: result.error ? result.error.message : null,
    workCompleted, // true = teardown-abort-after-completion (do not propagate as failure)
  });
  if (workCompleted) {
    console.warn(`[run-with-exit-witness] the child's work completed before this abnormal exit -- NOT propagating as a failure (exitCode=${result.status}).`);
  }
  return { abnormal: true, exitCode: result.status, workCompleted };
}

if (require.main === module) {
  const [, , scriptPath, ...args] = process.argv;
  if (!scriptPath) {
    console.error('[run-with-exit-witness] usage: node scripts/run-with-exit-witness.cjs <script-path> [args...]');
    process.exit(1);
  }
  const { abnormal, exitCode, workCompleted } = runOnce(scriptPath, args);
  const shouldFail = abnormal && !workCompleted;
  process.exit(shouldFail ? (exitCode || 1) : 0);
}

module.exports = { runOnce, recordAbnormalExit, hasMatchingCompletion, completionLogPathFor, LOG_PATH };
