/**
 * Tests for Stage 19 Build Loop Fixes
 * SD: SD-LEO-ORCH-PIPELINE-INTEGRITY-FIX-002-D
 *
 * Verifies: stage-19 template ID + stage-18 template ID + analysisStep functions.
 *
 * Gate-membership assertions previously in this file (Stage 19 in PROMOTION_GATE_STAGES,
 * CHAIRMAN_GATES.BLOCKING is union of KILL+PROMOTION) were removed in
 * SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-3 — those hardcoded sets no longer
 * exist. Gate membership is now sourced from stage_config via stage-governance.js
 * and covered by tests/unit/eva/stage-governance.test.js (FR-6).
 */
import { describe, test, expect } from 'vitest';
import TEMPLATE19 from '../stage-templates/stage-19.js';
import TEMPLATE18 from '../stage-templates/stage-18.js';

describe('Stage 19 Build Loop Fixes', () => {
  test('Stage 19 template ID is stage-19 (not stage-18)', () => {
    expect(TEMPLATE19.id).toBe('stage-19');
  });

  test('Stage 18 template ID is stage-18', () => {
    expect(TEMPLATE18.id).toBe('stage-18');
  });

  test('Stage 18 analysisStep is the worker typed-array wrapper', () => {
    // SD-LEO-FEAT-STAGE-MARKETING-COPY-001: analysisStep is now the wrapper
    // analyzeStage18MarketingCopyStep (it calls the flat analyzeStage18MarketingCopy
    // and projects COPY_SECTIONS into 9 marketing_<section> typed artifacts).
    expect(TEMPLATE18.analysisStep).toBeDefined();
    expect(typeof TEMPLATE18.analysisStep).toBe('function');
    expect(TEMPLATE18.analysisStep.name).toBe('analyzeStage18MarketingCopyStep');
  });

  test('Stage 19 analysisStep is defined as analyzeStage19', () => {
    expect(TEMPLATE19.analysisStep).toBeDefined();
    expect(typeof TEMPLATE19.analysisStep).toBe('function');
    expect(TEMPLATE19.analysisStep.name).toBe('analyzeStage19');
  });
});
