/**
 * QF-20260903-379: a gate verdict should carry enough provenance for a reader to tell WHAT
 * was measured without reading the write site. Mirrors the INPUT-side gate-evidence
 * provenance ratification (6c263823) on the OUTPUT side: additive, optional, fail-open.
 */
import { describe, it, expect } from 'vitest';
import { hasMeasuredProvenance, formatMeasuredLine } from '../../../lib/governance/verdict-measured-provenance.js';
import { ValidatorRegistry } from '../../../scripts/modules/handoff/validation/validator-registry/core.js';

describe('hasMeasuredProvenance', () => {
  it('is false when measured is absent entirely (every pre-existing gate, unchanged)', () => {
    expect(hasMeasuredProvenance({ passed: true, score: 100 })).toBe(false);
  });

  it('is false when measured is present but missing subject or producer', () => {
    expect(hasMeasuredProvenance({ measured: { subject: 'x' } })).toBe(false);
    expect(hasMeasuredProvenance({ measured: { producer: 'y' } })).toBe(false);
    expect(hasMeasuredProvenance({ measured: {} })).toBe(false);
  });

  it('is true when both subject and producer are present', () => {
    expect(hasMeasuredProvenance({ measured: { subject: 'PRD content', producer: 'validatePRDQuality' } })).toBe(true);
  });
});

describe('formatMeasuredLine', () => {
  it('returns null (no extra output) for a gate result with no measured field', () => {
    expect(formatMeasuredLine({ passed: true, score: 100 })).toBeNull();
  });

  it('names the subject and the producer when both are present', () => {
    const line = formatMeasuredLine({ measured: { subject: 'PRD content', producer: 'validatePRDQuality (prd-quality-validation.js)' } });
    expect(line).toContain('PRD content');
    expect(line).toContain('validatePRDQuality (prd-quality-validation.js)');
  });
});

describe('ValidatorRegistry.normalizeResult — measured pass-through (QF-20260903-379)', () => {
  it('passes measured through unchanged when the caller supplies it', () => {
    const registry = new ValidatorRegistry();
    const measured = { subject: 'some field', producer: 'someFn' };
    const out = registry.normalizeResult({ passed: true, score: 90, measured });
    expect(out.measured).toEqual(measured);
  });

  it('omits measured entirely when the caller does not supply it (every existing gate, unchanged behavior)', () => {
    const registry = new ValidatorRegistry();
    const out = registry.normalizeResult({ passed: true, score: 90 });
    expect(out).not.toHaveProperty('measured');
  });

  it('does not let a falsy-but-present measured (e.g. null) leak an empty object into the verdict', () => {
    const registry = new ValidatorRegistry();
    const out = registry.normalizeResult({ passed: true, score: 90, measured: null });
    expect(out).not.toHaveProperty('measured');
  });
});
