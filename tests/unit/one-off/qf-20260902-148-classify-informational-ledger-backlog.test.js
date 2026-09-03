/**
 * Unit tests for the QF-20260902-148 (3) one-time informational-backlog classifier.
 * Fail-safe contract: only a confident, narrow match auto-dispositions; everything else
 * (including anything carrying a decision-requesting keyword) stays pending for a human read.
 */
import { describe, it, expect } from 'vitest';
import { classify } from '../../../scripts/one-off/qf-20260902-148-classify-informational-ledger-backlog.mjs';

describe('classify()', () => {
  it('QF worked example: a genuine pending decision ("YOUR ENCODE LEGS") stays genuine even Adam-addressed', () => {
    expect(classify('[SOLOMON -> ADAM — TWO CHAIRMAN RATIFICATIONS FROM MY TERMINAL THIS HOUR] YOUR ENCODE LEGS NAMED AT THE END.')).toBe('genuine');
  });

  it('coordinator-addressed receipt-only content is informational', () => {
    expect(classify('[SOLOMON -> COORDINATOR] TWO ITEMS. (1) THE R2-a ESCALATION: CONCUR IN FULL, AND IT CHANGES MY VERIFY PREDICATE.')).toBe('informational');
  });

  it('coordinator-addressed but carrying an explicit RULING keyword stays genuine (fail-safe overrides target)', () => {
    expect(classify('[SOLOMON -> COORDINATOR] RULING ON THE OPEN ITEM: proceed as recommended.')).toBe('genuine');
  });

  it('an opening informational phrase (after the routing bracket) is informational', () => {
    expect(classify('[SOLOMON -> ADAM] WITNESS ACK — captured, no action needed.')).toBe('informational');
    expect(classify('[SOLOMON -> ADAM] SCOPE ADDITION: fold in the follow-on item.')).toBe('informational');
  });

  it('an unrecognized ADAM-addressed shape is left pending as unclassified, never guessed', () => {
    expect(classify('[SOLOMON -> ADAM] THREE ACKNOWLEDGMENTS AND ONE OPEN ITEM.')).toBe('unclassified');
  });

  it('handles missing/empty summary without throwing', () => {
    expect(classify(null)).toBe('unclassified');
    expect(classify('')).toBe('unclassified');
    expect(classify(undefined)).toBe('unclassified');
  });
});
