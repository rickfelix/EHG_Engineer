// SD-LEO-FIX-EXEMPT-REGISTERED-RECURRING-001 — config-driven recurring-tick exemptions.
// Pins the four safety properties of recurring-tick-exemptions.json loading:
//   (1) seeded registered ticks (adam-quiet-tick, adam-startup-check) are exempt end-to-end
//       (isExempt true; recordAndCount never accrues across repeated successful runs);
//   (2) BLOCKING loader validation — bare prefixes / bare extensions / paths / regex
//       metachars can never compile (an entry exempts exactly one physical script);
//   (3) fail-safe NARROWS, never widens — missing/corrupt config leaves builtins working
//       and config-seeded entries counting again; no throw escapes the loader;
//   (4) the 3-strikes teeth survive for failing non-allowlisted commands.
// The config path is deliberately __dirname-fixed (NOT LEO_RETRY_STATE_DIR-overridable),
// so these tests back up and restore the real tracked file around each variation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const MODULE_PATH = path.resolve(__dirname, '../retry-state-manager.cjs');
const CONFIG_PATH = path.resolve(__dirname, '../recurring-tick-exemptions.json');

function loadFresh() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

const NO_RCA = { rcaCheck: async () => null };
const SESSION = 'tick-exemptions-test-session';

let originalConfig;
let tmpStateDir;

beforeEach(() => {
  originalConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
  tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-state-'));
  process.env.LEO_RETRY_STATE_DIR = tmpStateDir;
});

afterEach(() => {
  fs.writeFileSync(CONFIG_PATH, originalConfig);
  delete process.env.LEO_RETRY_STATE_DIR;
  try { fs.rmSync(tmpStateDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  loadFresh(); // leave the module cache holding the restored real config
});

describe('(1) seeded registered ticks are exempt end-to-end', () => {
  it('isExempt covers both seeded scripts incl. flag variants and windows path separators', () => {
    const { isExempt } = loadFresh();
    for (const cmd of [
      'node scripts/adam-quiet-tick.mjs',
      'node scripts/adam-quiet-tick.mjs --json',
      'node scripts\\adam-quiet-tick.mjs --dry-run',
      'node scripts/adam-startup-check.mjs',
      'node scripts/adam-startup-check.mjs --armed "tick"',
    ]) {
      expect(isExempt(cmd), cmd).toBe(true);
    }
  });

  it('4 successful same-target runs within 10 minutes never accrue (no warn/block/auto-signal input)', async () => {
    const { recordAndCount } = loadFresh();
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      const res = await recordAndCount(SESSION, null, 'Bash',
        { command: 'node scripts/adam-quiet-tick.mjs' },
        { ...NO_RCA, now: now + i * 60_000 });
      expect(res.attempts).toBe(0);
    }
  });
});

describe('(2) BLOCKING loader validation — over-match rejection matrix', () => {
  it('bare prefixes, bare extensions, short tokens, paths, and metachars never compile', () => {
    const evil = ['adam', '.mjs', 'a', '../evil.mjs', 'scripts/adam-quiet-tick.mjs', 'ad*am.mjs', 'adam|.mjs'];
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
      exempt_scripts: evil.map((script) => ({ script, reason: 'over-match attempt' })),
    }));
    const { isExempt } = loadFresh();
    // The over-match probe: were a bare "adam" entry compiled, adam-advisory's NON-idempotent
    // answer path would silently lose its 3-strikes teeth. It must stay gated.
    expect(isExempt('node scripts/adam-advisory.cjs advisory --send')).toBe(false);
    // And the malformed entries must not have produced working exemptions for the real ticks.
    expect(isExempt('node scripts/adam-quiet-tick.mjs')).toBe(false);
    // Builtins are unaffected by config contents.
    expect(isExempt('node scripts/coordinator-quiet-tick.mjs')).toBe(true);
  });

  it('an entry without a reason is rejected; the 32-entry cap holds', () => {
    const entries = [];
    for (let i = 0; i < 33; i++) entries.push({ script: `tick-${i}.mjs`, reason: `cadence ${i}` });
    entries.push({ script: 'no-reason-tick.mjs' });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ exempt_scripts: entries }));
    const { isExempt } = loadFresh();
    expect(isExempt('node scripts/tick-0.mjs')).toBe(true);
    expect(isExempt('node scripts/tick-31.mjs')).toBe(true);
    expect(isExempt('node scripts/tick-32.mjs')).toBe(false); // beyond the cap
    expect(isExempt('node scripts/no-reason-tick.mjs')).toBe(false);
  });
});

describe('(3) fail-safe narrows, never widens', () => {
  it('corrupt JSON: builtins hold, seeded entries count again, loader never throws', async () => {
    fs.writeFileSync(CONFIG_PATH, '{ this is not json');
    const { isExempt, recordAndCount } = loadFresh();
    expect(isExempt('node scripts/coordinator-quiet-tick.mjs')).toBe(true); // builtin unaffected
    expect(isExempt('node scripts/adam-quiet-tick.mjs')).toBe(false);       // narrowed, not widened
    const now = Date.now();
    let last;
    for (let i = 0; i < 3; i++) {
      last = await recordAndCount(SESSION, null, 'Bash',
        { command: 'node scripts/adam-quiet-tick.mjs' },
        { ...NO_RCA, now: now + i * 60_000 });
    }
    expect(last.attempts).toBe(3); // with config lost, the tick counts like any command
  });

  it('missing file behaves the same as corrupt (builtin-only)', () => {
    fs.rmSync(CONFIG_PATH);
    const { isExempt } = loadFresh();
    expect(isExempt('node scripts/coordinator-quiet-tick.mjs')).toBe(true);
    expect(isExempt('node scripts/adam-quiet-tick.mjs')).toBe(false);
  });
});

describe('(4) teeth preserved for non-allowlisted repeats', () => {
  it('3 same-target invocations of an unregistered script reach the block threshold', async () => {
    const { recordAndCount } = loadFresh();
    const now = Date.now();
    let last;
    for (let i = 0; i < 3; i++) {
      last = await recordAndCount(SESSION, null, 'Bash',
        { command: 'node scripts/some-random-task.mjs --retry' },
        { ...NO_RCA, now: now + i * 60_000 });
    }
    expect(last.attempts).toBe(3);
  });
});
