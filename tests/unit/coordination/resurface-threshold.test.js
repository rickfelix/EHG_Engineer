/**
 * QF-20260725-342 — every invoker of solomon-ledger-pending-resurface.cjs must use the SAME
 * threshold.
 *
 * THE DEFECT: the 72h threshold reached only 1 of 3 invocation sites. The GHA cron passed
 * --threshold-hours 72; scripts/coordinator-quiet-tick.mjs and scripts/coordinator-startup-check.mjs
 * passed nothing and silently ran at the script's 24h DEFAULT. Proven at runtime — 34 resurface
 * rows in one batch at 20:35 on 2026-07-25, when the cron fires only at :13/:43 and a 72h
 * threshold has a crossing set of zero.
 *
 * WHY THESE TESTS ARE SOURCE-SCANS RATHER THAN BEHAVIOUR TESTS: the failure is a MISSING
 * ARGUMENT at a call site, which no unit test of the script itself can observe — the script
 * behaves correctly for whatever threshold it is given. The only place the defect is visible is
 * the invocation. So these assert the wiring, which is exactly where the bug lived.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { OPERATING_THRESHOLD_HOURS, thresholdArgs } = require(join(REPO, 'lib/coordination/resurface-threshold.cjs'));

const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

describe('QF-20260725-342 — resurface threshold reaches EVERY invocation site', () => {
  it('exposes a single numeric operating threshold and a CLI-args helper', () => {
    expect(Number.isFinite(OPERATING_THRESHOLD_HOURS)).toBe(true);
    expect(OPERATING_THRESHOLD_HOURS).toBeGreaterThan(0);
    expect(thresholdArgs()).toEqual(['--threshold-hours', String(OPERATING_THRESHOLD_HOURS)]);
  });

  it('the operating threshold is NOT the script default (otherwise the flag proves nothing)', () => {
    // If these ever coincide, every assertion below passes vacuously — a missing flag would be
    // indistinguishable from a present one. Guard the guard.
    const { DEFAULT_THRESHOLD_HOURS } = require(join(REPO, 'scripts/solomon-ledger-pending-resurface.cjs'));
    expect(OPERATING_THRESHOLD_HOURS).not.toBe(DEFAULT_THRESHOLD_HOURS);
  });

  it('coordinator-quiet-tick sources the threshold from the shared constant, not a literal', () => {
    const src = read('scripts/coordinator-quiet-tick.mjs');
    expect(src).toContain('../lib/coordination/resurface-threshold.cjs');
    const line = src.split('\n').find((l) => l.includes("script: 'solomon-ledger-pending-resurface.cjs'"));
    expect(line).toBeTruthy();
    expect(line).toContain('...thresholdArgs()');
  });

  it('coordinator-startup-check builds its prompt from the shared constant', () => {
    const src = read('scripts/coordinator-startup-check.mjs');
    expect(src).toContain('../lib/coordination/resurface-threshold.cjs');
    const line = src.split('\n').find((l) => l.includes('prompt:') && l.includes('solomon-ledger-pending-resurface.cjs'));
    expect(line).toBeTruthy();
    expect(line).toContain('${OPERATING_THRESHOLD_HOURS}');
  });

  it('the GHA workflow literal MATCHES the shared constant (it cannot import JS, so pin it)', () => {
    const yml = read('.github/workflows/solomon-ledger-resurface-cron.yml');
    const m = yml.match(/solomon-ledger-pending-resurface\.cjs\s+--threshold-hours\s+(\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBe(OPERATING_THRESHOLD_HOURS);
  });

  it('NO invoker of the resurface script omits the threshold (catches a future 4th site)', () => {
    // The generalised guard: the defect was not "two sites were wrong", it was "a new call site
    // silently inherits the default". Any invocation that names the script must also carry a
    // threshold — via the shared constant, the helper, or the pinned YAML literal.
    const files = [
      'scripts/coordinator-quiet-tick.mjs',
      'scripts/coordinator-startup-check.mjs',
      '.github/workflows/solomon-ledger-resurface-cron.yml',
    ];
    for (const f of files) {
      for (const line of read(f).split('\n')) {
        // An INVOCATION is a shell command line or an execFile args array — NOT a registry
        // metadata field like `script:`, which merely names the file and is paired with a
        // `prompt:` on another line that carries the actual command.
        const invokes = line.includes('solomon-ledger-pending-resurface.cjs')
          && (line.includes('node scripts/') || line.includes('args:'));
        if (!invokes) continue;
        const carriesThreshold = line.includes('thresholdArgs()')
          || line.includes('OPERATING_THRESHOLD_HOURS')
          || /--threshold-hours\s+\d+/.test(line);
        expect(carriesThreshold, `${f}: invocation without a threshold -> silently uses the 24h default:\n${line.trim()}`).toBe(true);
      }
    }
  });
});
