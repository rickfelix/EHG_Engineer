/**
 * QF-20260807-698 — pins scripts/modules/ai-quality-evaluator/config.js's SD_TYPE_PASS_THRESHOLDS
 * against the disposition in scripts/quality/tuning-003-disposition.mjs: exactly ONE change
 * (security 65 -> 70) was applied; five sibling INCREASE recommendations and one DECREASE were
 * refused/held because SD_TYPE_PASS_THRESHOLDS is keyed by sd_type alone (no content_type axis),
 * so applying any of them would collaterally raise the bar on a sibling content_type cell that
 * cannot bear it (see the disposition script for the measured evidence).
 */
import { describe, it, expect } from 'vitest';
import { SD_TYPE_PASS_THRESHOLDS, ORCHESTRATOR_THRESHOLD, DEFAULT_THRESHOLD } from '../../../scripts/modules/ai-quality-evaluator/config.js';

describe('SD_TYPE_PASS_THRESHOLDS — QF-20260807-698 disposition', () => {
  it('APPLIED: security raised 65 -> 70 (the only cell whose siblings all cleared the new bar)', () => {
    expect(SD_TYPE_PASS_THRESHOLDS.security).toBe(70);
  });

  it('REFUSED: bugfix, infrastructure, and orchestrator INCREASE recommendations were NOT applied', () => {
    // bugfix has no dedicated key at all -- it must keep falling through to DEFAULT_THRESHOLD,
    // exactly like refactor did before TUNING-002 gave it one.
    expect(SD_TYPE_PASS_THRESHOLDS.bugfix).toBeUndefined();
    // infrastructure's prd/retrospective cells both recommended 55 -> 60, refused because
    // infrastructure x user_story (avg ~53, the largest cell in the view) cannot clear 60.
    expect(SD_TYPE_PASS_THRESHOLDS.infrastructure).toBe(55);
    // orchestrator has no dedicated key -- ORCHESTRATOR_THRESHOLD governs it separately, and its
    // retrospective cell's 50 -> 55 recommendation was refused because orchestrator x user_story
    // cannot clear 55 (and the SAME view recommends DECREASING that cell, not raising the shared bar).
    expect(SD_TYPE_PASS_THRESHOLDS.orchestrator).toBeUndefined();
    expect(ORCHESTRATOR_THRESHOLD).toBe(50);
  });

  it('REFUSED: feature was NOT raised (feature x user_story cannot clear a higher bar)', () => {
    expect(SD_TYPE_PASS_THRESHOLDS.feature).toBe(60);
  });

  it('unrelated thresholds are untouched by this QF', () => {
    expect(SD_TYPE_PASS_THRESHOLDS.documentation).toBe(50);
    expect(SD_TYPE_PASS_THRESHOLDS.database).toBe(65);
    expect(SD_TYPE_PASS_THRESHOLDS.refactor).toBe(65);
    expect(DEFAULT_THRESHOLD).toBe(60);
  });
});
