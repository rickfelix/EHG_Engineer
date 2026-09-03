// QF-20260903-909: SD metadata enrichment was overwriting the prior author's work.
//
// Measured live on SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D: one seat's success_criteria were replaced
// by another's, and identifying who did it took a fleet broadcast plus a correction that first
// named the WRONG seat. `metadata.lead_enrichment` is a scalar object, so the last writer wins and
// the victim is unrecoverable from the row.
//
// The centrepiece is the "count is not enough" block. The rule the coordinator adopted fleet-wide:
//   assert the delta you INTENDED is the delta you GOT — a count catches an interleaved write,
//   a set-difference catches a clobber that PRESERVES the count.
// So these tests do not merely assert the strong check works; they first demonstrate that the
// WEAK check everyone reaches for is blind to the exact defect that occurred.

import { describe, it, expect } from 'vitest';
import { appendEnrichmentEntry, setDifference, assertIntendedDelta } from '../../../lib/sd/enrichment-log.js';

describe('appendEnrichmentEntry — append, never overwrite', () => {
  it('preserves an earlier author when a second one enriches', () => {
    const first = appendEnrichmentEntry({}, { by: 'Bravo', summary: 'scoped child A' });
    const second = appendEnrichmentEntry(first, { by: 'Alpha-2', summary: 'reworked criteria' });

    expect(second.enrichment_log).toHaveLength(2);
    expect(second.enrichment_log.map((e) => e.by)).toEqual(['Bravo', 'Alpha-2']);
  });

  it('makes the clobber victim identifiable — the thing the live incident could not do', () => {
    const after = ['Bravo', 'Alpha-2', 'Charlie'].reduce(
      (meta, by) => appendEnrichmentEntry(meta, { by, summary: `${by} wrote something` }),
      {}
    );
    // From the row alone, every author and their order is recoverable.
    expect(after.enrichment_log.map((e) => e.by)).toEqual(['Bravo', 'Alpha-2', 'Charlie']);
    expect(after.enrichment_log.every((e) => typeof e.at === 'string' && e.at.length > 0)).toBe(true);
  });

  it('does NOT mutate the caller metadata', () => {
    const original = { enrichment_log: [{ by: 'Bravo' }], other: 'untouched' };
    const snapshot = JSON.parse(JSON.stringify(original));
    appendEnrichmentEntry(original, { by: 'Alpha-2' });
    expect(original).toEqual(snapshot);
  });

  it('preserves lead_enrichment and every unrelated metadata key', () => {
    // Deliberate: existing readers still depend on metadata.lead_enrichment (several one-off
    // scripts read lead_enrichment.prior_success_criteria). Removing it to tidy the shape would
    // trade one silent failure for another.
    const before = { lead_enrichment: { by: 'Bravo' }, requires_human_action: true, capa_sequence_after: 'X' };
    const after = appendEnrichmentEntry(before, { by: 'Alpha-2' });
    expect(after.lead_enrichment).toEqual({ by: 'Bravo' });
    expect(after.requires_human_action).toBe(true);
    expect(after.capa_sequence_after).toBe('X');
  });

  it('tolerates metadata with no enrichment_log, and a null/undefined metadata', () => {
    expect(appendEnrichmentEntry({}, { by: 'X' }).enrichment_log).toHaveLength(1);
    expect(appendEnrichmentEntry(undefined, { by: 'X' }).enrichment_log).toHaveLength(1);
  });

  it('replaces a non-array enrichment_log rather than throwing on it', () => {
    const after = appendEnrichmentEntry({ enrichment_log: 'corrupted' }, { by: 'X' });
    expect(Array.isArray(after.enrichment_log)).toBe(true);
    expect(after.enrichment_log).toHaveLength(1);
  });

  it('REFUSES an unattributed entry — an anonymous log cannot identify a clobber', () => {
    expect(() => appendEnrichmentEntry({}, { summary: 'no author' })).toThrow(/entry\.by is required/);
    expect(() => appendEnrichmentEntry({}, { by: '   ' })).toThrow(/entry\.by is required/);
  });

  it('refuses a non-object entry', () => {
    expect(() => appendEnrichmentEntry({}, 'nope')).toThrow(/must be an object/);
    expect(() => appendEnrichmentEntry({}, ['nope'])).toThrow(/must be an object/);
  });
});

describe('A COUNT IS NOT ENOUGH — the weak assertion is blind to the real defect', () => {
  // The live clobber replaced criteria with a DIFFERENT set OF THE SAME SIZE.
  const before = ['criterion A', 'criterion B', 'criterion C'];
  const clobbered = ['criterion X', 'criterion Y', 'criterion Z'];

  it('demonstrates the count check PASSES on the clobber (this is the bug, asserted)', () => {
    // This is not a test of our code — it is a test of the reasoning everyone applies by default,
    // pinned so nobody "simplifies" assertIntendedDelta down to a length comparison later.
    expect(clobbered.length).toBe(before.length); // the weak check is satisfied
    expect(clobbered).not.toEqual(before);         // yet everything was replaced
  });

  it('the set-difference CATCHES what the count missed', () => {
    const diff = setDifference(before, clobbered);
    expect(diff.count_before).toBe(diff.count_after); // counts identical...
    expect(diff.removed).toHaveLength(3);            // ...but three elements are gone
    expect(diff.added).toHaveLength(3);
    expect(diff.kept).toHaveLength(0);
  });

  it('assertIntendedDelta throws on a count-preserving clobber and says so explicitly', () => {
    expect(() => assertIntendedDelta(before, clobbered, { subject: 'success_criteria' }))
      .toThrow(/identical counts — this is the clobber shape/);
  });

  it('assertIntendedDelta allows a removal the caller DECLARED', () => {
    const intended = ['criterion A', 'criterion B'];
    expect(() => assertIntendedDelta(before, intended, { expectRemoved: ['"criterion C"'] })).not.toThrow();
  });

  it('assertIntendedDelta allows a pure addition', () => {
    const grown = [...before, 'criterion D'];
    expect(() => assertIntendedDelta(before, grown)).not.toThrow();
  });

  it('assertIntendedDelta still catches an interleaved write that CHANGES the count', () => {
    // The count check would have caught this one; the set-difference must not be weaker.
    expect(() => assertIntendedDelta(before, ['criterion A'])).toThrow(/UNINTENDED_DELTA/);
  });

  it('compares objects by identity, not reference', () => {
    const a = [{ criterion: 'x', measure: 'm' }];
    const sameValue = [{ criterion: 'x', measure: 'm' }];
    expect(() => assertIntendedDelta(a, sameValue)).not.toThrow();

    const changed = [{ criterion: 'x', measure: 'DIFFERENT' }];
    expect(() => assertIntendedDelta(a, changed)).toThrow(/UNINTENDED_DELTA/);
  });

  it('accepts a custom identify function for domain-specific identity', () => {
    // e.g. criteria are "the same" if the criterion text matches, regardless of measure edits.
    const identify = (c) => c.criterion;
    const before2 = [{ criterion: 'x', measure: 'old' }];
    const after2 = [{ criterion: 'x', measure: 'new' }];
    expect(() => assertIntendedDelta(before2, after2, { identify })).not.toThrow();
  });

  it('handles empty and non-array inputs without throwing the wrong error', () => {
    expect(setDifference([], []).removed).toEqual([]);
    expect(setDifference(null, undefined).count_before).toBe(0);
  });
});
