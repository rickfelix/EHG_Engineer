/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-A — pure candidate-validity predicate tests.
 * Pins: the VALID staged case, every INVALID reason, lifecycle-first ordering, and totality on odd input.
 */
import { describe, it, expect } from 'vitest';
import { evaluateRefillCandidate, REFILL_INVALID_REASONS, isSubstanceThinTitle, normalizeTitleForCompare, TITLE_TRUNCATION_CAP } from '../../../lib/sourcing-engine/refill-candidate-validity.js';

// A well-formed staged refill candidate (the 683-item live shape: pending, unpromoted, real provenance).
const validItem = (over = {}) => ({
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  title: 'Harden the worktree reaper',
  source_type: 'conversion_ledger',
  source_id: '11111111-1111-1111-1111-111111111111',
  lane: 'belt',
  ...over,
});

describe('evaluateRefillCandidate (FOUNDATION SSOT)', () => {
  it('a well-formed staged, unpromoted item is VALID', () => {
    expect(evaluateRefillCandidate(validItem())).toEqual({ valid: true, reason: null });
  });

  it('an already-promoted item is INVALID (already_promoted) — lifecycle reason wins', () => {
    // even with other fields also bad, the lifecycle reason is reported first
    const r = evaluateRefillCandidate(validItem({ promoted_to_sd_key: 'SD-LEO-INFRA-X-001', title: '' }));
    expect(r).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.ALREADY_PROMOTED });
  });

  it('a non-staged item (item_disposition != pending) is INVALID (not_staged)', () => {
    expect(evaluateRefillCandidate(validItem({ item_disposition: 'declined' }))).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.NOT_STAGED });
    expect(evaluateRefillCandidate(validItem({ item_disposition: null }))).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.NOT_STAGED });
  });

  it('a decline-lane item is INVALID (declined_lane), case/space-insensitive', () => {
    expect(evaluateRefillCandidate(validItem({ lane: 'decline' })).reason).toBe(REFILL_INVALID_REASONS.DECLINED_LANE);
    expect(evaluateRefillCandidate(validItem({ lane: ' Decline ' })).reason).toBe(REFILL_INVALID_REASONS.DECLINED_LANE);
  });

  it('a missing/empty title is INVALID (missing_title)', () => {
    expect(evaluateRefillCandidate(validItem({ title: '' })).reason).toBe(REFILL_INVALID_REASONS.MISSING_TITLE);
    expect(evaluateRefillCandidate(validItem({ title: '   ' })).reason).toBe(REFILL_INVALID_REASONS.MISSING_TITLE);
    expect(evaluateRefillCandidate(validItem({ title: undefined })).reason).toBe(REFILL_INVALID_REASONS.MISSING_TITLE);
  });

  it('missing source_type or source_id is INVALID (missing_provenance)', () => {
    expect(evaluateRefillCandidate(validItem({ source_type: '' })).reason).toBe(REFILL_INVALID_REASONS.MISSING_PROVENANCE);
    expect(evaluateRefillCandidate(validItem({ source_id: null })).reason).toBe(REFILL_INVALID_REASONS.MISSING_PROVENANCE);
  });

  it('a TEST/DEMO fixture (by title or sd-key-shaped source_id) is INVALID (test_fixture)', () => {
    expect(evaluateRefillCandidate(validItem({ title: 'TEST harness probe' })).reason).toBe(REFILL_INVALID_REASONS.TEST_FIXTURE);
    expect(evaluateRefillCandidate(validItem({ title: 'SD-DEMO sample' })).reason).toBe(REFILL_INVALID_REASONS.TEST_FIXTURE);
    expect(evaluateRefillCandidate(validItem({ source_id: 'SD-TEST-FIXTURE-001' })).reason).toBe(REFILL_INVALID_REASONS.TEST_FIXTURE);
  });

  it('does NOT false-flag a normal title that merely contains test/demo mid-word', () => {
    // FIXTURE_TITLE_RE is anchored — "Latest dashboard" / "Demonstrate X" should NOT match a leading TEST/DEMO token.
    expect(evaluateRefillCandidate(validItem({ title: 'Refactor the latest dashboard widget' })).valid).toBe(true);
  });

  it('is TOTAL on odd input (null / {} / array / number) — never throws, returns missing_item or a reason', () => {
    expect(evaluateRefillCandidate(null)).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    expect(evaluateRefillCandidate(undefined)).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    expect(evaluateRefillCandidate([])).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    expect(evaluateRefillCandidate(42)).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    // empty object: not already-promoted, item_disposition undefined -> not_staged
    expect(evaluateRefillCandidate({})).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.NOT_STAGED });
  });
});

// SD-LEO-INFRA-AUTO-REFILL-BELT-001 — belt-quality axes (substance + already-shipped-lookalike).
const shell = 'a'.repeat(TITLE_TRUNCATION_CAP - 3) + '...'; // exactly TITLE_TRUNCATION_CAP chars ending '...'

describe('isSubstanceThinTitle (FR-1 truncation-shell)', () => {
  it('flags a 120-char title ending "..." (the live 173/staged shell shape)', () => {
    expect(shell.length).toBe(TITLE_TRUNCATION_CAP);
    expect(isSubstanceThinTitle(shell)).toBe(true);
  });
  it('does NOT flag a full-length title without the ellipsis marker', () => {
    expect(isSubstanceThinTitle('a'.repeat(TITLE_TRUNCATION_CAP))).toBe(false); // long but not truncated
    expect(isSubstanceThinTitle('Harden the worktree reaper')).toBe(false);
  });
  it('does NOT flag a SHORT title that merely ends in "..." (cap-anchored, conservative)', () => {
    expect(isSubstanceThinTitle('TODO: figure this out...')).toBe(false);
  });
  it('is total on odd input', () => {
    expect(isSubstanceThinTitle(null)).toBe(false);
    expect(isSubstanceThinTitle(42)).toBe(false);
    expect(isSubstanceThinTitle(undefined)).toBe(false);
  });
});

describe('normalizeTitleForCompare (FR-2 normalizer)', () => {
  it('lowercases, strips a trailing ellipsis, strips a leading SD-key prefix, collapses ws', () => {
    expect(normalizeTitleForCompare('SD-LEO-X-001:  Foo   Bar...')).toBe('foo bar');
    expect(normalizeTitleForCompare('Foo Bar')).toBe('foo bar');
  });
  it('a truncated title and its un-truncated twin normalize equal', () => {
    expect(normalizeTitleForCompare('Foo Bar Baz...')).toBe(normalizeTitleForCompare('foo bar baz'));
  });
  it('is total on odd input', () => {
    expect(normalizeTitleForCompare(null)).toBe('');
    expect(normalizeTitleForCompare(42)).toBe('');
  });
});

describe('evaluateRefillCandidate belt-quality axes', () => {
  it('rejects a substance-thin truncation shell (substance_thin), AFTER structural axes', () => {
    expect(evaluateRefillCandidate(validItem({ title: shell }))).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.SUBSTANCE_THIN });
  });
  it('a structurally-broken row still reports its structural reason BEFORE substance', () => {
    // not_staged wins over a substance-thin title
    expect(evaluateRefillCandidate(validItem({ title: shell, item_disposition: 'promoted' })).reason)
      .toBe(REFILL_INVALID_REASONS.NOT_STAGED);
  });
  it('rejects an already-shipped lookalike when the injected Set contains its normalized title', () => {
    const set = new Set([normalizeTitleForCompare('Harden the worktree reaper')]);
    expect(evaluateRefillCandidate(validItem(), { shippedTitleSet: set }))
      .toEqual({ valid: false, reason: REFILL_INVALID_REASONS.ALREADY_SHIPPED_LOOKALIKE });
  });
  it('a novel title with a non-matching injected Set is still VALID (no over-block)', () => {
    const set = new Set([normalizeTitleForCompare('Some entirely different shipped SD')]);
    expect(evaluateRefillCandidate(validItem(), { shippedTitleSet: set })).toEqual({ valid: true, reason: null });
  });
  it('is backward compatible: no opts arg => lookalike axis no-ops, substance axis still applies', () => {
    expect(evaluateRefillCandidate(validItem())).toEqual({ valid: true, reason: null });
    expect(evaluateRefillCandidate(validItem({ title: shell }))).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.SUBSTANCE_THIN });
  });
  it('tolerates a malformed opts.shippedTitleSet (not a Set) without throwing', () => {
    expect(evaluateRefillCandidate(validItem(), { shippedTitleSet: ['not', 'a', 'set'] })).toEqual({ valid: true, reason: null });
    expect(evaluateRefillCandidate(validItem(), {})).toEqual({ valid: true, reason: null });
  });
});

describe('evaluateRefillCandidate raw-label source guard (SD-LEO-INFRA-VDR-GAUGE-BELT-001 FR-1)', () => {
  it('rejects a staged item whose source_type is the raw-label vdr_gauge', () => {
    expect(evaluateRefillCandidate(validItem({ source_type: 'vdr_gauge' })))
      .toEqual({ valid: false, reason: REFILL_INVALID_REASONS.RAW_LABEL_SOURCE });
  });
  it('is case-insensitive on source_type', () => {
    expect(evaluateRefillCandidate(validItem({ source_type: 'VDR_GAUGE' })).reason).toBe(REFILL_INVALID_REASONS.RAW_LABEL_SOURCE);
  });
  it('does NOT block a normal source_type (no over-block)', () => {
    expect(evaluateRefillCandidate(validItem({ source_type: 'conversion_ledger' }))).toEqual({ valid: true, reason: null });
    expect(evaluateRefillCandidate(validItem({ source_type: 'brainstorm' }))).toEqual({ valid: true, reason: null });
  });
  it('a MISSING source_type still reports the provenance reason first (ordering preserved)', () => {
    expect(evaluateRefillCandidate(validItem({ source_type: '' })).reason).toBe(REFILL_INVALID_REASONS.MISSING_PROVENANCE);
  });
});
