/**
 * Vitest coverage for canonical finding-shape spec (SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-A).
 */

import { describe, it, expect } from 'vitest';
import {
  FINDING_CATEGORIES,
  SEVERITY_LEVELS,
  computeFindingHash,
  validateFindingShape,
} from '../../../../lib/eva/quality-findings/finding-shape.js';

describe('FINDING_CATEGORIES (canonical 12)', () => {
  it('enumerates exactly 12 categories: code review (5) + QA (2) + UAT (3) + Vision (2)', () => {
    // SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-E-001 added the two Vision Compliance
    // categories (feedback_widget_present, error_capture_wired) on 2026-05-02.
    expect(FINDING_CATEGORIES).toEqual([
      'npm_audit', 'secrets', 'lint', 'test_suite',
      'unit_test', 'e2e_test',
      'uat_test', 'bug_report', 'uat_signoff',
      'capability',
      'feedback_widget_present', 'error_capture_wired',
    ]);
    expect(FINDING_CATEGORIES.length).toBe(12);
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(FINDING_CATEGORIES)).toBe(true);
  });
});

describe('computeFindingHash', () => {
  const baseInput = {
    venture_id: 'aaaa-bbbb-cccc-dddd',
    stage_number: 20,
    finding_category: 'lint',
    finding_signature: 'no-unused-vars:src/foo.js:42',
  };

  it('returns 16-char hex digest', () => {
    const h = computeFindingHash(baseInput);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic — same input yields same hash', () => {
    const h1 = computeFindingHash(baseInput);
    const h2 = computeFindingHash({ ...baseInput });
    expect(h1).toBe(h2);
  });

  it('changes when any component changes', () => {
    const base = computeFindingHash(baseInput);
    expect(computeFindingHash({ ...baseInput, venture_id: 'xxxx' })).not.toBe(base);
    expect(computeFindingHash({ ...baseInput, stage_number: 21 })).not.toBe(base);
    expect(computeFindingHash({ ...baseInput, finding_category: 'secrets' })).not.toBe(base);
    expect(computeFindingHash({ ...baseInput, finding_signature: 'other' })).not.toBe(base);
  });

  it('throws on missing components', () => {
    expect(() => computeFindingHash({})).toThrow();
    expect(() => computeFindingHash({ ...baseInput, venture_id: undefined })).toThrow();
  });
});

describe('validateFindingShape', () => {
  const validFinding = {
    venture_id: 'v1',
    stage_number: 20,
    finding_category: 'lint',
    severity: 'medium',
    finding_hash: 'deadbeefcafebabe',
    evidence_pointer: { file: 'src/foo.js' },
  };

  it('passes for a valid canonical finding', () => {
    const r = validateFindingShape(validFinding);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects missing venture_id', () => {
    const r = validateFindingShape({ ...validFinding, venture_id: null });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('venture_id required');
  });

  it('rejects non-numeric stage_number (forward-compat: any number accepted)', () => {
    expect(validateFindingShape({ ...validFinding, stage_number: '20' }).valid).toBe(false);
    expect(validateFindingShape({ ...validFinding, stage_number: 22 }).valid).toBe(true); // forward-compat
  });

  it('rejects unknown finding_category', () => {
    const r = validateFindingShape({ ...validFinding, finding_category: 'invented' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/finding_category must be one of/);
  });

  it('rejects unknown severity', () => {
    const r = validateFindingShape({ ...validFinding, severity: 'urgent' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/severity must be one of/);
  });

  it('accepts each of the 10 canonical categories', () => {
    for (const cat of FINDING_CATEGORIES) {
      const r = validateFindingShape({ ...validFinding, finding_category: cat });
      expect(r.valid).toBe(true);
    }
  });
});

describe('SEVERITY_LEVELS', () => {
  it('enumerates critical/high/medium/low', () => {
    expect(SEVERITY_LEVELS).toEqual(['critical', 'high', 'medium', 'low']);
    expect(Object.isFrozen(SEVERITY_LEVELS)).toBe(true);
  });
});
