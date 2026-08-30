// QF-20260830-275 — the attribution-aware detector. A repeat whose gap from the signature's
// prior occurrence is shorter than the delay this session last armed via ScheduleWakeup must
// NOT advance `attempts` (the field that drives the hard-block / auto-signal thresholds) — it
// is still recorded for audit/pruning (`reinvocationCausedCount`). A genuine same-invocation
// retry loop (fast repeats, or no arm on record at all) must still accumulate normally — teeth
// preserved, per the QF's two-sided fix contract.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const RSM_PATH = path.resolve(__dirname, '../retry-state-manager.cjs');
const MARKER_PATH = path.resolve(__dirname, '../../../lib/hooks/wake-arm-marker.cjs');

function loadFresh() {
  delete require.cache[require.resolve(RSM_PATH)];
  delete require.cache[require.resolve(MARKER_PATH)];
  return { rsm: require(RSM_PATH), marker: require(MARKER_PATH) };
}

const NO_RCA = { rcaCheck: async () => null };

describe('retry-state-manager — reinvocation-caused repeats do not advance attempts', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsm-reinv-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('a repeat arriving sooner than the armed delay is excluded from attempts (over-firing shape)', async () => {
    const { rsm, marker } = loadFresh();
    const cmd = 'node scripts/complete-quick-fix.js QF-20260830-275';
    const t0 = 1_000_000;
    marker.writeWakeArmMarker('sess-a', 300, t0); // armed a 300s wakeup

    const r1 = await rsm.recordAndCount('sess-a', 'SD-X', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 });
    expect(r1.attempts).toBe(1);

    // Re-invoked 90s later — far sooner than the 300s arm intended.
    const r2 = await rsm.recordAndCount('sess-a', 'SD-X', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 + 90_000 });
    expect(r2.attempts).toBe(1); // NOT 2 — excluded as reinvocation_caused
    expect(r2.reinvocationCausedCount).toBe(1);

    // A third re-invocation, same shape, still does not cross the hard-block threshold.
    const r3 = await rsm.recordAndCount('sess-a', 'SD-X', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 + 180_000 });
    expect(r3.attempts).toBe(1);
    expect(r3.reinvocationCausedCount).toBe(2);
  });

  it('CONTROL: a genuine same-invocation retry loop still accumulates and can hard-block (teeth preserved)', async () => {
    const { rsm, marker } = loadFresh();
    const cmd = 'npm run some-flaky-script';
    const t0 = 2_000_000;
    marker.writeWakeArmMarker('sess-b', 300, t0); // an arm exists, but the repeats are FAST (same turn)

    const r1 = await rsm.recordAndCount('sess-b', 'SD-Y', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 });
    const r2 = await rsm.recordAndCount('sess-b', 'SD-Y', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 + 2_000 });
    const r3 = await rsm.recordAndCount('sess-b', 'SD-Y', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 + 4_000 });
    expect([r1.attempts, r2.attempts, r3.attempts]).toEqual([1, 2, 3]);
    expect(r3.reinvocationCausedCount).toBe(0);
  });

  it('CONTROL: with no wake-arm marker on record, repeats accumulate normally (back-compat, fail-closed)', async () => {
    const { rsm } = loadFresh();
    const cmd = 'node scripts/flaky.js';
    const t0 = 3_000_000;

    const r1 = await rsm.recordAndCount('sess-c', 'SD-Z', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 });
    const r2 = await rsm.recordAndCount('sess-c', 'SD-Z', 'Bash', { command: cmd }, { ...NO_RCA, now: t0 + 90_000 });
    expect([r1.attempts, r2.attempts]).toEqual([1, 2]);
  });
});
