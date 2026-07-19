/**
 * SD-LEO-INFRA-SUCCEEDING-POLL-EXEMPTION-001 — end-to-end + anti-test-masking proof.
 *
 * The 3-strikes RCA guard was silently nullified for the dominant blind-retry pattern
 * (a worker re-running the EXACT SAME failing Bash command) because Control 4 in
 * post-tool-rca-outcome.cjs fabricated exit_code:0 from ABSENCE of a failure signal —
 * and Claude Code's Bash tool_response never exposes a numeric exit_code and routes
 * error text to STDOUT (stderr empty). So a genuine hard failure was recorded as
 * exit_code:0, and the succeeding-poll exemption in recordAndCount() returned attempts:0
 * for every same-command retry (0,0,0 instead of 1,2,3).
 *
 * The prior polling-exemption unit test was GREEN only because it injected a SYNTHETIC
 * {exit_code:2} / {exit_code:0} lastOutcome that Claude Bash never actually produces —
 * that test-masking is why the bug shipped. This suite drives the REAL production writer
 * (post-tool-rca-outcome.cjs via spawnSync) with a Claude-SHAPED payload and threads its
 * actual output (or absence) into recordAndCount(), proving enforcement at the counter
 * through the true writer→reader seam rather than a hand-crafted object.
 *
 * MERGED with SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001 (stdout_sha capture,
 * built concurrently and merged the same window): post-tool-rca-outcome.cjs now ALSO
 * captures a stdout_sha content digest, so a last-outcome file IS written whenever stdout
 * has content (even though exit_code itself is never fabricated). The assertions below
 * were updated accordingly (file written, exit_code stays null) -- the core proof (the
 * succeeding-poll exemption cannot fire without a genuine exit_code:0) is unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { recordAndCount, bashCmdHash } = require('../../scripts/hooks/retry-state-manager.cjs');
const HOOK_PATH = path.resolve(__dirname, '../../scripts/hooks/post-tool-rca-outcome.cjs');

const SESSION = 'sess-succeeding-poll-e2e';
// Non-read-only, non-EXEMPT_PATTERNS command → falls through to the 3-strikes counter.
const FAIL_CMD = 'node scripts/deploy-artifact.mjs --push';
const noReset = async () => null;

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-poll-e2e-'));
  process.env.LEO_RETRY_STATE_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.LEO_RETRY_STATE_DIR;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

/**
 * Drive the REAL post-tool-rca-outcome.cjs hook with a payload and return the
 * last-outcome object it wrote (or undefined if it wrote no file). This is the true
 * writer seam — NOT a hand-crafted lastOutcome.
 */
function driveHook(payloadObj, session = SESSION) {
  const res = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(payloadObj),
    env: { ...process.env, CLAUDE_TOOL_NAME: 'Bash', CLAUDE_SESSION_ID: session, LEO_RETRY_STATE_DIR: tmpDir },
    encoding: 'utf8',
  });
  expect(res.status).toBe(0); // hook is fail-open, always exits 0
  const outFile = path.join(tmpDir, `last-outcome-${session}.json`);
  return fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : undefined;
}

// A genuine Claude Bash FAILURE: error text in stdout, empty stderr, NO exit_code,
// no is_error/interrupted — exactly the shape the real tool emits (and the shape the
// synthetic {exit_code:2} test never exercised).
function claudeShapedFailurePayload() {
  return {
    tool_name: 'Bash',
    tool_input: { command: FAIL_CMD },
    tool_response: {
      stdout: 'Error: deploy failed — connection refused\n  at deploy (scripts/deploy-artifact.mjs:42)',
      stderr: '',
    },
  };
}

describe('SUCCEEDING-POLL-EXEMPTION-001 — real writer→reader seam', () => {
  it('TS-1/AC-1: 3 identical GENUINE failures (Claude-shaped) accumulate 1,2,3 (pre-fix: 0,0,0)', async () => {
    const attempts = [];
    for (let i = 0; i < 3; i++) {
      const lastOutcome = driveHook(claudeShapedFailurePayload());
      // Combined with SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001 (stdout_sha
      // capture): the hook NOW writes a last-outcome file for a Claude-shaped failure
      // (stdout has real content), but exit_code stays null (never fabricated to 0) —
      // so the succeeding-poll exemption's `lo.exit_code===0` condition is never
      // satisfied, and the fabricated-success lie is still gone at the source.
      expect(lastOutcome).toBeDefined();
      expect(lastOutcome.exit_code).toBeNull();
      expect(lastOutcome.stdout_sha).toMatch(/^[0-9a-f]{16}$/);
      const r = await recordAndCount(SESSION, null, 'Bash', { command: FAIL_CMD }, {
        rcaCheck: noReset, now: 1000 + i * 1000, lastOutcome,
      });
      attempts.push(r.attempts);
    }
    expect(attempts).toEqual([1, 2, 3]); // crosses the 3-strikes RCA-tiered threshold
  });

  it('TS-5/AC-5: a SUCCESS payload yields no exit_code:0, so the exemption cannot fire on a fabricated success', async () => {
    const successPayload = {
      tool_name: 'Bash',
      tool_input: { command: FAIL_CMD },
      tool_response: { stdout: 'ok', stderr: '' }, // Claude success shape: no exit_code
    };
    const lastOutcome = driveHook(successPayload);
    // Combined with stdout_sha capture: a file IS now written (stdout has content 'ok'),
    // but exit_code stays null -- the succeeding-poll exemption's `lo.exit_code===0`
    // condition is never satisfied, so it still cannot fire on a fabricated success.
    expect(lastOutcome).toBeDefined();
    expect(lastOutcome.exit_code).toBeNull();

    // Because no exit_code:0 was recorded, a subsequent identical FAILURE is NOT
    // exempted — it accumulates rather than being masked by an inferred success.
    const r = await recordAndCount(SESSION, null, 'Bash', { command: FAIL_CMD }, {
      rcaCheck: noReset, now: 1000, lastOutcome,
    });
    expect(r.attempts).toBe(1);
  });

  it('teeth intact: a GENUINE numeric exit_code:2 IS still written verbatim and does NOT exempt the retry', async () => {
    const numericFailure = {
      tool_name: 'Bash',
      tool_input: { command: FAIL_CMD },
      tool_response: { exit_code: 2, stderr: 'Error: boom' },
    };
    const lastOutcome = driveHook(numericFailure);
    expect(lastOutcome).toBeDefined();
    expect(lastOutcome.exit_code).toBe(2); // genuine numeric code recorded verbatim
    expect(lastOutcome.command_sha).toBe(bashCmdHash(FAIL_CMD));

    const r = await recordAndCount(SESSION, null, 'Bash', { command: FAIL_CMD }, {
      rcaCheck: noReset, now: 1000, lastOutcome,
    });
    expect(r.attempts).toBe(1); // exit_code:2 is not success → accumulates (exemption only on 0)
  });
});
