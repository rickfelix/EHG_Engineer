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
import { capabilityGapTerm, waveAlignmentTerm, selectAdvisory } from '../../../lib/adam/rationale-bar.js';
// The live consumer of guard_health — a CommonJS CLI, hence createRequire.
import { createRequire } from 'node:module';

const { buildLedgerEntry, formatGuardHealth } = createRequire(import.meta.url)('../../../scripts/adam-opportunity-scan.cjs');

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
  it('CANNOT-JUDGE IS NO-DATA — the classification I got backwards, and what it cost', () => {
    // The first version of this test asserted the opposite: that `empty_aligned_set` meant "the
    // guard HAD its data and found nothing", so it must NOT inflate the no-data count. That is
    // refuted by the file that emits it, twenty lines from the emit — rationale-bar.js:221 "Waves
    // exist but NOTHING is linked => this term cannot judge alignment", and :248 "a term that
    // cannot judge must not judge — the same doctrine as the empty-set case above."
    //
    // The cost was measured on this SD's own flagship instance, not argued: with 8 waves, 0 of 261
    // roadmap_wave_items linked, and 27 evaluations, the fold reported permissiveNoData: 0 and
    // missingInput: null while the no-data branch had fired all 27 times. FR-2 then printed
    // "no-data branch taken 0x" and named nothing — the alarm built to catch instance 3 was blind
    // to instance 3, in the permissive direction, because I asserted a classification instead of
    // reading one. Kept as the test's headline rather than quietly corrected, because it is FR-5's
    // exact failure mode committed inside FR-5's own SD.
    const folded = foldTermResults('waveAlignmentTerm', [
      { active: false, inactive_reason: 'empty_aligned_set' },
      { active: false, inactive_reason: 'zero_waves_or_no_alignment' },
    ]);
    expect(folded.permissiveNoData).toBe(2);
    expect(folded.reasons.empty_aligned_set).toBe(1);
    expect(NO_DATA_REASONS).toContain('empty_aligned_set');
    expect(NO_DATA_REASONS).toContain('id_space_mismatch');
  });

  it('THE FLAGSHIP INSTANCE — 27 empty-linkage passes now name the missing input', () => {
    // The end-to-end shape the correction exists for: what the live roadmap actually produces.
    const results = Array.from({ length: 27 }, () => waveAlignmentTerm({}, { waves: [{ okr_ids: [] }] }));
    expect(results[0].inactive_reason).toBe('empty_aligned_set');

    const verdict = classifyGuard(foldTermResults('waveAlignmentTerm', results), '7d');
    expect(verdict.state).toBe(GUARD_HEALTH.SUSPECT);
    expect(verdict.detail).toContain('no-data branch taken 27x');   // was "0x" before the fix
    expect(verdict.missingInput).toBe('empty_aligned_set');
  });

  it('an UNRECOGNISED reason counts as no-data and is surfaced, never silently dropped', () => {
    // The direction is the decision. If a new emit defaulted to "not no-data" it would silently
    // stop contributing — the permissive answer arriving quietly, which is the defect class itself.
    // Counting it can at worst over-report, which is loud and gets fixed.
    const folded = foldTermResults('newTerm', [{ active: false, inactive_reason: 'some_future_reason' }]);
    expect(folded.permissiveNoData).toBe(1);
    expect(folded.unclassified).toBe(1);
    expect(folded.missingInput).toBe('some_future_reason');
  });

  it('an inherited property is not a supplied one — no forged blocks', () => {
    // `active` is a generic name; a polluted Object.prototype would make every empty result count
    // as a block and drive the alarm to HEALTHY, forging the one verdict that ends enquiry.
    Object.prototype.active = true;      // eslint-disable-line no-extend-native
    try {
      const folded = foldTermResults('g', [{}, {}, {}]);
      expect(folded.blocked).toBe(0);
      expect(classifyGuard(folded, '7d').state).not.toBe(GUARD_HEALTH.HEALTHY);
    } finally {
      delete Object.prototype.active;
    }
  });

  it('the reason lists cannot be emptied from outside — Object.freeze on a Set is not immutability', () => {
    // `Object.freeze(new Set([...]))` reports isFrozen true while .add/.delete/.clear all still
    // work. Clearing it would collapse permissiveNoData to 0 and suppress the AC-4 explanation —
    // turning this SD's remedy into this SD's defect. Frozen ARRAYS are exported instead; the Sets
    // are private.
    expect(Array.isArray(NO_DATA_REASONS)).toBe(true);
    expect(Object.isFrozen(NO_DATA_REASONS)).toBe(true);
    expect(() => { NO_DATA_REASONS.push('x'); }).toThrow();
    const folded = foldTermResults('g', [{ active: false, inactive_reason: 'no_gaps_supplied' }]);
    expect(folded.permissiveNoData).toBe(1);
  });

  it('an ACTIVE term counts as the guard doing something', () => {
    const folded = foldTermResults('g', [{ active: true }, { active: false, inactive_reason: 'no_gaps_supplied' }]);
    expect(folded.observations).toBe(2);
    expect(folded.blocked).toBe(1);
    expect(classifyGuard(folded, '7d').state).toBe(GUARD_HEALTH.HEALTHY);
  });

  it('AC-2 — the consumer is reached from PRODUCTION, not only from this test', () => {
    // The finding that forced this: `foldTermResults` had zero production references. Its link to
    // rationale-bar.js:214/:230/:252 was a DOCBLOCK COMMENT — a reference that looks like wiring and
    // executes nothing, which is the precise trap FR-1 was written to catch. FR-4's own thesis is
    // "an emit with no behavioural consumer does not satisfy this FR"; shipping a consumer nothing
    // imports would have reproduced that thesis one indirection deeper, and a test asserting the
    // consumer in isolation would have passed the whole time.
    //
    // So the assertion is made through selectAdvisory — the real scoring entrypoint, reached in
    // production from scripts/adam-opportunity-scan.cjs:266.
    const out = selectAdvisory([], {});
    expect(out.guard_health).toBeTruthy();
    expect(out.guard_health.summary).toMatch(/^GUARD SUSTAINED-ZERO/);

    // cleared=0 is the case that hid instance 3 for 21 consecutive passes: the terms never ran, so
    // the honest verdict is UNKNOWN — explicitly NOT health.
    const wave = out.guard_health.results.find((r) => r.guard === 'waveAlignmentTerm');
    expect(wave.state).toBe(GUARD_HEALTH.UNKNOWN);
    expect(wave.detail).toMatch(/OBSERVED 0 times/);
    expect(wave.detail).toMatch(/NOT health/);
  });

  it('…and when candidates DO clear, the health line reports what the terms actually did', () => {
    // NEGATIVE CONTROL for the above: if guard_health were hard-coded to the UNKNOWN shape, the
    // previous test would still pass. Here the terms genuinely run, so observations must be > 0.
    const candidate = {
      scope_key: 'harness',
      opportunity: 'op', evidence: 'ev', rationale: 'ra', risk: 'ri', counterfactual: 'cf',
      objective_kr: { objective: 'O-GOV', kr: 'KR', kr_status: 'off_track', off_track_delta: 10 },
      contribution_type: 'enabling',
      confidence: 0.5,
      okr_score: 30,
    };
    // The gap map IS injected in production (gauge-lens readCapabilityGaps); what never arrives is
    // candidate.capability. Passing gaps here mirrors the live call — without it the fixture would
    // exercise a branch production never takes and report a different missing input.
    const out = selectAdvisory([candidate], { capabilityGap: { gaps: { api: 40 } } });
    expect(out.cleared).toBeGreaterThan(0);
    const cap = out.guard_health.results.find((r) => r.guard === 'capabilityGapTerm');
    expect(cap.observations).toBe(out.cleared);
    // No producer sets candidate.capability, so the live reason is named rather than left blank.
    expect(cap.missingInput).toBe('candidate_has_no_capability');
  });

  it('THE 21-PASS CASE — the wave term is observed for every candidate, even when NOTHING clears', () => {
    // Found by mutation, not by reading: deleting `waveTerm` from evaluateCandidate's return left
    // the whole suite green, so the collection point I had just added to fix a coverage gap was
    // itself uncovered. The remedy unguarded, one more time.
    //
    // The scenario is the real one. Every candidate below fails the bar (no counterfactual), so
    // cleared === 0 — which is precisely the state that produced 21 identical ADAM_OK rows. The
    // wave term still RAN 27 times inside evaluateCandidate, and that is what must be reported: if
    // observations were collected only from cleared candidates, the count would be 0 in exactly the
    // case the alarm exists to explain.
    const waveAlignment = { waves: Array.from({ length: 8 }, () => ({ okr_ids: [] })) };  // 8 waves, 0 linked
    const candidates = Array.from({ length: 27 }, (_, i) => ({
      scope_key: 'governance',
      opportunity: `op${i}`, evidence: 'ev', rationale: 'ra', risk: 'ri',   // counterfactual MISSING
      objective_kr: { objective: 'O-GOV', kr: 'KR', kr_status: 'on_track', off_track_delta: null },
      contribution_type: 'enabling', confidence: 0.5, okr_score: 30,
    }));

    const out = selectAdvisory(candidates, { waveAlignment });
    expect(out.cleared).toBe(0);
    expect(out.verdict).toBe('ADAM_OK');

    const wave = out.guard_health.results.find((r) => r.guard === 'waveAlignmentTerm');
    expect(wave.observations, 'the wave term ran 27x but was not observed').toBe(27);
    expect(wave.state).toBe(GUARD_HEALTH.SUSPECT);
    expect(wave.missingInput).toBe('empty_aligned_set');
    expect(wave.detail).toContain('27x');
  });

  it('…and the operator STDOUT line names it too, not just the ledger JSON', () => {
    // formatGuardHealth is the human-facing half. Emitted unconditionally when health exists:
    // a line that appears only when something is wrong makes "measured and fine" and "not measured"
    // the same observation again.
    const line = formatGuardHealth({
      summary: 'GUARD SUSTAINED-ZERO (this advisory pass): healthy=0 suspect=1 inert=0 unknown=1',
      results: [{ guard: 'waveAlignmentTerm', missingInput: 'empty_aligned_set' }, { guard: 'capabilityGapTerm', missingInput: null }],
    });
    expect(line).toContain('suspect=1');
    expect(line).toContain("waveAlignmentTerm could not judge: 'empty_aligned_set'");
    expect(line).not.toContain('capabilityGapTerm could not judge');   // no missingInput, nothing to name
    expect(formatGuardHealth(null)).toBe('');                          // degrades silently, never throws
  });

  it('AC-3 AT THE OPERATOR — the LEDGER ROW differs, not just an internal field', () => {
    // The correction that matters most in this SD. I wired the consumer into selectAdvisory, wrote
    // "the two were indistinguishable from outside — now they are not", and it was FALSE: nothing
    // read `result.guard_health`, so the ledger row and stdout of pass 22 were byte-identical to the
    // 21 before it. Computed-and-discarded is what the emit already did; moving it one level up and
    // calling it consumed is the same defect wearing the remedy's clothes.
    //
    // So the assertion is on the artifact a human actually sees.
    const health = { summary: 'GUARD SUSTAINED-ZERO (this advisory pass): healthy=0 suspect=1 inert=0 unknown=1' };
    const withHealth = buildLedgerEntry({ scope: { scope_key: 'governance' }, verdict: 'ADAM_OK', cleared: 0, flagEnabled: true, guardHealth: health.summary });
    const without = buildLedgerEntry({ scope: { scope_key: 'governance' }, verdict: 'ADAM_OK', cleared: 0, flagEnabled: true });

    expect(withHealth.guard_health).toContain('suspect=1');
    expect(without.guard_health).toBeUndefined();
    // The two rows must not be mistakable for one another once the ts is set aside.
    const strip = ({ ts, ...rest }) => rest;   // eslint-disable-line no-unused-vars
    expect(strip(withHealth)).not.toEqual(strip(without));
  });

  it('degenerate input does not throw and does not invent health', () => {
    for (const bad of [null, undefined, 'x', [null, 3, {}]]) {
      const f = foldTermResults('g', bad);
      expect(() => classifyGuard(f, '7d')).not.toThrow();
    }
    expect(classifyGuard(foldTermResults('g', []), '7d').state).toBe(GUARD_HEALTH.UNKNOWN);
  });
});
