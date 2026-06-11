#!/usr/bin/env node
/**
 * scratch-sweep-sessionstart.cjs — SessionStart hook.
 *
 * Fires the worker-scratch sweep in --auto mode (self-throttled to ~6h, conservative
 * 24h age gate, silent, fail-open). We trigger on session start — not a cron — because
 * this fleet's daemons go dormant (the very failure mode that let 700+ scratch files
 * accumulate). A session starting is the most reliable recurring event we have.
 *
 * Hard contract: this hook MUST never block or pollute session start. It prints nothing
 * on success and always exits 0. The heavy lifting (throttle marker, tracked-file safety,
 * age gate, logging) lives in the sweep script; this is just a thin, bullet-proof trigger.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const script = path.join(projectDir, 'scripts', 'maintenance', 'sweep-worker-scratch.mjs');
  execFileSync(process.execPath, [script, '--auto'], {
    cwd: projectDir,
    stdio: 'ignore',   // never emit to the SessionStart context stream
    timeout: 25_000,   // the sweep self-bounds; this is a backstop
  });
} catch {
  // Fail-open: a sweep error (or the throttle no-op exiting non-zero) must never
  // disrupt a session. Swallow everything.
}
process.exit(0);
