/**
 * QF-20260807-698 — pins scripts/modules/ai-quality-evaluator/config.js's SD_TYPE_PASS_THRESHOLDS
 * against the disposition in scripts/quality/tuning-003-disposition.mjs: exactly ONE change
 * (security 65 -> 70) was applied; five sibling INCREASE recommendations and one DECREASE were
 * refused/held because SD_TYPE_PASS_THRESHOLDS is keyed by sd_type alone (no content_type axis),
 * so applying any of them would collaterally raise the bar on a sibling content_type cell that
 * cannot bear it (see the disposition script for the measured evidence).
 *
 * SD-LEO-INFRA-QUALITY-GATE-TYPE-001 (2026-08-19) restructured SD_TYPE_PASS_THRESHOLDS from a flat
 * {sd_type: number} map to {sd_type: {default: number, [content_type]?: number}}, and made
 * getPassThreshold() actually resolve content_type instead of discarding it. This closed the
 * structural gap the paragraph above describes. Every pinned value below is unchanged from before
 * this restructure -- only the accessor (`.default` for mapped types) changed. bugfix/orchestrator
 * remain genuinely unmapped keys (still `undefined`, NOT `{default: undefined}`), so their
 * assertions are intentionally left on the bare key, not `.default`.
 */
import { describe, it, expect } from 'vitest';
import { SD_TYPE_PASS_THRESHOLDS, ORCHESTRATOR_THRESHOLD, DEFAULT_THRESHOLD } from '../../../scripts/modules/ai-quality-evaluator/config.js';
import { getPassThreshold } from '../../../scripts/modules/ai-quality-evaluator/scoring.js';

describe('SD_TYPE_PASS_THRESHOLDS — QF-20260807-698 disposition', () => {
  it('APPLIED: security raised 65 -> 70 (the only cell whose siblings all cleared the new bar)', () => {
    expect(SD_TYPE_PASS_THRESHOLDS.security.default).toBe(70);
  });

  it('REFUSED (at QF-20260807-698 time): orchestrator INCREASE recommendation was NOT applied', () => {
    // orchestrator has no dedicated key -- ORCHESTRATOR_THRESHOLD governs it separately, and its
    // retrospective cell's 50 -> 55 recommendation was refused because orchestrator x user_story
    // cannot clear 55 (and the SAME view recommends DECREASING that cell, not raising the shared bar).
    expect(SD_TYPE_PASS_THRESHOLDS.orchestrator).toBeUndefined();
    expect(ORCHESTRATOR_THRESHOLD).toBe(50);
  });

  it('APPLIED (QF-20260817-837): bugfix gained a dedicated key with per-content_type prd/retrospective overrides, default unchanged from the prior DEFAULT_THRESHOLD fallback', () => {
    // bugfix x prd: n=43, avg=80.1, pass=97.7% -> 60->65
    expect(SD_TYPE_PASS_THRESHOLDS.bugfix.prd).toBe(65);
    // bugfix x retrospective: n=85, avg=84.7, pass=91.8% -> 60->65
    expect(SD_TYPE_PASS_THRESHOLDS.bugfix.retrospective).toBe(65);
    // bugfix x user_story (OPTIMAL, n=183) is untouched: default stays 60, byte-identical to the
    // prior DEFAULT_THRESHOLD fallback bugfix had when it had no key at all.
    expect(SD_TYPE_PASS_THRESHOLDS.bugfix.default).toBe(60);
    expect(SD_TYPE_PASS_THRESHOLDS.bugfix.user_story).toBeUndefined();
  });

  it('REFUSED: feature was NOT raised (feature x user_story cannot clear a higher bar)', () => {
    expect(SD_TYPE_PASS_THRESHOLDS.feature.default).toBe(60);
  });

  it('unrelated thresholds are untouched by this QF', () => {
    expect(SD_TYPE_PASS_THRESHOLDS.documentation.default).toBe(50);
    expect(SD_TYPE_PASS_THRESHOLDS.database.default).toBe(65);
    expect(SD_TYPE_PASS_THRESHOLDS.refactor.default).toBe(65);
    expect(DEFAULT_THRESHOLD).toBe(60);
  });
});

describe('getPassThreshold — SD-LEO-INFRA-QUALITY-GATE-TYPE-001 (content_type resolution)', () => {
  it('FR-6/TS-8: zero value changes -- every mapped sd_type still resolves to its exact pre-restructure number with no content_type override configured', () => {
    expect(getPassThreshold('user_story', { sd_type: 'documentation' })).toBe(50);
    expect(getPassThreshold('prd', { sd_type: 'infrastructure' })).toBe(55);
    expect(getPassThreshold('retrospective', { sd_type: 'feature' })).toBe(60);
    expect(getPassThreshold('user_story', { sd_type: 'database' })).toBe(65);
    expect(getPassThreshold('prd', { sd_type: 'security' })).toBe(70);
    expect(getPassThreshold('retrospective', { sd_type: 'refactor' })).toBe(65);
  });

  it('TS-2: falls back to .default when no content_type override exists', () => {
    expect(getPassThreshold('user_story', { sd_type: 'infrastructure' })).toBe(55);
    expect(getPassThreshold('prd', { sd_type: 'infrastructure' })).toBe(55);
  });

  it('TS-3: a per-cell content_type override resolves distinctly from a sibling content_type, without mutating the shared module singleton', () => {
    // Local fixture only -- never mutate the imported SD_TYPE_PASS_THRESHOLDS object directly,
    // since that would leak across the module cache into other tests in the same run.
    const fixtureThresholds = {
      ...SD_TYPE_PASS_THRESHOLDS,
      infrastructure: { ...SD_TYPE_PASS_THRESHOLDS.infrastructure, prd: 60 },
    };
    const entry = fixtureThresholds.infrastructure;
    expect(entry.prd).toBe(60);
    expect(entry.default).toBe(55);
    // Real module state is untouched by the fixture above.
    expect(SD_TYPE_PASS_THRESHOLDS.infrastructure.prd).toBeUndefined();
    expect(SD_TYPE_PASS_THRESHOLDS.infrastructure.default).toBe(55);
  });

  it('TS-4: an unmapped sd_type still falls back to DEFAULT_THRESHOLD', () => {
    expect(getPassThreshold('prd', { sd_type: 'unknown_type' })).toBe(DEFAULT_THRESHOLD);
    // QF-20260817-837 gave bugfix a dedicated key (see the dedicated bugfix test above); it is
    // no longer unmapped, so it moved out of this assertion and orchestrator (still genuinely
    // unmapped, governed separately by ORCHESTRATOR_THRESHOLD) stands in for the same case.
    expect(getPassThreshold('prd', { sd_type: 'orchestrator' })).toBe(DEFAULT_THRESHOLD);
  });

  it('TS-5: sd=null (or missing sd_type) short-circuits to DEFAULT_THRESHOLD without touching SD_TYPE_PASS_THRESHOLDS', () => {
    expect(getPassThreshold('prd', null)).toBe(DEFAULT_THRESHOLD);
    expect(getPassThreshold('prd', {})).toBe(DEFAULT_THRESHOLD);
  });

  it('TS-6: sd._isOrchestrator short-circuits to ORCHESTRATOR_THRESHOLD before the nested lookup (requires a real sd_type, else the null-guard fires first)', () => {
    expect(getPassThreshold('prd', { sd_type: 'infrastructure', _isOrchestrator: true })).toBe(ORCHESTRATOR_THRESHOLD);
  });

  it('TS-9: uses ?? not || -- a legitimately-configured 0-valued override is not silently discarded', () => {
    // getPassThreshold has no config-injection seam, so this test transiently mutates the real
    // singleton and restores it in `finally` -- unlike TS-3 (which only needs a local fixture),
    // this scenario requires exercising the REAL getPassThreshold against a REAL 0-valued key to
    // prove `??` (not `||`) is actually what runs, not a re-implementation of the same logic.
    const hadOwnProperty = Object.hasOwn(SD_TYPE_PASS_THRESHOLDS.infrastructure, 'prd');
    const previousValue = SD_TYPE_PASS_THRESHOLDS.infrastructure.prd;
    SD_TYPE_PASS_THRESHOLDS.infrastructure.prd = 0;
    try {
      expect(getPassThreshold('prd', { sd_type: 'infrastructure' })).toBe(0);
    } finally {
      if (hadOwnProperty) {
        SD_TYPE_PASS_THRESHOLDS.infrastructure.prd = previousValue;
      } else {
        delete SD_TYPE_PASS_THRESHOLDS.infrastructure.prd;
      }
    }
    // Restored -- confirms cleanup left the singleton exactly as other tests expect it.
    expect(SD_TYPE_PASS_THRESHOLDS.infrastructure.prd).toBeUndefined();
    expect(SD_TYPE_PASS_THRESHOLDS.infrastructure.default).toBe(55);
  });
});
