// An idle verdict must say how much of the population it actually SAW.
//
// QF-20260903-977. The measured symptom: a seat parked for ten minutes on "nothing claimable" while 33
// unfenced SDs existed, then claimed one by hand seconds later. The ticket proposed making check-in and
// the claim path share one predicate. They ALREADY share it — classifyDispatchIneligibility, reached by
// both. The real defect is one layer out and different in kind:
//
//   CAP BEFORE PREDICATE. The candidate pool is a union of capped windows (v_sd_next_candidates limit 5,
//   the oldest-N and newest-N draft windows at 10 each, fleet_critical). The eligibility predicate then
//   runs on that SAMPLE. So a zero result means "none of the ones I examined", and the caller cannot
//   tell that from "none exist". A capped sample judged by a CORRECT predicate is indistinguishable
//   from an empty belt.
//
// This fix is REPORTING ONLY and these tests pin exactly that: the note must separate the three states
// a reader actually needs — saw everything and it was empty, saw part of it, and could not tell.
//
// The null-coverage case is asserted deliberately and is the one most likely to be "simplified" later:
// a missing measurement must read LOUDER than a partial one, never as a confident empty. That is the
// same asymmetry as a read stamp on a row nobody surfaced — an unmeasured negative is the defect, so
// the remedy must not be able to produce one.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { formatSamplingNote } = require_('../../../lib/checkin/steps/idle.cjs');

describe('formatSamplingNote — exhaustion vs emptiness vs unknown', () => {
  it('PARTIAL SAMPLE: says UNDETERMINED and names both numbers and the unexamined remainder', () => {
    const note = formatSamplingNote(10, 37);
    expect(note).toMatch(/UNDETERMINED/);
    expect(note).toMatch(/examined 10 of 37/);
    expect(note).toMatch(/27 were never looked at/);
    // The load-bearing half: it must deny the empty-belt reading outright, not merely omit it.
    expect(note).toMatch(/NOT a known-empty belt/);
  });

  it('FULL COVERAGE: only here may it claim the belt is genuinely empty', () => {
    const note = formatSamplingNote(37, 37);
    expect(note).toMatch(/examined all 37/);
    expect(note).toMatch(/genuinely empty/);
    expect(note).not.toMatch(/UNDETERMINED/);
  });

  it('over-coverage (examined exceeds the counted population) still reads as full, not partial', () => {
    // The pool unions sources with different populations, so examined CAN exceed this denominator.
    // That must not render as a negative remainder.
    const note = formatSamplingNote(40, 37);
    expect(note).toMatch(/genuinely empty/);
    expect(note).not.toMatch(/-3/);
  });

  it('COUNT UNAVAILABLE: is LOUDER than a partial sample and never implies empty', () => {
    const note = formatSamplingNote(10, null);
    expect(note).toMatch(/SAMPLE COVERAGE UNDETERMINED/);
    expect(note).toMatch(/NOT evidence of an empty belt/);
    expect(note).not.toMatch(/genuinely empty/);
  });

  it('STEP DID NOT RUN (both absent): stays SILENT rather than narrating a search that never happened', () => {
    // Ordering matters here: the null-total branch must not fire when the pool step was simply absent,
    // or every checkin that skips that step would carry a false coverage warning.
    expect(formatSamplingNote(undefined, undefined)).toBe('');
  });

  it('the empty-population case reads as full coverage, not as unknown', () => {
    expect(formatSamplingNote(0, 0)).toMatch(/examined all 0/);
  });
});

describe('the distinction the QF exists to create', () => {
  it('a partial-sample zero and a full-coverage zero produce DIFFERENT text', () => {
    // Before this fix both rendered as the same bare "nothing claimable", which is precisely why a
    // ten-minute park was indistinguishable from a correct idle.
    const partial = formatSamplingNote(10, 37);
    const complete = formatSamplingNote(37, 37);
    expect(partial).not.toBe(complete);
  });

  it('every branch that is not full coverage refuses the word "genuinely empty"', () => {
    for (const note of [formatSamplingNote(10, 37), formatSamplingNote(10, null)]) {
      expect(note).not.toMatch(/genuinely empty/);
    }
  });
});
