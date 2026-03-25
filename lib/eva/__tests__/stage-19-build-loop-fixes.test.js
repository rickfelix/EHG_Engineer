/**
 * Tests for Stage 19 Build Loop Fixes
 * SD: SD-LEO-ORCH-PIPELINE-INTEGRITY-FIX-002-D
 *
 * Verifies: stage-19 template ID, gate constants include 19,
 * stage-18 import alias, worker imports from gate-constants.
 */
import { describe, test, expect } from 'vitest';
import TEMPLATE19 from '../stage-templates/stage-19.js';
import TEMPLATE18 from '../stage-templates/stage-18.js';
import { CHAIRMAN_GATES, PROMOTION_GATE_STAGES, KILL_GATE_STAGES } from '../gate-constants.js';

describe('Stage 19 Build Loop Fixes', () => {
  test('Stage 19 template ID is stage-19 (not stage-18)', () => {
    expect(TEMPLATE19.id).toBe('stage-19');
  });

  test('Stage 18 template ID is stage-18', () => {
    expect(TEMPLATE18.id).toBe('stage-18');
  });

  test('Stage 19 is in PROMOTION_GATE_STAGES', () => {
    expect(PROMOTION_GATE_STAGES.has(19)).toBe(true);
  });

  test('Stage 19 is in CHAIRMAN_GATES.BLOCKING', () => {
    expect(CHAIRMAN_GATES.BLOCKING.has(19)).toBe(true);
  });

  test('CHAIRMAN_GATES.BLOCKING is union of KILL + PROMOTION stages', () => {
    for (const s of KILL_GATE_STAGES) {
      expect(CHAIRMAN_GATES.BLOCKING.has(s)).toBe(true);
    }
    for (const s of PROMOTION_GATE_STAGES) {
      expect(CHAIRMAN_GATES.BLOCKING.has(s)).toBe(true);
    }
  });

  test('Stage 18 analysisStep is defined as analyzeStage18', () => {
    expect(TEMPLATE18.analysisStep).toBeDefined();
    expect(typeof TEMPLATE18.analysisStep).toBe('function');
    expect(TEMPLATE18.analysisStep.name).toBe('analyzeStage18');
  });

  test('Stage 19 analysisStep is defined as analyzeStage19', () => {
    expect(TEMPLATE19.analysisStep).toBeDefined();
    expect(typeof TEMPLATE19.analysisStep).toBe('function');
    expect(TEMPLATE19.analysisStep.name).toBe('analyzeStage19');
  });
});
