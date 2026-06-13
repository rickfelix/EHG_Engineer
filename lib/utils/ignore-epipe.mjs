/**
 * ignore-epipe.mjs — shared EPIPE-tolerant stream-'error' handler
 * (SD-FDBK-FIX-HANDOFF-EPIPE-GUARD-001).
 *
 * Long-running CLIs that emit heavy console output AROUND async DB writes (handoff.js,
 * add-prd-to-database.js) crash if their stdout/stderr read end closes early (a pipe to
 * head/grep): the next console.log raises an unhandled 'error' (EPIPE) that aborts the
 * process BEFORE persistence completes on POSIX/CI (Windows git-bash masks it), leaving a
 * partially-written / non-recorded row. Attach this handler to process.stdout AND
 * process.stderr so a closed pipe is swallowed while any OTHER stream error still throws.
 *
 *   import { attachIgnoreEpipe } from '../lib/utils/ignore-epipe.mjs';
 *   attachIgnoreEpipe();  // call once, early, before heavy output
 */

/**
 * Stream 'error' listener: swallow EPIPE (and the falsy/no-error edge), rethrow anything
 * else so real stream faults are never hidden. Pure — exported for direct unit testing.
 * @param {(NodeJS.ErrnoException|undefined|null)} err
 */
export function ignoreEpipe(err) {
  if (!err || err.code === 'EPIPE') return;
  throw err;
}

/**
 * Attach {@link ignoreEpipe} to the given streams (default: process stdout+stderr).
 * Idempotent enough for a single early call; pass streams in tests.
 * @param {{stdout?: NodeJS.WriteStream, stderr?: NodeJS.WriteStream}} [streams]
 */
export function attachIgnoreEpipe(streams = process) {
  if (streams.stdout && typeof streams.stdout.on === 'function') streams.stdout.on('error', ignoreEpipe);
  if (streams.stderr && typeof streams.stderr.on === 'function') streams.stderr.on('error', ignoreEpipe);
}
