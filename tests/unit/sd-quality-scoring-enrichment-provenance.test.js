/**
 * SD-FDBK-INFRA-QUALITY-GATE-COUPLED-001 (FR-2, FR-3) — checkEnrichmentProvenance
 *
 * Deterministic (no-LLM) check wired into computeQualityScore(): when a
 * description carries the sweep's filename-search enrichment marker,
 * assert the marked basename matches metadata.plan_file_path. Warning-only
 * (never blocks pass/fail) per this SD's own non-retroactive scope.
 */
import { describe, it, expect } from 'vitest';
import { checkEnrichmentProvenance, computeQualityScore } from '../../scripts/modules/sd-quality-scoring.js';

const LONG_DESCRIPTION = Array(55).fill('word').join(' '); // 55 words, clears the 50-word floor

function baseSd(overrides = {}) {
  return {
    sd_type: 'infrastructure',
    description: LONG_DESCRIPTION,
    strategic_objectives: ['a', 'b'],
    dependencies: ['x'],
    implementation_guidelines: ['y'],
    success_criteria: [{ criterion: 'c', measure: 'm' }],
    success_metrics: [{ metric: 'm', target: 't' }],
    key_changes: [{ change: 'c', impact: 'i' }],
    ...overrides,
  };
}

describe('checkEnrichmentProvenance (FR-2)', () => {
  it('TS-3: flags a real basename mismatch', () => {
    const sd = baseSd({
      description: 'Title\n\nSummary text.\n\n[Auto-enriched by sweep from workflow-audit.md]',
      metadata: { plan_file_path: '/repo/docs/plans/demand-thesis-gate-plan.md' },
    });
    const result = checkEnrichmentProvenance(sd);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('workflow-audit.md');
    expect(result.warnings[0].message).toContain('demand-thesis-gate-plan.md');
    expect(result.issues).toEqual([]); // never blocking
  });

  it('TS-4: silent when basenames match', () => {
    const sd = baseSd({
      description: 'Title\n\nSummary.\n\n[Auto-enriched by sweep from my-plan.md]',
      metadata: { plan_file_path: '/repo/docs/plans/my-plan.md' },
    });
    const result = checkEnrichmentProvenance(sd);
    expect(result.warnings).toHaveLength(0);
  });

  it('TS-5: silent with no marker', () => {
    const sd = baseSd({
      description: 'A perfectly normal, hand-authored description with no auto-enrichment marker at all.',
      metadata: { plan_file_path: '/repo/docs/plans/my-plan.md' },
    });
    expect(checkEnrichmentProvenance(sd).warnings).toHaveLength(0);
  });

  it('TS-5: silent when marker present but plan_file_path is unset (no false positive)', () => {
    const sd = baseSd({
      description: 'Title\n\nSummary.\n\n[Auto-enriched by sweep from workflow-audit.md]',
      metadata: {},
    });
    expect(checkEnrichmentProvenance(sd).warnings).toHaveLength(0);
  });

  it('is silent for the plan_content-sourced marker (distinct from the filename-search marker)', () => {
    const sd = baseSd({
      description: 'Title\n\nSummary.\n\n[Auto-enriched by sweep from plan_content]',
      metadata: { plan_file_path: '/repo/docs/plans/anything.md' },
    });
    expect(checkEnrichmentProvenance(sd).warnings).toHaveLength(0);
  });

  it('TS-6: computeQualityScore pass/fail is unaffected by the new warning', () => {
    const sdWithMismatch = baseSd({
      description: LONG_DESCRIPTION + '\n\n[Auto-enriched by sweep from wrong-file.md]',
      metadata: { plan_file_path: '/repo/docs/plans/right-file.md' },
    });
    const result = computeQualityScore(sdWithMismatch);
    expect(result.warnings.some((w) => w.includes('wrong-file.md'))).toBe(true);
    expect(result.pass).toBe(true); // otherwise-passing SD stays passing
  });
});
