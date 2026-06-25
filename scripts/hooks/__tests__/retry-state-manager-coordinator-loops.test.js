// SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 — structural replacement of the reactive
// EXEMPT_PATTERNS allowlist (formerly QF-20260610-626 et al). The RCA recurrence detector
// false-blocked read-only/idempotent loops because successful Bash carried no exit signal
// (post-tool-rca-outcome.cjs skipped the write) → the per-signature counter accumulated.
// These tests pin the STRUCTURAL fix: (1) a succeeding poll (prior SAME command exit 0, now
// reliably captured by Control 4) never accumulates; (2) a FAILING loop STILL accumulates
// (teeth); (3) the absence-of-failure exemption is conjunctive with a deny-by-default
// read-only classifier; (4) the classifier rejects compound/mutating shapes; (5) a no-SD-claim
// session can reset via the session-scoped marker (R5); (6) the Control-3 progress fingerprint
// is returned so the caller can suppress a spurious auto-signal.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const MODULE_PATH = path.resolve(__dirname, '../retry-state-manager.cjs');

function loadFresh() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

const NO_RCA = { rcaCheck: async () => null };

describe('Control 2 — isReadOnlyCommand (deny-by-default classifier)', () => {
  const { isReadOnlyCommand } = loadFresh();

  it('classifies provably read-only single commands as read-only', () => {
    for (const c of ['git status', 'git log --oneline -5', 'ls -la', 'pwd', 'cat package.json',
                     'grep -r foo src', 'rg pattern', 'find . -name x', 'echo hi', 'stat file']) {
      expect(isReadOnlyCommand(c)).toBe(true);
    }
  });

  it('DENY-BY-DEFAULT: unknown / script-invoking commands are NOT read-only', () => {
    for (const c of ['node scripts/worker-checkin.cjs', 'node scripts/coordinator-audit.mjs',
                     'npm run build', 'rm -rf x', 'git commit -m x', 'psql -c "UPDATE t SET a=1"']) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
  });

  it('rejects compound/redirecting shapes even with a read-only leading verb (R1)', () => {
    for (const c of ['git status && rm -rf x', 'cat f | tee g', 'ls > out.txt',
                     'echo $(rm x)', 'grep x f; touch y']) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
  });

  it('fail-open input handling preserved', () => {
    expect(isReadOnlyCommand(null)).toBe(false);
    expect(isReadOnlyCommand(undefined)).toBe(false);
    expect(isReadOnlyCommand('')).toBe(false);
  });
});

describe('TS-1 — succeeding poll (prior SAME command exit 0) never accumulates', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('a non-allowlisted succeeding tick (Control 4 exit-0 capture) stays at attempts 0 across 5 ticks', async () => {
    const { recordAndCount, bashCmdHash } = loadFresh();
    // NOT in EXEMPT_PATTERNS — exemption here is driven purely by the captured exit_code 0.
    const cmd = 'node scripts/my-idempotent-tick.js';
    const lastOutcome = { exit_code: 0, command_sha: bashCmdHash(cmd), stderr_sha: '' };
    for (let i = 0; i < 5; i++) {
      const r = await recordAndCount('sess-poll', null, 'Bash', { command: cmd }, { ...NO_RCA, lastOutcome });
      expect(r.attempts).toBe(0);
    }
  });

  it('a pure read-only command with NO prior outcome stays at 0 (Control 1 + classifier)', async () => {
    const { recordAndCount } = loadFresh();
    for (let i = 0; i < 5; i++) {
      const r = await recordAndCount('sess-ro', null, 'Bash', { command: 'git status' }, NO_RCA);
      expect(r.attempts).toBe(0);
    }
  });
});

describe('TS-2 — TEETH: a FAILING loop still accumulates to the hard-block', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('a non-read-only retry loop accumulates 1..4 (3-strikes machinery intact)', async () => {
    const { recordAndCount } = loadFresh();
    const counts = [];
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount('sess-fail', null, 'Bash', { command: 'node scripts/flaky.js' }, NO_RCA);
      counts.push(r.attempts);
    }
    expect(counts).toEqual([1, 2, 3, 4]);
  });

  it('a FAILING read-only loop (prior exit non-zero) still accumulates', async () => {
    const { recordAndCount, bashCmdHash } = loadFresh();
    const cmd = 'grep needle haystack';
    const lastOutcome = { exit_code: 1, command_sha: bashCmdHash(cmd), stderr_sha: 'abc123' };
    const counts = [];
    for (let i = 0; i < 3; i++) {
      const r = await recordAndCount('sess-rofail', null, 'Bash', { command: cmd }, { ...NO_RCA, lastOutcome });
      counts.push(r.attempts);
    }
    expect(counts).toEqual([1, 2, 3]);
  });
});

describe('TS-3 — conjunction: success ALONE or read-only ALONE does not over-exempt', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('read-only command WITH a failure outcome is NOT exempted by the Control-1 path', async () => {
    const { recordAndCount } = loadFresh();
    // read-only verb but the prior outcome shows a failure (stderr present) → must accumulate.
    const lastOutcome = { exit_code: null, command_sha: 'deadbeef', stderr_sha: 'eee111' };
    const r1 = await recordAndCount('sess-c1', null, 'Bash', { command: 'git status' }, { ...NO_RCA, lastOutcome });
    const r2 = await recordAndCount('sess-c1', null, 'Bash', { command: 'git status' }, { ...NO_RCA, lastOutcome });
    expect(r2.attempts).toBe(2);
  });

  it('non-read-only command with absence-of-failure is NOT exempted by the Control-1 path', async () => {
    const { recordAndCount } = loadFresh();
    // no prior outcome (absence of failure) but the command is not provably read-only → accumulate.
    const r1 = await recordAndCount('sess-c2', null, 'Bash', { command: 'node scripts/mutator.js' }, NO_RCA);
    const r2 = await recordAndCount('sess-c2', null, 'Bash', { command: 'node scripts/mutator.js' }, NO_RCA);
    expect(r2.attempts).toBe(2);
  });
});

describe('TS-7 — R5: no-SD-claim session can reset via the session-scoped marker', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writeSessionRcaReset clears the counter for a sdKey=null session', async () => {
    const { recordAndCount, writeSessionRcaReset } = loadFresh();
    const cmd = 'node scripts/flaky.js';
    const a = await recordAndCount('sess-r5', null, 'Bash', { command: cmd }, NO_RCA);
    const b = await recordAndCount('sess-r5', null, 'Bash', { command: cmd }, NO_RCA);
    expect(b.attempts).toBe(2);
    // A no-claim (coordinator/Adam) session drops the marker — newer than reset_at.
    writeSessionRcaReset('sess-r5', new Date(Date.now() + 1000).toISOString());
    const c = await recordAndCount('sess-r5', null, 'Bash', { command: cmd }, NO_RCA);
    expect(c.rcaResetApplied).toBe(true);
    expect(c.attempts).toBe(1); // counter reset, this call is the first post-reset
  });
});

describe('Control 3 — progress fingerprint drives progressStalled', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('unchanged fingerprint across the repetition → progressStalled true', async () => {
    const { recordAndCount } = loadFresh();
    const cmd = 'node scripts/flaky.js';
    await recordAndCount('sess-p1', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:40' });
    const r2 = await recordAndCount('sess-p1', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:40' });
    expect(r2.attempts).toBe(2);
    expect(r2.progressStalled).toBe(true);
  });

  it('changed fingerprint (session advanced) → progressStalled false', async () => {
    const { recordAndCount } = loadFresh();
    const cmd = 'node scripts/flaky.js';
    await recordAndCount('sess-p2', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:40' });
    const r2 = await recordAndCount('sess-p2', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:55' });
    expect(r2.attempts).toBe(2);
    expect(r2.progressStalled).toBe(false);
  });

  it('no fingerprint supplied → progressStalled undefined (back-compat)', async () => {
    const { recordAndCount } = loadFresh();
    const r = await recordAndCount('sess-p3', null, 'Bash', { command: 'node scripts/flaky.js' }, NO_RCA);
    expect(r.progressStalled).toBeUndefined();
  });
});
