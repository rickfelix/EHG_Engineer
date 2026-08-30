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
 * FIX: move the observation OUTSIDE the observed process. This wrapper spawns the target script
 * as a CHILD process and observes how it exits from the PARENT side — a native abort in the
 * child still produces a nonzero exit code / signal visible to the parent, even though the
 * child cannot run its own JS exit handlers to report it. Any abnormal exit (nonzero code,
 * signal, or spawn error) is durably logged to a local NDJSON sink (survives even if a
 * subsequent DB write would itself be interrupted) before the wrapper exits.
 *
 * Usage: node scripts/run-with-exit-witness.cjs <script-path> [args...]
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', '.artifacts', 'abnormal-exit-witness.ndjson');

function recordAbnormalExit(record) {
  console.error(`[run-with-exit-witness] ABNORMAL EXIT DETECTED: ${JSON.stringify(record)}`);
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(record) + '\n');
  } catch (e) {
    console.error(`[run-with-exit-witness] durable log write failed (non-fatal): ${(e && e.message) || e}`);
  }
}

function runOnce(scriptPathArg, argsArg) {
  const result = spawnSync(process.execPath, [scriptPathArg, ...argsArg], { stdio: 'inherit' });
  const abnormal = Boolean(result.error) || result.signal !== null || (result.status !== null && result.status !== 0);
  if (abnormal) {
    recordAbnormalExit({
      ts: new Date().toISOString(),
      script: scriptPathArg,
      exitCode: result.status,
      signal: result.signal,
      spawnError: result.error ? result.error.message : null,
    });
  }
  return { abnormal, exitCode: result.status };
}

if (require.main === module) {
  const [, , scriptPath, ...args] = process.argv;
  if (!scriptPath) {
    console.error('[run-with-exit-witness] usage: node scripts/run-with-exit-witness.cjs <script-path> [args...]');
    process.exit(1);
  }
  const { abnormal, exitCode } = runOnce(scriptPath, args);
  process.exit(abnormal ? (exitCode || 1) : 0);
}

module.exports = { runOnce, recordAbnormalExit, LOG_PATH };
