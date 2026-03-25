/**
 * Tests for Stage 17 Template analysisStep wiring
 * SD: SD-LEO-ORCH-PIPELINE-INTEGRITY-FIX-002-C
 *
 * Verifies that Stage 17 template has analysisStep, outputSchema,
 * and ensureOutputSchema properly wired — matching the pattern
 * established in stages 10-16.
 */
import { describe, test, expect } from 'vitest';
import TEMPLATE from '../stage-templates/stage-17.js';
import { analyzeStage17 } from '../stage-templates/analysis-steps/stage-17-blueprint-review.js';

describe('Stage 17 Template - analysisStep Wiring', () => {
  test('TEMPLATE.analysisStep is defined and is a function', () => {
    expect(TEMPLATE.analysisStep).toBeDefined();
    expect(typeof TEMPLATE.analysisStep).toBe('function');
  });

  test('TEMPLATE.analysisStep is the analyzeStage17 function', () => {
    expect(TEMPLATE.analysisStep).toBe(analyzeStage17);
  });

  test('TEMPLATE.outputSchema is populated', () => {
    expect(TEMPLATE.outputSchema).toBeDefined();
    expect(typeof TEMPLATE.outputSchema).toBe('object');
    expect(Object.keys(TEMPLATE.outputSchema).length).toBeGreaterThan(0);
  });

  test('TEMPLATE.outputSchema contains expected fields from schema', () => {
    // extractOutputSchema only includes non-derived, required fields
    expect(Array.isArray(TEMPLATE.outputSchema)).toBe(true);
    const fieldNames = TEMPLATE.outputSchema.map(f => f.field);
    expect(fieldNames).toContain('phase_summaries');
  });

  test('TEMPLATE has correct id', () => {
    expect(TEMPLATE.id).toBe('stage-17');
  });

  test('TEMPLATE has validate function', () => {
    expect(typeof TEMPLATE.validate).toBe('function');
  });

  test('TEMPLATE has computeDerived function', () => {
    expect(typeof TEMPLATE.computeDerived).toBe('function');
  });
});
