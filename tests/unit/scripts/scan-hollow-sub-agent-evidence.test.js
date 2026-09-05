/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H (FR-3/FR-4c): pure-function coverage for the hollow-evidence
 * census classifier, independent of the script's DB paging/persistence.
 */
import { describe, it, expect } from 'vitest';
import { isHollow } from '../../../scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs';

describe('isHollow', () => {
  it('flags a row with no findings, warnings, or recommendations', () => {
    expect(isHollow({ metadata: {}, warnings: [], recommendations: [] })).toBe(true);
  });

  it('does not flag a row with non-empty findings (metadata.findings)', () => {
    expect(isHollow({ metadata: { findings: { risk: 'high' } }, warnings: [], recommendations: [] })).toBe(false);
  });

  it('does not flag a row with a non-empty _findings_had_keys marker', () => {
    expect(isHollow({ metadata: { _findings_had_keys: ['risk'] }, warnings: [], recommendations: [] })).toBe(false);
  });

  it('does not flag a row with non-empty warnings', () => {
    expect(isHollow({ metadata: {}, warnings: ['be careful'], recommendations: [] })).toBe(false);
  });

  it('does not flag a row with non-empty recommendations', () => {
    expect(isHollow({ metadata: {}, warnings: [], recommendations: ['do X'] })).toBe(false);
  });

  it('treats an array of blank strings as still empty', () => {
    expect(isHollow({ metadata: { findings: [] }, warnings: ['   '], recommendations: [] })).toBe(true);
  });

  it('handles a row missing metadata entirely', () => {
    expect(isHollow({ warnings: [], recommendations: [] })).toBe(true);
  });

  it('does NOT flag a row whose real content lives under sub-agent-specific metadata keys (the VISION_FIDELITY false-positive)', () => {
    // Measured live specimen (id 12db02c8): real content, just never routed through
    // findings/warnings/recommendations.
    expect(isHollow({
      warnings: [],
      recommendations: [],
      summary: null,
      metadata: {
        sub_agent_version: '1.0.0',
        error: null,
        stack: null,
        routing: null,
        vision_key: 'VISION-EHG-L1-001',
        total_elements: 6,
        delivered_count: 6,
        vision_coverage_pct: 1,
      },
    })).toBe(false);
  });

  it('does not flag a row whose only content is a non-empty summary', () => {
    expect(isHollow({ warnings: [], recommendations: [], summary: 'PASS — reason stated here' })).toBe(false);
  });

  it('does not flag a row whose only content is a non-empty caller-supplied metrics object', () => {
    expect(isHollow({ warnings: [], recommendations: [], metadata: { metrics: { checks_run: 12 } } })).toBe(false);
  });

  it('flags a row whose metadata contains only bookkeeping keys with empty/null values', () => {
    expect(isHollow({
      warnings: [],
      recommendations: [],
      summary: null,
      metadata: { sub_agent_version: '1.0.0', error: null, stack: null, options: {}, metrics: {}, routing: null, phase: 'EXEC' },
    })).toBe(true);
  });
});
