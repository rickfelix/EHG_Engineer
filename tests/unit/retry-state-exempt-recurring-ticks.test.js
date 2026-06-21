/**
 * SD-FDBK-INFRA-RCA-TIERED-ENFORCEMENT-001 — exempt the Adam inbox drain + worker check-in ticks.
 *
 * These two SCHEDULED, idempotent, succeeding commands tripped the RCA tiered-enforcement
 * 3-strikes block in a busy session: the exit-0 succeeding-poll exemption keys on the single
 * per-session last-outcome file, which interleaved loops clobber, so a recurring command rarely
 * matches its own prior outcome. Fix: add both to EXEMPT_PATTERNS (precedent: the coordinator crons).
 * isExempt short-circuits recordAndCount BEFORE the counter accrues, so the exemption holds even
 * under interleaving (no reliance on lastOutcome). A genuine repeated-failure command stays gated.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { isExempt, recordAndCount } = require('../../scripts/hooks/retry-state-manager.cjs');

describe('isExempt — new recurring-tick exemptions (FR-1/FR-2/FR-3)', () => {
  it('FR-1: exempts the Adam inbox drain tick', () => {
    expect(isExempt('node scripts/adam-advisory.cjs inbox')).toBe(true);
    expect(isExempt('node scripts/adam-advisory.cjs inbox --verbose')).toBe(true);
    expect(isExempt('node scripts\\adam-advisory.cjs inbox')).toBe(true); // windows path sep
  });

  it('FR-1 scope: adam-advisory WITHOUT the inbox subcommand is NOT exempt (other subcommands stay gated)', () => {
    expect(isExempt('node scripts/adam-advisory.cjs advisory --send')).toBe(false);
    expect(isExempt('node scripts/adam-advisory.cjs')).toBe(false);
  });

  it('FR-2: exempts the /loop worker check-in tick', () => {
    expect(isExempt('node scripts/worker-checkin.cjs')).toBe(true);
    expect(isExempt('node scripts\\worker-checkin.cjs')).toBe(true);
  });

  it('FR-3: a genuine repeated-failure command is NOT exempt (anti-stuck-retry guard preserved)', () => {
    expect(isExempt('node scripts/build.js')).toBe(false);
    expect(isExempt('npx vitest run tests/unit/foo.test.js')).toBe(false);
    expect(isExempt('node scripts/handoff.js execute EXEC-TO-PLAN SD-X-001')).toBe(false);
  });

  it('is null-safe', () => {
    expect(isExempt(undefined)).toBe(false);
    expect(isExempt(null)).toBe(false);
    expect(isExempt('')).toBe(false);
  });
});

describe('recordAndCount honors the new exemptions even under interleaving (no lastOutcome reliance)', () => {
  let tmpDir;
  const SESSION = 'sess-exempt-ticks';
  const noReset = async () => null;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-exempt-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.LEO_RETRY_STATE_DIR;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('the Adam inbox tick never accumulates even with NO lastOutcome (the clobbered-file case)', async () => {
    const cmd = 'node scripts/adam-advisory.cjs inbox';
    for (let i = 0; i < 4; i++) {
      // No lastOutcome at all → the exit-0 exemption could not fire; the allowlist must.
      const r = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 1000 + i * 1000 });
      expect(r.attempts).toBe(0);
    }
  });

  it('the worker check-in tick never accumulates across repeats', async () => {
    const cmd = 'node scripts/worker-checkin.cjs';
    const r1 = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 1000 });
    const r3 = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 3000 });
    expect(r1.attempts).toBe(0);
    expect(r3.attempts).toBe(0);
  });

  it('a non-exempt failing command STILL reaches the 3-strikes threshold (guard preserved)', async () => {
    const cmd = 'node scripts/build.js';
    const r1 = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 1000 });
    const r2 = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 2000 });
    const r3 = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 3000 });
    expect(r1.attempts).toBe(1);
    expect(r2.attempts).toBe(2);
    expect(r3.attempts).toBe(3);
  });
});
