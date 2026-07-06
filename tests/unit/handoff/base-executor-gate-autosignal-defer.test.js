/**
 * QF-20260705-788: WIRE_CHECK_GATE auto-emit fired on the 2x-fail crossing even when the
 * SAME handoff subsequently passed on its final retry within the same loop (GATE_MAX_RETRIES=2)
 * — two benign HIGH stuck signals landed (2026-07-05, -C 04:40Z / -E 06:44Z) for a self-healing
 * gate, drowning genuine signals.
 *
 * Fix: capture the shouldEmitGateAutoSignal() crossing decision, but only actually spawn
 * worker-signal.cjs AFTER the retry loop exits, gated on the FINAL gateResults.passed still
 * being false. Source-shape test (mirrors the marker-race-retry precedent) — full integration
 * is covered by the handoff system tests.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readSource(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

describe('BaseExecutor gate-2x auto-signal deferred emission (QF-20260705-788)', () => {
  const src = readSource('scripts/modules/handoff/executors/BaseExecutor.js');

  it('captures the crossing decision into a pending variable instead of spawning inline', () => {
    expect(src).toMatch(/_pendingGateAutoSignalArgs\s*=\s*\{/);
  });

  it('the retry-loop crossing site no longer spawns worker-signal.cjs directly', () => {
    const loopStart = src.indexOf('Retry eligible — increment and loop');
    const loopSection = src.slice(loopStart, loopStart + 1500);
    expect(loopSection).not.toMatch(/spawn\(/);
  });

  it('the actual spawn happens after the loop, gated on the final gate outcome', () => {
    const afterLoopIdx = src.indexOf('_pendingGateAutoSignalArgs && !gateResults.passed');
    expect(afterLoopIdx).toBeGreaterThan(-1);
    const afterLoopSection = src.slice(afterLoopIdx, afterLoopIdx + 600);
    expect(afterLoopSection).toMatch(/spawn\(/);
    expect(afterLoopSection).toContain('worker-signal.cjs');
  });

  it('references the QF for traceability', () => {
    expect(src).toContain('QF-20260705-788');
  });
});
