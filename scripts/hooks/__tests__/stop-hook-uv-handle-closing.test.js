// Regression: Windows libuv UV_HANDLE_CLOSING abort in DB-touching Stop hooks.
//
// Symptom (pre-fix): a Stop hook that ran a Supabase query (undici/fetch keep-alive
// socket) and then called process.exit() aborted on Windows with
//   "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 76"
// surfaced by Claude Code as "Stop hook error: Failed with non-blocking status code".
//
// EMPIRICAL finding (repro before the fix, 6/6 each): the abort fires with a bare
// process.exit(), with a setImmediate-deferred exit (the folklore "gracefulExit"
// pattern copied from stop-subagent-enforcement.js), AND even after
// getGlobalDispatcher().close() if process.exit() is still called. The ONLY reliable
// avoidance is to NOT call process.exit() in the post-query path: close undici's
// sockets and let the event loop drain so the process exits on its own.
//
// These are STATIC SOURCE-PINS (no DB / no subprocess) so they are deterministic in
// CI: a behavioral repro needs live Supabase + Windows and would flake. They fail if
// a future edit reintroduces a post-query process.exit() or the disproven setImmediate
// pattern, or drops the undici socket close.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const HOOKS = [
  'stop-loop-wakeup-reminder.cjs',
  'post-completion-tail-enforcement.cjs',
];

/** Strip line-comments (`//…`) and jsdoc/star lines so assertions see executable code only. */
function executableSource(src) {
  return src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

describe.each(HOOKS)('UV_HANDLE_CLOSING contract — %s', (hookFile) => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', hookFile), 'utf8');
  const code = executableSource(src);

  it('closes undici keep-alive sockets before exiting (getGlobalDispatcher().close())', () => {
    expect(code).toMatch(/getGlobalDispatcher\(\)\.close\(\)/);
  });

  it('does NOT use the disproven setImmediate(() => process.exit(…)) pattern', () => {
    expect(code).not.toMatch(/setImmediate\(\s*\(\)\s*=>\s*process\.exit/);
  });

  it('calls process.exit() ONLY from the single unref\'d drain backstop', () => {
    const exits = code.match(/process\.exit\(/g) || [];
    expect(exits.length).toBe(1);
    // …and that one occurrence is the unref'd setTimeout backstop, never an inline exit.
    expect(code).toMatch(/setTimeout\(\s*\(\)\s*=>\s*process\.exit\(0\)\s*,\s*8000\s*\)\.unref\(\)/);
  });

  it('routes exits through an async shutdown() helper (close → natural drain)', () => {
    expect(code).toMatch(/async function shutdown\s*\(/);
    expect(code).toMatch(/return shutdown\(\)/);
  });
});
