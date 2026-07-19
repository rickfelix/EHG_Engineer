/**
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001 — de-masking test.
 *
 * Coordinator-confirmed RCA (session 89b12649, 169-session empirical proof, corroborated
 * live during this SD's own investigation): Claude Code's Bash tool_response NEVER
 * populates real stderr content or a numeric exit_code, on success OR failure — verified
 * by directly capturing a real PostToolUse payload for a genuinely-failing command
 * (explicit `console.error()` + `process.exit(1)` + an uncaught native crash), whose
 * tool_response was `{stdout: "<all the error/crash text>", stderr: "", interrupted:
 * false, isImage: false, noOutputExpected: false}` — structurally IDENTICAL in shape to
 * a successful command's tool_response, differing only in stdout CONTENT.
 *
 * The pre-fix unit tests for this feature (scripts/hooks/__tests__/post-tool-rca-outcome
 * .test.js, tests/unit/retry-state-manager-signature.test.js) all construct synthetic
 * lastOutcome objects with distinct stderr_sha values per attempt — a shape that never
 * occurs on the real harness. Those tests stayed green while the real signal (stderr_sha)
 * silently collapsed to '' every time in production: TEST-MASKING, per the RCA's own
 * classification.
 *
 * These tests use ONLY the empirically-real payload shape (no exit_code field, stderr
 * always '', distinguishing content only in stdout) end-to-end through both hooks, and
 * FIRST demonstrate the pre-fix collapse would have occurred (documents the regression
 * this fix closes) before proving the post-fix behavior satisfies the SD's 3 acceptance
 * criteria.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const HOOK_PATH = path.resolve(__dirname, '../../scripts/hooks/post-tool-rca-outcome.cjs');
const RETRY_MGR_PATH = path.resolve(__dirname, '../../scripts/hooks/retry-state-manager.cjs');

/** The real, empirically-captured Claude Code Bash tool_response shape. No exit_code,
 *  no is_error/isError/error field, stderr always ''. Only `stdout` varies. */
function realShapedPayload({ sessionId, command, stdout }) {
  return JSON.stringify({
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command },
    tool_response: { stdout, stderr: '', interrupted: false, isImage: false, noOutputExpected: false },
  });
}

function runHookOnce({ sessionId, tmpDir, command, stdout }) {
  const payload = realShapedPayload({ sessionId, command, stdout });
  const result = spawnSync('node', [HOOK_PATH], {
    input: payload,
    env: { ...process.env, CLAUDE_TOOL_NAME: 'Bash', CLAUDE_SESSION_ID: sessionId, LEO_RETRY_STATE_DIR: tmpDir },
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  const outFile = path.join(tmpDir, `last-outcome-${sessionId}.json`);
  return JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

describe('de-masked capture: real tool_response shape produces a real content fingerprint', () => {
  let tmpDir;
  const SESSION_ID = 'real-shape-' + Math.random().toString(36).slice(2);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-real-shape-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('PRE-FIX REGRESSION DOCUMENTATION: on the real payload shape, stderr_sha alone is constant across 3 distinct failures', () => {
    // This is the bug this SD fixes, made explicit: with the REAL shape (stderr always
    // ''), stderr_sha collapses to '' regardless of how different the failures are.
    const outcomes = [
      runHookOnce({ sessionId: SESSION_ID + '-a', tmpDir, command: 'node scripts/handoff.js execute PLAN-TO-LEAD SD-X', stdout: 'SD_TYPE_CHANGE_EXPLANATION_REQUIRED: provide a reason' }),
      runHookOnce({ sessionId: SESSION_ID + '-b', tmpDir, command: 'node scripts/handoff.js execute PLAN-TO-LEAD SD-X', stdout: 'anti-gaming-threshold exceeded: too many type changes' }),
      runHookOnce({ sessionId: SESSION_ID + '-c', tmpDir, command: 'node scripts/handoff.js execute PLAN-TO-LEAD SD-X', stdout: 'SD_TYPE_CHANGE_TIMING_BLOCKED: cool-down window active' }),
    ];
    expect(new Set(outcomes.map((o) => o.stderr_sha)).size).toBe(1); // all collapse to ''
    expect(outcomes[0].stderr_sha).toBe('');
  });

  it('TS-A / AC(a): the SAME 3 distinct failures produce 3 DISTINCT stdout_sha values', () => {
    const outcomes = [
      runHookOnce({ sessionId: SESSION_ID + '-a2', tmpDir, command: 'node scripts/handoff.js execute PLAN-TO-LEAD SD-X', stdout: 'SD_TYPE_CHANGE_EXPLANATION_REQUIRED: provide a reason' }),
      runHookOnce({ sessionId: SESSION_ID + '-b2', tmpDir, command: 'node scripts/handoff.js execute PLAN-TO-LEAD SD-X', stdout: 'anti-gaming-threshold exceeded: too many type changes' }),
      runHookOnce({ sessionId: SESSION_ID + '-c2', tmpDir, command: 'node scripts/handoff.js execute PLAN-TO-LEAD SD-X', stdout: 'SD_TYPE_CHANGE_TIMING_BLOCKED: cool-down window active' }),
    ];
    const shas = outcomes.map((o) => o.stdout_sha);
    expect(new Set(shas).size).toBe(3);
    shas.forEach((s) => expect(s).toMatch(/^[0-9a-f]{16}$/));
  });

  it('a genuine crash payload (real empirical capture shape) is also captured, not skipped', () => {
    // Mirrors the real captured payload from this SD's own investigation: stdout carries
    // BOTH a console.error()'d message AND an uncaught native-crash line; stderr is ''.
    const outcome = runHookOnce({
      sessionId: SESSION_ID + '-crash',
      tmpDir,
      command: 'node -e "some-script.js"',
      stdout: 'ERR column sub_agent_execution_results.status does not exist\nAssertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 76',
    });
    expect(outcome.stdout_sha).toMatch(/^[0-9a-f]{16}$/);
    expect(outcome.stdout_sha).not.toBe('');
  });
});

describe('TS-B / AC(a)+AC(b): end-to-end recordAndCount — 3 distinct real-shaped failures never collapse, a 4th correct attempt is not hard-blocked', () => {
  let tmpDir;
  const SESSION_ID = 'e2e-' + Math.random().toString(36).slice(2);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-e2e-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
    delete require.cache[require.resolve(RETRY_MGR_PATH)];
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.LEO_RETRY_STATE_DIR;
  });

  it('3 distinct real-shaped Bash failures on the SAME command each track attempts=1 under their own signature (no false collapse) -- SCOPE: this models the case where the succeeding-poll exemption in recordAndCount() does NOT apply (no matching command_sha carried on lastOutcome, e.g. the first invocation this session, or a session where outcome capture has not yet fired for this command). See the "PRODUCTION REALITY" test below for the dominant real-world case where a matching command_sha IS present.', async () => {
    const mod = require(RETRY_MGR_PATH);
    const noopRca = async () => null;
    const cmd = 'node scripts/handoff.js execute PLAN-TO-LEAD SD-REAL-001';

    // Each lastOutcome mirrors the REAL Claude Code shape: no exit_code, stderr_sha '',
    // only stdout_sha differs (as computed by post-tool-rca-outcome.cjs's digestStdoutTail).
    // Deliberately OMITS command_sha (see scope note above).
    const { digestStdoutTail } = require(HOOK_PATH);
    const outcomes = [
      { exit_code: 0, stderr_sha: '', stdout_sha: digestStdoutTail('SD_TYPE_CHANGE_EXPLANATION_REQUIRED: provide a reason') },
      { exit_code: 0, stderr_sha: '', stdout_sha: digestStdoutTail('anti-gaming-threshold exceeded: too many type changes') },
      { exit_code: 0, stderr_sha: '', stdout_sha: digestStdoutTail('SD_TYPE_CHANGE_TIMING_BLOCKED: cool-down window active') },
    ];

    const results = [];
    for (const lastOutcome of outcomes) {
      results.push(await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome }));
    }

    // AC(a): 3 distinct signatures — none collapsed.
    const sigs = results.map((r) => r.signature);
    expect(new Set(sigs).size).toBe(3);
    // Each new signature starts fresh at attempts=1 — the hard block (attempts>=3 on ONE
    // signature) never triggers.
    results.forEach((r) => expect(r.attempts).toBe(1));

    // AC(b): a legitimately-different 4th attempt (this time succeeding) is not blocked.
    const fourthOutcome = { exit_code: 0, stderr_sha: '', stdout_sha: digestStdoutTail('Handoff PLAN-TO-LEAD complete, score 97') };
    const fourth = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome: fourthOutcome });
    expect(fourth.attempts).toBe(1); // fresh signature, not the accumulated 4th strike on a collapsed one
    expect(new Set([...sigs, fourth.signature]).size).toBe(4);
  });

  it('REGRESSION GUARD (teeth preserved when the succeeding-poll exemption does not apply): 3 IDENTICAL real-shaped failures (same stdout each time, no matching command_sha carried) still accumulate to attempts=3', async () => {
    const mod = require(RETRY_MGR_PATH);
    const noopRca = async () => null;
    const cmd = 'node scripts/genuinely-broken-script.js';
    const { digestStdoutTail } = require(HOOK_PATH);
    const sameOutcome = { exit_code: 0, stderr_sha: '', stdout_sha: digestStdoutTail('TypeError: cannot read property "x" of undefined') };

    const a = await mod.recordAndCount(SESSION_ID + '-stuck', null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome: sameOutcome });
    const b = await mod.recordAndCount(SESSION_ID + '-stuck', null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome: sameOutcome });
    const c = await mod.recordAndCount(SESSION_ID + '-stuck', null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome: sameOutcome });
    expect(a.attempts).toBe(1);
    expect(b.attempts).toBe(2);
    expect(c.attempts).toBe(3);
    expect(a.signature).toBe(b.signature);
    expect(b.signature).toBe(c.signature);
  });

  it('KNOWN LIMITATION (VALIDATION-caught, tracked in follow-up SD-LEO-INFRA-SUCCEEDING-POLL-EXEMPTION-001, NOT fixed by this SD): when a matching command_sha IS carried on lastOutcome (the dominant real-world shape -- pre-tool-enforce.cjs always passes the FULL captured outcome, including command_sha, per scripts/hooks/post-tool-rca-outcome.cjs), the succeeding-poll exemption in recordAndCount() short-circuits BEFORE this SD stdout_sha signature-differentiation is even consulted. Because Control 4 (SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001) infers exit_code:0 from mere absence of a failure signal -- and Claude Code never exposes a real failure signal for a genuine failure either -- the exemption fires on every same-command repeat, so even 3+ IDENTICAL genuine failures never accumulate. This documents CURRENT reality (attempts stays 0), not a desired behavior -- it is a regression canary for the follow-up SD, not proof this SD is complete.', async () => {
    const mod = require(RETRY_MGR_PATH);
    const noopRca = async () => null;
    const cmd = 'node scripts/genuinely-broken-script.js';
    const { digestStdoutTail, bashCmdHash } = { ...require(HOOK_PATH), ...require(RETRY_MGR_PATH) };
    const commandSha = bashCmdHash(cmd);
    // Mirrors what post-tool-rca-outcome.cjs ACTUALLY writes in production for a
    // genuine failure on this harness: exit_code inferred 0 (Control 4), stderr_sha '',
    // stdout_sha real, AND command_sha present (always captured when a command is known).
    const sameOutcomeWithCommandSha = {
      exit_code: 0, stderr_sha: '',
      stdout_sha: digestStdoutTail('TypeError: cannot read property "x" of undefined'),
      command_sha: commandSha,
    };

    const a = await mod.recordAndCount(SESSION_ID + '-exempted', null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome: sameOutcomeWithCommandSha });
    const b = await mod.recordAndCount(SESSION_ID + '-exempted', null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome: sameOutcomeWithCommandSha });
    const c = await mod.recordAndCount(SESSION_ID + '-exempted', null, 'Bash', { command: cmd }, { rcaCheck: noopRca, lastOutcome: sameOutcomeWithCommandSha });
    // The succeeding-poll exemption pre-empts counting entirely -- attempts never
    // accumulates past 0, regardless of how many identical failures occur.
    expect(a.attempts).toBe(0);
    expect(b.attempts).toBe(0);
    expect(c.attempts).toBe(0);
  });
});

describe('digestStdoutTail (unit)', () => {
  it('empty/non-string input returns an empty string', () => {
    const { digestStdoutTail } = require(HOOK_PATH);
    expect(digestStdoutTail('')).toBe('');
    expect(digestStdoutTail(null)).toBe('');
    expect(digestStdoutTail(undefined)).toBe('');
  });

  it('two distinct governance-trigger error strings produce different digests', () => {
    const { digestStdoutTail } = require(HOOK_PATH);
    const a = digestStdoutTail('SD_TYPE_CHANGE_EXPLANATION_REQUIRED: provide a reason');
    const b = digestStdoutTail('SD_TYPE_CHANGE_TIMING_BLOCKED: cool-down window active');
    expect(a).not.toBe(b);
  });

  it('a genuinely-identical recurrence with a different volatile timestamp still collides to the SAME digest (Control preserved)', () => {
    const { digestStdoutTail } = require(HOOK_PATH);
    const a = digestStdoutTail('FAIL: gate rejected\n at 2026-07-17T14:16:47.153Z');
    const b = digestStdoutTail('FAIL: gate rejected\n at 2026-07-18T09:02:11.900Z');
    expect(a).toBe(b);
  });
});
