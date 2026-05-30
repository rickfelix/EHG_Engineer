/**
 * Regression tests for the bypass-rubric DONT_UNDERSTAND false-rejection bug.
 * SD: SD-LEO-INFRA-TIGHTEN-BYPASS-RUBRIC-001
 *
 * Before: the DONT_UNDERSTAND illegitimate pattern included bare /unclear|confusing/
 * alternatives. Because validateBypassReason checks ILLEGITIMATE_REASONS *before*
 * LEGITIMATE_REASONS, any otherwise-legitimate reason whose text merely contained the
 * word "unclear" or "confusing" — e.g. a TOOLING_BUG reason noting that an error
 * message "is unclear about which check failed" (the CronGenius-pilot case) — was
 * short-circuited and REJECTED as DONT_UNDERSTAND before the TOOLING_BUG rule could match.
 *
 * After: unclear/confusing only classify as DONT_UNDERSTAND when they describe the
 * AUTHOR not understanding the gate's requirements/intent (proximity to a
 * requirement/intent subject), not when they describe an artifact (error/output/message)
 * being unclear. The self-referential phrases (don't understand / don't know why /
 * no idea / I'm confused) remain always-illegitimate, so genuine bypass-because-confused
 * is still rejected.
 *
 * These tests fail against the pre-fix regex (Group 1 reasons resolve REJECTED/
 * DONT_UNDERSTAND) and pass after the fix.
 */

import { describe, it, expect } from 'vitest';
import { validateBypassReason } from '../../../scripts/modules/handoff/bypass-rubric.js';

describe('bypass-rubric DONT_UNDERSTAND tightening (SD-LEO-INFRA-TIGHTEN-BYPASS-RUBRIC-001)', () => {
  describe('Group 1 — legitimate reasons containing domain "unclear"/"confusing" are no longer misclassified', () => {
    it('allows the CronGenius-pilot TOOLING_BUG reason whose error output "is unclear"', () => {
      const result = validateBypassReason(
        'TOOLING_BUG: the gate validator has a regression producing a false positive; its error output is unclear about which check failed'
      );
      // Pre-fix this returned ILLEGITIMATE/DONT_UNDERSTAND — the bug this SD fixes.
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('LEGITIMATE');
      expect(result.matchedRule).toBe('TOOLING_BUG');
    });

    it('allows a tooling-bug reason where a log message is "confusing" (artifact, not the author)', () => {
      const result = validateBypassReason('The build tool is broken and its log message is confusing to read');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('LEGITIMATE');
      expect(result.matchedRule).toBe('TOOLING_BUG');
    });
  });

  describe('Group 2 — genuine not-understanding reasons are still rejected (enforcement preserved)', () => {
    it('rejects "I don\'t understand why this gate is failing ... no idea how to fix it"', () => {
      const result = validateBypassReason("I don't understand why this gate is failing and I have no idea how to fix it");
      expect(result.allowed).toBe(false);
      expect(result.category).toBe('ILLEGITIMATE');
      expect(result.matchedRule).toBe('DONT_UNDERSTAND');
    });

    it('rejects "I\'m confused about this whole thing and just want it to pass"', () => {
      const result = validateBypassReason("I'm confused about this whole thing and just want it to pass");
      expect(result.allowed).toBe(false);
      expect(result.category).toBe('ILLEGITIMATE');
      expect(result.matchedRule).toBe('DONT_UNDERSTAND');
    });
  });

  describe('Group 3 — "unclear/confusing" about the gate requirements/intent is still rejected', () => {
    it('rejects "The gate requirements are unclear and confusing to me"', () => {
      const result = validateBypassReason('The gate requirements are unclear and confusing to me');
      expect(result.allowed).toBe(false);
      expect(result.category).toBe('ILLEGITIMATE');
      expect(result.matchedRule).toBe('DONT_UNDERSTAND');
    });

    it('rejects "the acceptance criteria is unclear" (requirement subject before unclear)', () => {
      const result = validateBypassReason('Honestly the acceptance criteria is unclear to me here');
      expect(result.allowed).toBe(false);
      expect(result.category).toBe('ILLEGITIMATE');
      expect(result.matchedRule).toBe('DONT_UNDERSTAND');
    });

    it('rejects "unclear what\'s being asked" (unclear before intent subject)', () => {
      const result = validateBypassReason("It is unclear what's being asked of me in this gate");
      expect(result.allowed).toBe(false);
      expect(result.category).toBe('ILLEGITIMATE');
      expect(result.matchedRule).toBe('DONT_UNDERSTAND');
    });
  });

  describe('Group 4 — the other rubric rules are unchanged', () => {
    it('still rejects GATE_TOO_STRICT', () => {
      const r = validateBypassReason('The gate threshold is too strict for this SD');
      expect(r.allowed).toBe(false);
      expect(r.matchedRule).toBe('GATE_TOO_STRICT');
    });

    it('still rejects TAKING_TOO_LONG', () => {
      const r = validateBypassReason('This is taking too long, just skip it');
      expect(r.allowed).toBe(false);
      expect(r.matchedRule).toBe('TAKING_TOO_LONG');
    });

    it('still rejects WORKS_ON_MY_MACHINE', () => {
      const r = validateBypassReason('It works on my machine, good enough to ship');
      expect(r.allowed).toBe(false);
      expect(r.matchedRule).toBe('WORKS_ON_MY_MACHINE');
    });

    it('still allows a clear legitimate ENV_UNAVAILABLE reason', () => {
      const r = validateBypassReason('Staging test environment is down and unreachable');
      expect(r.allowed).toBe(true);
      expect(r.category).toBe('LEGITIMATE');
      expect(r.matchedRule).toBe('ENV_UNAVAILABLE');
    });
  });

  describe('Group 5 — bare "unclear" with no legitimate match and no requirement subject falls through to UNCLASSIFIED', () => {
    it('classifies a vague bare-"unclear" reason as UNCLASSIFIED (allowed-with-warning), gated by shape + rate-limit layers', () => {
      // This is the deliberate boundary move: bare "unclear" with no requirement/intent
      // subject is no longer auto-rejected. It cannot actually bypass on its own — the
      // bypass-shape gate (--pattern-id/--followup-sd-key) and rate limits still apply.
      const result = validateBypassReason('The overall situation here is genuinely unclear right now honestly');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('UNCLASSIFIED');
      expect(result.matchedRule).toBeNull();
    });
  });
});
