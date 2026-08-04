/**
 * QF-20260727-475 — a reader must be able to tell relayed inference from verified fact.
 *
 * Two independent witnesses, eight hours apart. An SD carried three material claims that were
 * WRONG, each stated with the same confidence as the verified parts, and the worker acted on all
 * of them: "NOTHING IN THE ARTIFACT DISTINGUISHED THEM FROM VERIFIED FACT." Then a sub-agent INFO
 * finding travelled sub-agent → worker → coordinator → worker → a durable migration header with
 * no verification at any hop, and was false in all three parts against pg_catalog.
 *
 * The property that matters: the deriver must NEVER award 'measured'. A provenance tag that
 * overclaims recreates the defect one level up — the reader would trust the tag instead of the
 * prose, and be wrong in exactly the same way.
 */
import { describe, it, expect } from 'vitest';
import { deriveClaimProvenance, claimProvenanceBanner } from '../../../scripts/sd-from-feedback.js';

describe('QF-475 — provenance never overclaims', () => {
  it('never returns "measured", whatever the input', () => {
    // THE LOAD-BEARING ASSERTION. Nothing available at this seam can prove first-hand
    // measurement, so claiming it would be a lie with a confident-looking label.
    const inputs = [
      { category: 'harness_backlog' }, { category: 'coordinator_review' },
      { category: 'ci_failure' }, { category: 'feature_flag_governance' },
      { source_type: 'manual_feedback' }, { source_type: 'auto_capture' },
      {}, null, undefined, { category: 'MEASURED' }, { category: 'verified' },
    ];
    for (const f of inputs) expect(deriveClaimProvenance(f)).not.toBe('measured');
  });

  it('floors at "unverified" — absence of evidence is not evidence of verification', () => {
    expect(deriveClaimProvenance({})).toBe('unverified');
    expect(deriveClaimProvenance(null)).toBe('unverified');
    expect(deriveClaimProvenance({ category: 'ci_failure' })).toBe('unverified');
  });
});

describe('QF-475 — the relayed lanes are the ones that caused harm', () => {
  it.each([
    'harness_backlog',        // 747 live rows — the auto-promoted worker-signal lane
    'coordinator_review',     // witness #1 came through here
    'coordinator_adam_review',
    'fleet_retro',
    'invariant_gauge_finding',
    'adam_adherence_drift',
  ])('classifies %s as relayed_unverified', (category) => {
    expect(deriveClaimProvenance({ category })).toBe('relayed_unverified');
  });

  it('treats auto_capture as relayed even when the category is unknown', () => {
    expect(deriveClaimProvenance({ source_type: 'auto_capture', category: 'something_new' }))
      .toBe('relayed_unverified');
  });

  it('CONTROL — a direct human-authored lane is NOT marked relayed', () => {
    // Without this, the classifier could mark literally everything relayed and still pass every
    // assertion above, which would make the banner noise the reader learns to skip.
    expect(deriveClaimProvenance({ category: 'ci_failure', source_type: 'manual_feedback' }))
      .toBe('unverified');
  });

  it('is case-insensitive on category', () => {
    expect(deriveClaimProvenance({ category: 'HARNESS_BACKLOG' })).toBe('relayed_unverified');
  });
});

describe('QF-475 — the banner names what to re-derive', () => {
  it('names all four claim types that actually caused harm', () => {
    const banner = claimProvenanceBanner('relayed_unverified');
    for (const claimType of ['mechanism', 'insertion point', 'root cause', 'proposed fix']) {
      expect(banner.toLowerCase()).toContain(claimType);
    }
  });

  it('says the text is a LEAD, not a specification', () => {
    // The acceptance is that a worker knows which sentences to re-derive before acting.
    expect(claimProvenanceBanner('relayed_unverified')).toMatch(/LEAD, not a specification/);
  });

  it('states the provenance verbatim so a reader can see which class applies', () => {
    expect(claimProvenanceBanner('relayed_unverified')).toContain('RELAYED-UNVERIFIED');
    expect(claimProvenanceBanner('unverified')).toContain('UNVERIFIED');
  });

  it('is admitted to NOT distinguish per-sentence, rather than implying it does', () => {
    // Per-claim provenance cannot be derived automatically. Saying so is the honest contract;
    // implying sentence-level marking would be the same overclaim the deriver refuses to make.
    expect(claimProvenanceBanner('relayed_unverified')).toMatch(/NOT distinguished/);
  });
});
