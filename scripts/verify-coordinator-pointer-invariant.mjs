#!/usr/bin/env node
// SD-LEO-FIX-ENF-TRUSTS-FILE-001 / FR-5 + TR-5.
//
// Wraps a test command and proves the invariant "a test must never touch the live coordinator
// pointer file" — not just "a test must not write a malformed value" (QF-20260727-391 already
// shipped a shape check and it did not prevent the sess-987 incident two days later, because
// the fixture payload was structurally valid).
//
// Deliberately does NOT import lib/coordinator/resolve.cjs or scripts/hooks/session-role-orient.cjs.
// Under VITEST both of those redirect to a per-PID tmpdir fixture path — importing either one here
// would make this check read its own gated subject through the same gate it exists to verify, and
// it would pass vacuously even if the underlying fix were broken (TR-5).
//
// Usage: node scripts/verify-coordinator-pointer-invariant.mjs -- <command> [args...]
// Exit code is non-zero if EITHER the wrapped command fails OR the pointer-file invariant breaks.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Independently constructed — the whole point is this must NOT go through resolve.cjs's
// VITEST-gated ACTIVE_COORDINATOR_FILE, which is exactly what this check verifies test runs
// never touch.
const REAL_POINTER_FILE = path.resolve(__dirname, '..', '.claude', 'active-coordinator.json');

function snapshot() {
  if (!existsSync(REAL_POINTER_FILE)) return { present: false, hash: null };
  const content = readFileSync(REAL_POINTER_FILE);
  return { present: true, hash: createHash('sha256').update(content).digest('hex') };
}

function main() {
  const sepIdx = process.argv.indexOf('--');
  if (sepIdx === -1 || sepIdx === process.argv.length - 1) {
    console.error('Usage: node scripts/verify-coordinator-pointer-invariant.mjs -- <command> [args...]');
    process.exit(2);
  }
  const [cmd, ...args] = process.argv.slice(sepIdx + 1);

  const before = snapshot();
  // shell:true is required on Windows to resolve npm .cmd shims (spawnSync fails with EINVAL
  // otherwise -- Node cannot exec .cmd/.bat files directly). Safe here per the repo's governed
  // shell-injection-argv-lint allowlist convention: cmd/args arrive as an argv array (never a
  // template-literal string), and the only caller is the fixed `test:coordinator-pointer-invariant`
  // npm script -- no untrusted/external input reaches this call.
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const after = snapshot();

  let invariantHeld = true;
  if (before.present !== after.present) {
    invariantHeld = false;
    console.error(
      `\n[POINTER_INVARIANT_VIOLATED] ${REAL_POINTER_FILE} existence changed: `
      + `present=${before.present} -> present=${after.present}`
    );
  } else if (before.present && after.present && before.hash !== after.hash) {
    invariantHeld = false;
    console.error(
      `\n[POINTER_INVARIANT_VIOLATED] ${REAL_POINTER_FILE} content changed during the test run `
      + `(hash ${before.hash.slice(0, 12)}... -> ${after.hash.slice(0, 12)}...)`
    );
  }

  if (invariantHeld) {
    console.log(`\n[POINTER_INVARIANT_OK] ${REAL_POINTER_FILE} unchanged (present=${before.present}).`);
  }

  const cmdFailed = result.status !== 0;
  if (cmdFailed) {
    console.error(`\n[COMMAND_FAILED] "${cmd} ${args.join(' ')}" exited with code ${result.status}`);
  }

  process.exit(invariantHeld && !cmdFailed ? 0 : 1);
}

main();
