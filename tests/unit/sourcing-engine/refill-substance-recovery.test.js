/**
 * SD-LEO-INFRA-BELT-001-PART-001 — FR-3 substance-recovery + FR-2 advisory cross-ref.
 *
 * Part-1 (PR #5012) rejected any 120-char truncated-title row as substance_thin, drying the belt by
 * blocking 173 REAL staged items whose only flaw was that the populator dropped feedback.description.
 * FR-3 carries the recovered description (metadata.description) and makes the substance check gate on
 * it: a truncated title WITH substantial recovered content is now VALID; truncated WITHOUT it stays
 * substance_thin (narrow lane). FR-2 adds a bounded ADVISORY shipped-SD cross-reference.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateRefillCandidate, REFILL_INVALID_REASONS,
  hasRecoveredSubstance, MIN_RECOVERED_SUBSTANCE_LEN,
  crossRefShippedTitleAdvisory, normalizeTitleForCompare, TITLE_TRUNCATION_CAP,
} from '../../../lib/sourcing-engine/refill-candidate-validity.js';

// A 120-char truncated-title shell (the populator's truncation marker).
const truncatedTitle = ('x'.repeat(TITLE_TRUNCATION_CAP - 3) + '...');
const realDescription = 'The EVA scheduler poll loop throws CONTEXT_LOAD_FAILED on orphaned queue rows after the fixture purge; self-heal by evicting them.'; // ~130 chars

const stagedTruncated = (over = {}) => ({
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  title: truncatedTitle,
  source_type: 'brainstorm',
  source_id: '22222222-2222-2222-2222-222222222222',
  lane: 'belt',
  ...over,
});

describe('FR-3: substance check gates on recovered description', () => {
  it('truncated title WITH a substantial recovered metadata.description is VALID (recovery)', () => {
    const r = evaluateRefillCandidate(stagedTruncated({ metadata: { description: realDescription } }));
    expect(r).toEqual({ valid: true, reason: null });
  });

  it('truncated title WITHOUT a recovered description stays substance_thin (narrow lane preserved)', () => {
    const r = evaluateRefillCandidate(stagedTruncated());
    expect(r).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.SUBSTANCE_THIN });
  });

  it('truncated title with only a TRIVIAL description (< floor) stays substance_thin', () => {
    const r = evaluateRefillCandidate(stagedTruncated({ metadata: { description: 'too short' } }));
    expect(r).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.SUBSTANCE_THIN });
  });

  it('truncated title whose "description" is itself a truncation shell does NOT count as recovered', () => {
    const r = evaluateRefillCandidate(stagedTruncated({ metadata: { description: truncatedTitle } }));
    expect(r).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.SUBSTANCE_THIN });
  });

  it('a full-length (non-truncated) title is unaffected — never substance_thin', () => {
    const r = evaluateRefillCandidate(stagedTruncated({ title: 'Harden the worktree reaper' }));
    expect(r).toEqual({ valid: true, reason: null });
  });
});

describe('FR-3: hasRecoveredSubstance (pure/total)', () => {
  it('true only for a substantial, non-shell description (metadata or top-level)', () => {
    expect(hasRecoveredSubstance({ metadata: { description: realDescription } })).toBe(true);
    expect(hasRecoveredSubstance({ description: realDescription })).toBe(true);
    expect(hasRecoveredSubstance({ metadata: { description: 'x'.repeat(MIN_RECOVERED_SUBSTANCE_LEN - 1) } })).toBe(false);
    expect(hasRecoveredSubstance({ metadata: { description: truncatedTitle } })).toBe(false);
  });
  it('total on odd input', () => {
    expect(hasRecoveredSubstance(null)).toBe(false);
    expect(hasRecoveredSubstance(undefined)).toBe(false);
    expect(hasRecoveredSubstance({})).toBe(false);
    expect(hasRecoveredSubstance(42)).toBe(false);
  });
});

describe('FR-2: crossRefShippedTitleAdvisory (bounded, advisory, pure)', () => {
  const shipped = new Set([normalizeTitleForCompare('Harden the worktree reaper across all pools')]);
  it('surfaces a truncated-prefix re-promotion of a shipped title', () => {
    expect(crossRefShippedTitleAdvisory('Harden the worktree reaper', shipped)).toBeTruthy();
  });
  it('returns null for an unrelated title', () => {
    expect(crossRefShippedTitleAdvisory('Add a brand-new marketing dashboard widget', shipped)).toBe(null);
  });
  it('is total on odd input (no set / non-set)', () => {
    expect(crossRefShippedTitleAdvisory('anything', null)).toBe(null);
    expect(crossRefShippedTitleAdvisory('anything', {})).toBe(null);
    expect(crossRefShippedTitleAdvisory('', shipped)).toBe(null);
  });
  it('does NOT change the evaluateRefillCandidate verdict (advisory-only)', () => {
    // A valid candidate stays valid regardless of any shipped cross-ref (advisory is caller-side).
    expect(evaluateRefillCandidate(stagedTruncated({ metadata: { description: realDescription } })).valid).toBe(true);
  });
});
