/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-1) — the signal lane's 5-value caller-facing disposition
 * vocabulary must map onto receipt-ledger.cjs's DISPOSITIONS with NO silent drop.
 *
 * *** buildReceipt() RETURNS NULL FOR THE WHOLE RECEIPT ON AN UNMAPPED VALUE, NOT A DROPPED FIELD. ***
 * TESTING's PLAN-TO-EXEC review (sub_agent_execution_results fd168314) corrected the original
 * scoping of this failure mode: an unmapped disposition doesn't lose one field, it loses the
 * signal from BOTH the answered-rate numerator and denominator (acknowledged_at gets stamped,
 * zero ledger rows are written). TS-3 asserts non-null BEFORE any field-level check for exactly
 * this reason — a null-check-then-throw ordering bug would otherwise mask this as a TypeError.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { DISPOSITIONS, SIGNAL_LANE_DISPOSITIONS, resolveSignalDisposition, buildReceipt } =
  require_('../../../lib/coordination/receipt-ledger.cjs');

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-1: resolveSignalDisposition (TS-3)', () => {
  it('all 5 signal-lane values resolve to a non-null ledger disposition', () => {
    for (const value of Object.keys(SIGNAL_LANE_DISPOSITIONS)) {
      const extra = { reason: 'r', trigger: 't', duplicateOf: 'sig-other' };
      const resolved = resolveSignalDisposition(value, extra);
      expect(resolved.ok, `disposition '${value}' must resolve`).toBe(true);
      expect(resolved.ledgerDisposition, `disposition '${value}' must map to a real DISPOSITIONS value`)
        .toEqual(expect.any(String));
      expect(Object.values(DISPOSITIONS)).toContain(resolved.ledgerDisposition);
    }
    // MUTATION: add a 6th signal-lane value with no mapping -> loop still passes silently unless
    // SIGNAL_LANE_DISPOSITIONS itself is wrong, which is exactly what this test pins.
  });

  it('the resulting receipt is non-null for every signal-lane value (buildReceipt integration)', () => {
    for (const value of Object.keys(SIGNAL_LANE_DISPOSITIONS)) {
      const resolved = resolveSignalDisposition(value, { reason: 'r', trigger: 't', duplicateOf: 'sig-other' });
      const receipt = buildReceipt({
        coordinationId: 'sig-1',
        lane: 'signal',
        state: 'disposed',
        disposition: resolved.ledgerDisposition,
      });
      // Assert non-null BEFORE any field check -- a null-check-then-throw ordering bug would mask
      // an unmapped value as a TypeError rather than a failed assertion (TESTING's correction).
      expect(receipt, `disposition '${value}' must produce a receipt object, not null`).not.toBeNull();
      expect(receipt.disposition).toBe(resolved.ledgerDisposition);
    }
  });

  it('rejected-with-reason requires a non-empty reason (mandatory linkage)', () => {
    expect(resolveSignalDisposition('rejected-with-reason', {}).ok).toBe(false);
    expect(resolveSignalDisposition('rejected-with-reason', { reason: '  ' }).ok).toBe(false);
    expect(resolveSignalDisposition('rejected-with-reason', { reason: 'stale premise' }).ok).toBe(true);
    // MUTATION: drop the linkage check -> a reason-less rejection resolves ok:true, fails.
  });

  it('deferred-with-trigger requires a non-empty trigger (mandatory linkage)', () => {
    expect(resolveSignalDisposition('deferred-with-trigger', {}).ok).toBe(false);
    expect(resolveSignalDisposition('deferred-with-trigger', { trigger: 'next EOD sweep' }).ok).toBe(true);
  });

  it('duplicate-of requires a non-empty duplicateOf id (mandatory linkage)', () => {
    expect(resolveSignalDisposition('duplicate-of', {}).ok).toBe(false);
    expect(resolveSignalDisposition('duplicate-of', { duplicateOf: 'sig-abc' }).ok).toBe(true);
  });

  it('actioned and promoted require no extra linkage', () => {
    expect(resolveSignalDisposition('actioned', {}).ok).toBe(true);
    expect(resolveSignalDisposition('promoted', {}).ok).toBe(true);
  });

  it('rejects an unknown signal-lane disposition value outright', () => {
    const resolved = resolveSignalDisposition('made-up-value', {});
    expect(resolved.ok).toBe(false);
    expect(resolved.error).toMatch(/unknown signal-lane disposition/);
  });

  it('carries the mandatory-linkage field into receipt metadata for traceability', () => {
    const resolved = resolveSignalDisposition('rejected-with-reason', { reason: 'stale premise' });
    expect(resolved.metadata).toEqual({ reason: 'stale premise' });
  });
});
