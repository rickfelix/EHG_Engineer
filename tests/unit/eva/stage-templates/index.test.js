/**
 * Contract tests for the auto-discovered stage-templates barrel.
 *
 * SD-LEO-INFRA-STAGE-TEMPLATE-BARREL-001 (2026-04-25):
 * Replaced the prior hand-curated barrel + per-stage slug assertions with
 * invariant tests against the auto-discovery API. The prior test file
 * asserted specific slugs/ids that drifted silently when stage files were
 * renamed (RCA 2026-04-25). Invariant tests cannot drift the same way —
 * if a stage is added/removed/renamed, the assertions still hold.
 *
 * @module tests/unit/eva/stage-templates/index.test
 */

import { describe, it, expect } from 'vitest';
import {
  STAGE_COUNT,
  getTemplate,
  getAllTemplates,
  getNamedExport,
  getAllNamedExports,
  stage01,
  stage17,
  stage26,
} from '../../../../lib/eva/stage-templates/index.js';

describe('stage-templates barrel — invariants', () => {
  it('discovers every stage on disk (STAGE_COUNT >= 26)', () => {
    expect(STAGE_COUNT).toBeGreaterThanOrEqual(26);
  });

  it('getAllTemplates returns STAGE_COUNT templates', () => {
    expect(getAllTemplates()).toHaveLength(STAGE_COUNT);
  });

  it('every discovered template has a non-empty id and slug', () => {
    for (const tpl of getAllTemplates()) {
      expect(tpl).toBeDefined();
      expect(typeof tpl.id).toBe('string');
      expect(tpl.id.length).toBeGreaterThan(0);
      expect(typeof tpl.slug).toBe('string');
      expect(tpl.slug.length).toBeGreaterThan(0);
    }
  });

  it('getTemplate returns the matching template for stages 1..STAGE_COUNT', () => {
    for (let n = 1; n <= STAGE_COUNT; n++) {
      const tpl = getTemplate(n);
      expect(tpl, `stage ${n}`).toBeDefined();
      expect(tpl.id, `stage ${n}`).toBe(`stage-${String(n).padStart(2, '0')}`);
    }
  });

  it('getTemplate returns null for out-of-range stage numbers', () => {
    expect(getTemplate(0)).toBeNull();
    expect(getTemplate(99)).toBeNull();
    expect(getTemplate(-1)).toBeNull();
  });
});

describe('stage-templates barrel — getNamedExport', () => {
  it('returns null (does not throw) for missing stages', () => {
    expect(getNamedExport(99, 'anything')).toBeNull();
  });

  it('returns null (does not throw) for missing exports on existing stages', () => {
    expect(getNamedExport(1, 'symbolThatDoesNotExist')).toBeNull();
  });

  it('returns the function when an existing named export is requested', () => {
    // S17 has evaluatePromotionGate (verified at module load via dynamic discovery).
    expect(typeof getNamedExport(17, 'evaluatePromotionGate')).toBe('function');
  });

  it('does not crash if a previously-known export was deleted from a stage file', () => {
    // SD-REDESIGN-S18S26-E+F (PR #3211) deleted evaluatePromotionGate from
    // stage-23.js. The pre-fix barrel crashed at static-link; this barrel
    // returns null instead. This is the regression the SD prevents.
    expect(getNamedExport(23, 'evaluatePromotionGate')).toBeNull();
  });
});

describe('stage-templates barrel — getAllNamedExports snapshot', () => {
  it('returns a non-empty map of named exports across stages', () => {
    const all = getAllNamedExports();
    expect(Object.keys(all).length).toBeGreaterThan(0);
  });

  it('each entry maps export-name -> {stageNumber: value}', () => {
    const all = getAllNamedExports();
    for (const [name, stageMap] of Object.entries(all)) {
      expect(typeof name).toBe('string');
      expect(typeof stageMap).toBe('object');
      for (const [stageNum, value] of Object.entries(stageMap)) {
        expect(Number.isInteger(Number(stageNum))).toBe(true);
        expect(value).toBeDefined();
      }
    }
  });
});

describe('stage-templates barrel — backward-compat default re-exports', () => {
  it('exports stage01 with id stage-01', () => {
    expect(stage01).toBeDefined();
    expect(stage01.id).toBe('stage-01');
  });

  it('exports stage17 (Blueprint Review post-redesign) with id stage-17', () => {
    expect(stage17).toBeDefined();
    expect(stage17.id).toBe('stage-17');
  });

  it('exports stage26 with id stage-26', () => {
    expect(stage26).toBeDefined();
    expect(stage26.id).toBe('stage-26');
  });
});
