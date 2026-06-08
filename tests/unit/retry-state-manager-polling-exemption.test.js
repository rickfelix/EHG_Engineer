/**
 * SD-FDBK-FIX-RCA-TIERED-ENFORCEMENT-001 — succeeding-poll exemption.
 *
 * The RCA tiered-enforcement guard hard-blocks the 3rd invocation of the same
 * Bash command within 10 minutes. A recurring polling cron that runs an identical
 * SUCCEEDING command (exit 0, identical stderr) produced an identical signature
 * every run and false-tripped the block. Fix: a blind retry is re-running a FAILED
 * command, so recordAndCount exempts an invocation when the immediately-prior
 * invocation of the SAME command exited 0 (command-scoped via lastOutcome.command_sha).
 * Failures, unknown exit codes, different commands, and legacy outcomes still accumulate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { recordAndCount, bashCmdHash } = require('../../scripts/hooks/retry-state-manager.cjs');

const SESSION = 'sess-poll-exemption';
const POLL_CMD = 'node scripts/fleet-inbox-monitor.cjs --once';
const OTHER_CMD = 'node scripts/something-else.cjs';
const noReset = async () => null; // never reset counters from the DB
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-poll-'));
  process.env.LEO_RETRY_STATE_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.LEO_RETRY_STATE_DIR;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function call(cmd, lastOutcome, now) {
  return recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now, lastOutcome });
}

describe('recordAndCount succeeding-poll exemption (SD-FDBK-FIX-RCA-TIERED-ENFORCEMENT-001)', () => {
  it('succeeding poll x4 (same command, prior exit 0, matching command_sha) never accumulates', async () => {
    const lo = { exit_code: 0, stderr_sha: '', command_sha: bashCmdHash(POLL_CMD) };
    for (let i = 0; i < 4; i++) {
      const r = await call(POLL_CMD, lo, 1000 + i * 1000);
      expect(r.attempts).toBe(0); // exempted every time → never reaches the 3-strikes block
    }
  });

  it('failing command x3 still accumulates and reaches the block threshold', async () => {
    const lo = { exit_code: 2, stderr_sha: 'deadbeefdeadbeef', command_sha: bashCmdHash(POLL_CMD) };
    const r1 = await call(POLL_CMD, lo, 1000);
    const r2 = await call(POLL_CMD, lo, 2000);
    const r3 = await call(POLL_CMD, lo, 3000);
    expect(r1.attempts).toBe(1);
    expect(r2.attempts).toBe(2);
    expect(r3.attempts).toBe(3); // blind-retry detection preserved (would hard-block)
  });

  it('interleaved: prior success of a DIFFERENT command does NOT exempt a failing command (command-scoped)', async () => {
    // lastOutcome is exit 0 but command_sha is for OTHER_CMD, not POLL_CMD.
    const lo = { exit_code: 0, stderr_sha: '', command_sha: bashCmdHash(OTHER_CMD) };
    const r = await call(POLL_CMD, lo, 1000);
    expect(r.attempts).toBe(1); // NOT exempted → accumulates (no leak masking a real retry loop)
  });

  it('unknown/null exit_code does NOT exempt (strict success check)', async () => {
    const lo = { exit_code: null, stderr_sha: 'abc', command_sha: bashCmdHash(POLL_CMD) };
    const r = await call(POLL_CMD, lo, 1000);
    expect(r.attempts).toBe(1); // null is not success → accumulates
  });

  it('legacy lastOutcome without command_sha does NOT exempt (back-compat / fail-open)', async () => {
    const lo = { exit_code: 0, stderr_sha: '' }; // no command_sha (pre-fix outcome file)
    const r = await call(POLL_CMD, lo, 1000);
    expect(r.attempts).toBe(1); // command_sha absent → no exemption → current behavior
  });

  it('missing lastOutcome entirely does NOT exempt (current behavior preserved)', async () => {
    const r = await call(POLL_CMD, undefined, 1000);
    expect(r.attempts).toBe(1);
  });

  it("accepts string '0' exit_code as success (coercion-safe)", async () => {
    const lo = { exit_code: '0', stderr_sha: '', command_sha: bashCmdHash(POLL_CMD) };
    const r = await call(POLL_CMD, lo, 1000);
    expect(r.attempts).toBe(0);
  });
});
