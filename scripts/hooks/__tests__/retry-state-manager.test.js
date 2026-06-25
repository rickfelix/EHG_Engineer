// QF-20260504-830 — exempt /coordinator monitoring scripts from RCA-TIERED dedup.
// Closes feedback id=57c7873e-09ff-4259-8761-7b6ebbf5d74b.
// SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 — allowlist RETAINED as the interleaving-safe
// backstop; structural read-only classifier + Control-4 exit-0 capture added alongside it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const MODULE_PATH = path.resolve(__dirname, '../retry-state-manager.cjs');

function loadFresh() {
  // CJS require cache lets us re-import after mutating env in tests.
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

describe('QF-830 isExempt: known-idempotent /coordinator monitoring scripts (allowlist backstop)', () => {
  const { isExempt } = loadFresh();

  it('exempts stale-session-sweep.cjs', () => {
    expect(isExempt('node scripts/stale-session-sweep.cjs')).toBe(true);
  });

  it('exempts fleet-dashboard.cjs with args', () => {
    expect(isExempt('node scripts/fleet-dashboard.cjs all')).toBe(true);
  });

  it('exempts assign-fleet-identities.cjs', () => {
    expect(isExempt('node scripts/assign-fleet-identities.cjs')).toBe(true);
  });

  it('exempts .claude/tmp/coord-*.cjs', () => {
    expect(isExempt('node .claude/tmp/coord-resume-bulletin.cjs')).toBe(true);
  });

  it('exempts .claude/tmp/coord-*.mjs', () => {
    expect(isExempt('node .claude/tmp/coord-foo.mjs')).toBe(true);
  });

  it('does NOT exempt non-monitoring scripts (preserves throttle)', () => {
    expect(isExempt('node scripts/leo-create-sd.js')).toBe(false);
  });

  it('tolerates ./ path prefix', () => {
    expect(isExempt('node ./scripts/stale-session-sweep.cjs')).toBe(true);
  });

  it('returns false for non-string / empty input', () => {
    expect(isExempt(null)).toBe(false);
    expect(isExempt(undefined)).toBe(false);
    expect(isExempt('')).toBe(false);
    expect(isExempt(42)).toBe(false);
  });
});

describe('Control 2 isReadOnlyCommand: structural read-only classifier (deny-by-default)', () => {
  const { isReadOnlyCommand } = loadFresh();

  it('exempts provably read-only single commands (the coordinator monitoring loop)', () => {
    expect(isReadOnlyCommand('git status')).toBe(true);
    expect(isReadOnlyCommand('cat package.json')).toBe(true);
    expect(isReadOnlyCommand('ls -la src')).toBe(true);
  });

  it('deny-by-default: script invocations / mutating / compound shapes are NOT read-only', () => {
    expect(isReadOnlyCommand('node scripts/leo-create-sd.js')).toBe(false);
    expect(isReadOnlyCommand('git commit -m x')).toBe(false);
    expect(isReadOnlyCommand('git status && rm x')).toBe(false);
    expect(isReadOnlyCommand('cat f > g')).toBe(false);
  });

  it('returns false for non-string / empty input', () => {
    expect(isReadOnlyCommand(null)).toBe(false);
    expect(isReadOnlyCommand('')).toBe(false);
  });
});

describe('QF-830 recordAndCount: exempt commands skip record AND count', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf830-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.LEO_RETRY_STATE_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allowlisted command returns count=0 across 4 successive invocations and writes nothing', async () => {
    const { recordAndCount } = loadFresh();
    const sessionId = 'qf830-exempt';
    const input = { command: 'node scripts/stale-session-sweep.cjs' };
    const opts = { rcaCheck: async () => null };

    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount(sessionId, 'SD-FAKE', 'Bash', input, opts);
      expect(r.attempts).toBe(0);
      expect(r.rcaResetApplied).toBe(false);
      expect(r.signature).toMatch(/^Bash:/);
    }

    const stateFile = path.join(tmpDir, `retry-state-${sessionId}.json`);
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      expect(state.invocations || {}).toEqual({});
    }
  });

  it('a provably read-only command (no prior outcome) also returns count=0 (Control 2)', async () => {
    const { recordAndCount } = loadFresh();
    const opts = { rcaCheck: async () => null };
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount('qf830-ro', 'SD-FAKE', 'Bash', { command: 'git status' }, opts);
      expect(r.attempts).toBe(0);
    }
  });

  it('returns counts 1,2,3,4 for non-exempt signature (existing behavior preserved — teeth)', async () => {
    const { recordAndCount } = loadFresh();
    const input = { command: 'node scripts/leo-create-sd.js --foo' };
    const opts = { rcaCheck: async () => null };

    const counts = [];
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount('qf830-throttled', 'SD-FAKE', 'Bash', input, opts);
      counts.push(r.attempts);
    }
    expect(counts).toEqual([1, 2, 3, 4]);
  });
});
