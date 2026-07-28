/**
 * FR-4 — an emit with no behavioural consumer does NOT satisfy this FR.
 * SD-LEO-INFRA-PURE-GUARD-UNWIRED-001.
 *
 * FR-4 was demoted from first to last on this SD's own evidence: instance 3 already emitted
 * inactive_reason and detectability did not change, because nothing read it. So the tests that
 * matter here are the ones proving the consumer's OUTPUT DIFFERS when the signal is present. A test
 * that only asserted "the reason is carried through" would pass on a pure pass-through and satisfy
 * the letter of the FR while leaving the blindness exactly where it was.
 */
import { describe, it, expect } from 'vitest';
import { foldTermResults, NO_DATA_REASONS } from '../../../lib/governance/inactive-reason-consumer.js';
import { classifyGuard, GUARD_HEALTH } from '../../../lib/governance/guard-sustained-zero.js';
import { capabilityGapTerm } from '../../../lib/adam/rationale-bar.js';

describe('AC-4 — capabilityGapTerm now says why, like its sibling', () => {
  // Signature is capabilityGapTerm(candidate, capabilityGap) — the CANDIDATE carries `capability`,
  // the gap map arrives as capabilityGap.gaps. I had these backwards on the first write and the
  // tests said so immediately, which is the argument for exercising the real function rather than
  // asserting against a remembered shape.
  it('emits a distinct inactive_reason on each no-data branch', () => {
    // Four branches, four reasons. A single generic "inactive" would be no better than silence,
    // because the point is to name WHICH input was absent.
    expect(capabilityGapTerm({}, null).inactive_reason).toBe('no_gaps_supplied');
    expect(capabilityGapTerm({}, { gaps: { api: 40 } }).inactive_reason).toBe('candidate_has_no_capability');
    expect(capabilityGapTerm({ capability: 'y' }, { gaps: { api: 40 } }).inactive_reason).toBe('capability_absent_from_gap_map');
    expect(capabilityGapTerm({ capability: 'y' }, { gaps: { y: 'nope' } }).inactive_reason).toBe('gap_value_not_a_number');
  });

  it('THE LIVE CASE — no producer sets candidate.capability, so this is what actually fires', () => {
    // The term is permanently inactive for a reason no reader could previously see.
    const r = capabilityGapTerm({ sd_key: 'SD-X' }, { gaps: { api: 40 } });
    expect(r.active).toBe(false);
    expect(r.inactive_reason).toBe('candidate_has_no_capability');
  });

  it('NEGATIVE CONTROL — a real gap still activates, with no inactive_reason', () => {
    // Without this, "always inactive with a reason" would satisfy everything above while breaking
    // the term outright.
    const r = capabilityGapTerm({ capability: 'api' }, { gaps: { api: 40 } });
    expect(r.active).toBe(true);
    expect(r.multiplier).toBeGreaterThan(1.0);
    expect(r.inactive_reason).toBeUndefined();
  });
});

describe('AC-3 — the consumer CHANGES BEHAVIOUR when the signal is present', () => {
  // Real term output, not a hand-built fixture — a fixture would keep passing if the emit regressed.
  const twelveInactive = Array.from({ length: 12 }, () =>
    capabilityGapTerm({ sd_key: 'SD-X' }, { gaps: { api: 40 } }));

  it('with the signal, the alarm names the missing input instead of just flagging a zero', () => {
    const folded = foldTermResults('capabilityGapTerm', twelveInactive);
    expect(folded.permissiveNoData).toBe(12);
    expect(folded.missingInput).toBe('candidate_has_no_capability');

    const verdict = classifyGuard(folded, '7d');
    expect(verdict.state).toBe(GUARD_HEALTH.SUSPECT);
    expect(verdict.detail).toContain('candidate_has_no_capability');
    expect(verdict.detail).toContain('12x');
  });

  it('THE DISCRIMINATOR — strip the signal and the SAME batch yields a less actionable verdict', () => {
    // This is the assertion that makes FR-4 more than a log line. Identical inputs, identical
    // counts; the only difference is whether inactive_reason was present, and the operator-facing
    // output changes because of it. A pass-through consumer would fail here.
    const stripped = twelveInactive.map((r) => { const c = { ...r }; delete c.inactive_reason; return c; });
    const withSignal = classifyGuard(foldTermResults('g', twelveInactive), '7d');
    const without = classifyGuard(foldTermResults('g', stripped), '7d');

    expect(withSignal.state).toBe(without.state);            // same verdict…
    expect(withSignal.detail).not.toBe(without.detail);      // …different actionability
    expect(withSignal.missingInput).toBe('candidate_has_no_capability');
    expect(without.missingInput).toBeNull();
    expect(without.detail).not.toMatch(/Missing input/);
  });
});

describe('a no-data reason and an evaluated-and-declined reason are not the same finding', () => {
  it('only no-data reasons count as permissive-no-data', () => {
    // empty_aligned_set means the guard HAD its data and found nothing — chasing "why didn't it
    // fire" there is wasted work, so it must not inflate the no-data count.
    const folded = foldTermResults('waveAlignmentTerm', [
      { active: false, inactive_reason: 'empty_aligned_set' },
      { active: false, inactive_reason: 'zero_waves_or_no_alignment' },
    ]);
    expect(folded.permissiveNoData).toBe(1);
    expect(folded.missingInput).toBe('zero_waves_or_no_alignment');
    expect(folded.reasons.empty_aligned_set).toBe(1);
    expect(NO_DATA_REASONS.has('empty_aligned_set')).toBe(false);
  });

  it('an ACTIVE term counts as the guard doing something', () => {
    const folded = foldTermResults('g', [{ active: true }, { active: false, inactive_reason: 'no_gaps_supplied' }]);
    expect(folded.observations).toBe(2);
    expect(folded.blocked).toBe(1);
    expect(classifyGuard(folded, '7d').state).toBe(GUARD_HEALTH.HEALTHY);
  });

  it('degenerate input does not throw and does not invent health', () => {
    for (const bad of [null, undefined, 'x', [null, 3, {}]]) {
      const f = foldTermResults('g', bad);
      expect(() => classifyGuard(f, '7d')).not.toThrow();
    }
    expect(classifyGuard(foldTermResults('g', []), '7d').state).toBe(GUARD_HEALTH.UNKNOWN);
  });
});
