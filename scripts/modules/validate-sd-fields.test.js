/**
 * Tests for SD Field Validation & Auto-Enrichment
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-078
 *
 * Verifies that auto-enrichment populates missing JSONB fields
 * so SDs meet GATE_SD_QUALITY thresholds at creation time.
 */

import { describe, it, expect } from 'vitest';
import { validateSDFields } from './validate-sd-fields.js';
import { computeQualityScore, SD_TYPE_THRESHOLDS } from './sd-quality-scoring.js';

/**
 * Create a minimal SD with only the specified fields populated.
 */
function createMinimalSD(overrides = {}) {
  return {
    sd_type: 'infrastructure',
    title: 'Test SD for quality gate validation',
    description: 'This is a test strategic directive with enough words to meet the minimum description length requirement for infrastructure SD types which is fifty words total needed here.',
    scope: 'IN SCOPE: Test changes. OUT OF SCOPE: Production systems.',
    ...overrides,
  };
}

describe('validateSDFields — missing field auto-population', () => {
  it('should populate missing dependencies field', () => {
    const sd = createMinimalSD({ dependencies: null });
    const result = validateSDFields(sd, { enrich: true, quiet: true });

    expect(sd.dependencies).toBeDefined();
    expect(Array.isArray(sd.dependencies)).toBe(true);
    expect(sd.dependencies.length).toBeGreaterThan(0);
    expect(result.enrichments.some(e => e.includes('dependencies'))).toBe(true);
  });

  it('should populate missing implementation_guidelines field', () => {
    const sd = createMinimalSD({ implementation_guidelines: null });
    const result = validateSDFields(sd, { enrich: true, quiet: true });

    expect(sd.implementation_guidelines).toBeDefined();
    expect(Array.isArray(sd.implementation_guidelines)).toBe(true);
    expect(sd.implementation_guidelines.length).toBeGreaterThan(0);
    expect(result.enrichments.some(e => e.includes('implementation_guidelines'))).toBe(true);
  });

  it('should not modify fields that are already populated', () => {
    const existingDeps = [{ sd_key: 'SD-TEST-001', description: 'Real dependency' }];
    const sd = createMinimalSD({
      dependencies: existingDeps,
      implementation_guidelines: ['Follow pattern X'],
      strategic_objectives: ['Complete the task'],
      success_criteria: [{ criterion: 'Works', measure: 'Tests pass' }],
      success_metrics: [{ metric: 'Coverage', target: '100%', actual: '0%' }],
      key_changes: [{ change: 'Add feature', impact: 'New capability' }],
      key_principles: ['Keep it simple'],
      risks: [{ risk: 'None', severity: 'low', mitigation: 'N/A' }],
    });

    const result = validateSDFields(sd, { enrich: true, quiet: true });

    expect(sd.dependencies).toBe(existingDeps);
    expect(result.enrichments.filter(e => e.includes('dependencies'))).toHaveLength(0);
  });

  it('should bring infrastructure SD with 4/8 fields above threshold', () => {
    const sd = createMinimalSD({
      // Only populate 4 fields (need 6 for infrastructure)
      strategic_objectives: ['Complete the work'],
      success_criteria: [{ criterion: 'Done', measure: 'Verified' }],
      key_changes: [{ change: 'Fix issue', impact: 'Resolved' }],
      risks: [{ risk: 'Low', severity: 'low', mitigation: 'Testing' }],
      // These are missing:
      dependencies: null,
      implementation_guidelines: null,
      success_metrics: null,
      key_principles: null,
    });

    validateSDFields(sd, { enrich: true, quiet: true });

    // After enrichment, score should meet infrastructure threshold
    const score = computeQualityScore(sd);
    expect(score.score).toBeGreaterThanOrEqual(SD_TYPE_THRESHOLDS.infrastructure.passingScore);
  });

  it('should bring feature SD with 5/8 fields above threshold', () => {
    const sd = createMinimalSD({
      sd_type: 'feature',
      description: 'This is a detailed feature SD with enough words to meet the minimum hundred word description length requirement for feature SD types. We need to describe the feature thoroughly so the quality gate can properly evaluate the content quality dimension. This description explains what the feature does, why it matters, and how it should be implemented. The feature will improve user experience by providing better feedback.',
      strategic_objectives: ['Deliver new feature'],
      success_criteria: [{ criterion: 'Feature works', measure: 'E2E test passes' }],
      key_changes: [{ change: 'Add component', impact: 'New UI element' }],
      risks: [{ risk: 'Complexity', severity: 'medium', mitigation: 'Incremental delivery' }],
      key_principles: ['User-first design'],
      // Missing: dependencies, implementation_guidelines, success_metrics
      dependencies: null,
      implementation_guidelines: null,
      success_metrics: null,
    });

    validateSDFields(sd, { enrich: true, quiet: true });

    const score = computeQualityScore(sd);
    expect(score.score).toBeGreaterThanOrEqual(SD_TYPE_THRESHOLDS.feature.passingScore);
  });

  it('should still convert string entries to objects (structural enrichment)', () => {
    const sd = createMinimalSD({
      success_criteria: ['Test passes', 'Code reviewed'],
      key_changes: ['Fix the bug'],
      // Populate enough to meet threshold
      strategic_objectives: ['Fix it'],
      dependencies: [{ sd_key: 'none', description: 'None' }],
      implementation_guidelines: ['Follow protocol'],
      success_metrics: [{ metric: 'Done', target: '100%', actual: '0%' }],
      key_principles: ['Quality first'],
      risks: [{ risk: 'None', severity: 'low', mitigation: 'N/A' }],
    });

    const result = validateSDFields(sd, { enrich: true, quiet: true });

    // success_criteria strings should be converted to {criterion, measure} objects
    expect(sd.success_criteria[0]).toHaveProperty('criterion');
    expect(sd.success_criteria[0]).toHaveProperty('measure');

    // key_changes strings should be converted to {change, impact} objects
    expect(sd.key_changes[0]).toHaveProperty('change');
    expect(sd.key_changes[0]).toHaveProperty('impact');

    expect(result.enrichments.some(e => e.includes('converted'))).toBe(true);
  });

  it('should skip population when already above required field count', () => {
    const sd = createMinimalSD({
      strategic_objectives: ['Complete work'],
      dependencies: [{ sd_key: 'none', description: 'None' }],
      implementation_guidelines: ['Follow protocol'],
      success_criteria: [{ criterion: 'Works', measure: 'Tests pass' }],
      success_metrics: [{ metric: 'Done', target: '100%', actual: '0%' }],
      key_changes: [{ change: 'Fix', impact: 'Resolved' }],
      key_principles: ['Quality'],
      risks: [{ risk: 'Low', severity: 'low', mitigation: 'Testing' }],
    });

    const result = validateSDFields(sd, { enrich: true, quiet: true });

    // No population enrichments should be needed (all 8 fields present, infrastructure needs 6)
    const populationEnrichments = result.enrichments.filter(e => e.includes('populated'));
    expect(populationEnrichments).toHaveLength(0);
  });
});
