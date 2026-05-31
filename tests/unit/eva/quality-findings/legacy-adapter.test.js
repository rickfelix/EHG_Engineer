/**
 * Vitest coverage for legacy-adapter (SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-A).
 */

import { describe, it, expect } from 'vitest';
import {
  transformLegacyFinding,
  adaptLegacyBatch,
  LEGACY_CHECK_MAP,
} from '../../../../lib/eva/quality-findings/legacy-adapter.js';

const ctx = { venture_id: 'venture-aaa-111' };

describe('transformLegacyFinding', () => {
  it('maps known check identity to canonical category', () => {
    const r = transformLegacyFinding(
      { check: 'lint', title: 'no-unused-vars', severity: 'medium' },
      ctx
    );
    expect(r.finding_category).toBe('lint');
    expect(r.severity).toBe('medium');
    expect(r.stage_number).toBe(20);
    expect(r.venture_id).toBe('venture-aaa-111');
    expect(r.finding_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('routes unmapped legacy checks to capability with marker', () => {
    const r = transformLegacyFinding(
      { check: 'mystery_check', title: 'something', severity: 'low' },
      ctx
    );
    expect(r.finding_category).toBe('capability');
    expect(r.evidence_pointer.legacy_check).toBe('mystery_check');
  });

  it('defaults bad severity to medium', () => {
    const r = transformLegacyFinding(
      { check: 'lint', title: 't', severity: 'urgent' },
      ctx
    );
    expect(r.severity).toBe('medium');
  });

  it('returns null for malformed input', () => {
    expect(transformLegacyFinding(null, ctx)).toBeNull();
    expect(transformLegacyFinding({ check: 'lint' }, {})).toBeNull(); // no venture_id
  });

  it('preserves legacy fields under evidence_pointer', () => {
    const r = transformLegacyFinding(
      { check: 'secrets', title: 'AWS key in src/config.js', detail: 'AKIA...' },
      ctx
    );
    expect(r.evidence_pointer.legacy_title).toContain('AWS');
    expect(r.evidence_pointer.legacy_detail).toContain('AKIA');
  });
});

describe('adaptLegacyBatch idempotency', () => {
  const sampleBatch = [
    { check: 'lint', title: 'no-unused-vars:src/a.js:1', severity: 'medium' },
    { check: 'lint', title: 'no-unused-vars:src/b.js:1', severity: 'medium' },
    { check: 'lint', title: 'no-unused-vars:src/a.js:1', severity: 'medium' }, // dup of #1
    { check: 'secrets', title: 'AWS key', severity: 'critical' },
  ];

  it('dedupes within a batch by finding_hash', () => {
    const r = adaptLegacyBatch(sampleBatch, ctx);
    expect(r.canonical.length).toBe(3); // dup removed
    expect(r.hashes.size).toBe(3);
  });

  it('produces identical output across two batch runs (idempotent)', () => {
    const r1 = adaptLegacyBatch(sampleBatch, ctx);
    const r2 = adaptLegacyBatch(sampleBatch, ctx);
    expect(r1.canonical.map((c) => c.finding_hash).sort())
      .toEqual(r2.canonical.map((c) => c.finding_hash).sort());
  });

  it('skips malformed rows into skipped[]', () => {
    const r = adaptLegacyBatch([null, { check: 'lint', severity: 'low', title: 't' }], ctx);
    expect(r.canonical.length).toBe(1);
    expect(r.skipped.length).toBe(1);
  });

  it('handles empty batch', () => {
    const r = adaptLegacyBatch([], ctx);
    expect(r.canonical).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.hashes.size).toBe(0);
  });
});

describe('LEGACY_CHECK_MAP', () => {
  it('identity-maps every canonical category the analyzer can emit', () => {
    // Stays in lockstep with the analyzer's emitted checks: 4 code-review + 2 QA
    // + 2 Vision-Compliance (SD-LEO-INFRA-STAGE-CODE-QUALITY-001) + 4 DB/env-sourced
    // UAT/capability categories (SD-LEO-INFRA-STAGE-ANALYZER-ADD-001).
    expect(LEGACY_CHECK_MAP).toEqual({
      npm_audit: 'npm_audit',
      secrets: 'secrets',
      lint: 'lint',
      test_suite: 'test_suite',
      unit_test: 'unit_test',
      e2e_test: 'e2e_test',
      feedback_widget_present: 'feedback_widget_present',
      error_capture_wired: 'error_capture_wired',
      uat_test: 'uat_test',
      bug_report: 'bug_report',
      uat_signoff: 'uat_signoff',
      capability: 'capability',
    });
  });
});
