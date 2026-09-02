/**
 * QF-20260902-100: adam-advisory.cjs printed "target-role verified: solomon <id>" BEFORE the
 * outbound-gate rationale bar (and the other pre-insert refusal gates) could still refuse the
 * send -- a refused consult read as delivered to a reader grepping the tail for
 * correlation_id|ERROR|refus|PARK, because the old outbound-gate refusal text carried none of
 * those tokens either. WITNESSED twice by Adam on 2026-09-02 (06:3xZ, 08:1xZ).
 *
 * SOURCE PIN, not a live run: main() is not exported (require.main-guarded, per the file's own
 * comment at ~L1275: "NOTHING could assert on the live path"), and mocking a full send through
 * createSupabaseServiceClient/insertCoordinationRow/the four sequential gates is out of this
 * Tier-1 QF's scope. These pin the two structural facts the fix depends on: assertTargetRole's
 * CALL runs after every refusal gate and immediately before the insert, and the outbound-gate
 * refusal text now carries a grep-able token.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'scripts', 'adam-advisory.cjs'), 'utf8');

describe('QF-20260902-100: assertTargetRole runs after every pre-insert refusal gate', () => {
  const assertCallIdx = SRC.indexOf('await assertTargetRole(supabase,');
  const outboundGateExitIdx = SRC.indexOf("ERROR: NOT SENT — rationale bar:");
  const alarmBarExitIdx = SRC.indexOf('2-HYPOTHESIS BAR (SD-REFILL-00XK256L)');
  const preSendHoldIdx = SRC.indexOf('PRE-SEND HOLD: consequential chairman-surface send');
  const insertCallIdx = SRC.indexOf('const { data, error } = await insertCoordinationRow(');

  it('exactly one call site exists (the early call was moved, not duplicated)', () => {
    const count = SRC.split('await assertTargetRole(supabase,').length - 1;
    expect(count).toBe(1);
  });

  it('runs after the outbound-gate (rationale bar) refusal text', () => {
    expect(assertCallIdx).toBeGreaterThan(-1);
    expect(outboundGateExitIdx).toBeGreaterThan(-1);
    expect(assertCallIdx).toBeGreaterThan(outboundGateExitIdx);
  });

  it('runs after the 2-hypothesis alarm-bar refusal text', () => {
    expect(alarmBarExitIdx).toBeGreaterThan(-1);
    expect(assertCallIdx).toBeGreaterThan(alarmBarExitIdx);
  });

  it('runs after the pre-send-consult hold-and-surface refusal text', () => {
    expect(preSendHoldIdx).toBeGreaterThan(-1);
    expect(assertCallIdx).toBeGreaterThan(preSendHoldIdx);
  });

  it('runs immediately before insertCoordinationRow is called (row-adjacent, per the ticket)', () => {
    expect(insertCallIdx).toBeGreaterThan(-1);
    expect(assertCallIdx).toBeLessThan(insertCallIdx);
    // Nothing but the dedup-return and its comment block sits between the two — a loose upper
    // bound on the gap catches a future refusal gate being re-inserted ahead of assertTargetRole
    // without pinning to an exact line count that would break on every unrelated comment edit.
    expect(insertCallIdx - assertCallIdx).toBeLessThan(1200);
  });
});

describe('QF-20260902-100: outbound-gate refusal is grep-able (correlation_id|ERROR|refus|PARK)', () => {
  it('the block-refusal text starts with a stable ERROR token, not just an emoji/prose line', () => {
    expect(SRC).toMatch(/ERROR: NOT SENT — rationale bar: \$\{gate\.reasons\.join/);
  });

  it('the old tokenless "ADAM OUTBOUND GATE blocked this send" wording is gone', () => {
    expect(SRC).not.toMatch(/ADAM OUTBOUND GATE blocked this send/);
  });
});
