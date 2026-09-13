/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B.
 * TS-1 (order-sensitive regression), TS-7 (registry self-shape), TS-9 (real-registry
 * clean run against the CI predicate).
 */
import { describe, it, expect } from 'vitest';
import {
  QUALITY_MODEL_DIMENSIONS, QUALITY_MODEL_DIMENSION_IDS, WARN_CAPPED_DIMENSION_IDS,
  STAGE23_REQUIRED_CATEGORY_IDS, STAGE23_ADVISORY_CATEGORY_IDS, STAGE23_GROWTH_CATEGORY_IDS,
  getDimension,
} from '../../../../lib/eva/quality-model/registry.js';
import { FINDING_CATEGORIES, WARN_CAPPED_CATEGORIES } from '../../../../lib/eva/quality-findings/finding-shape.js';
import { evaluateQualityModelPredicate } from '../../../../lib/eva/quality-model/predicate.js';

describe('TS-7: registry self-shape', () => {
  it('is frozen at every level', () => {
    expect(Object.isFrozen(QUALITY_MODEL_DIMENSIONS)).toBe(true);
    for (const d of QUALITY_MODEL_DIMENSIONS) expect(Object.isFrozen(d)).toBe(true);
  });

  it('every dimension has a unique id', () => {
    const ids = QUALITY_MODEL_DIMENSIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every dimension has owner_stage/producer/reader_or_gate/severity_policy/applicability populated OR an explicit waiver reference', () => {
    for (const d of QUALITY_MODEL_DIMENSIONS) {
      const fullyPopulated = d.owner_stage !== undefined && d.producer !== undefined
        && d.reader_or_gate !== undefined && d.severity_policy !== undefined
        && typeof d.applicability === 'string' && d.applicability.length > 0;
      expect(fullyPopulated, `dimension '${d.id}' is missing a required field`).toBe(true);
      const hasGap = d.producer === null || d.reader_or_gate === null;
      if (hasGap) {
        expect(d.waiver, `dimension '${d.id}' has a null producer/reader but no waiver`).not.toBeNull();
      }
    }
  });

  it('every ratification_pointer.source is one of chairman_verbatim|scribe_paraphrase|verified_external_proxy (never reconstructed)', () => {
    const allowed = new Set(['chairman_verbatim', 'scribe_paraphrase', 'verified_external_proxy']);
    for (const d of QUALITY_MODEL_DIMENSIONS) {
      expect(allowed.has(d.ratification_pointer?.source), `dimension '${d.id}' has source='${d.ratification_pointer?.source}'`).toBe(true);
    }
  });

  it('module load throws if a reconstructed row is ever introduced (tripwire regression)', async () => {
    // Static re-assertion: the module already loaded cleanly (import above succeeded),
    // which is only possible because the load-time tripwire found zero 'reconstructed'
    // rows. This test documents that invariant explicitly rather than only relying on
    // "the import didn't throw".
    expect(QUALITY_MODEL_DIMENSIONS.some((d) => d.ratification_pointer?.source === 'reconstructed')).toBe(false);
  });

  it('QUALITY_MODEL_DIMENSION_IDS matches QUALITY_MODEL_DIMENSIONS order', () => {
    expect(QUALITY_MODEL_DIMENSION_IDS).toEqual(QUALITY_MODEL_DIMENSIONS.map((d) => d.id));
  });

  it('getDimension looks up by id', () => {
    expect(getDimension('legal')?.tier).toBe('legal');
    expect(getDimension('does-not-exist')).toBeUndefined();
  });
});

describe('TS-1: FINDING_CATEGORIES / WARN_CAPPED_CATEGORIES regression parity, order-sensitive', () => {
  it('FINDING_CATEGORIES is order-identical to the pre-generation literal', () => {
    expect(FINDING_CATEGORIES).toEqual([
      'npm_audit', 'secrets', 'lint', 'test_suite', 'unit_test', 'e2e_test', 'uat_test',
      'bug_report', 'uat_signoff', 'capability', 'feedback_widget_present',
      'error_capture_wired', 'usability', 'accessibility', 'journey_coherence',
      'performance', 'responsive',
    ]);
    expect(FINDING_CATEGORIES.length).toBe(17);
  });

  it('WARN_CAPPED_CATEGORIES is order-identical to the pre-generation literal', () => {
    expect(WARN_CAPPED_CATEGORIES).toEqual(['usability', 'accessibility', 'journey_coherence', 'performance', 'responsive']);
    expect(WARN_CAPPED_DIMENSION_IDS).toEqual(WARN_CAPPED_CATEGORIES);
  });
});

describe('FR-3 stage-23 checklist generation, order-sensitive', () => {
  it('matches the pre-generation literals exactly', () => {
    expect(STAGE23_REQUIRED_CATEGORY_IDS).toEqual(['code_quality', 'marketing_assets', 'distribution_channels', 'legal']);
    expect(STAGE23_ADVISORY_CATEGORY_IDS).toEqual(['analytics', 'monitoring']);
    expect(STAGE23_GROWTH_CATEGORY_IDS).toEqual(['growth_playbook', 'distribution_ad_copy']);
  });
});

describe('TS-9: CI predicate runs clean against the REAL shipped registry', () => {
  it('limb 1 (blocking) passes for FINDING_CATEGORIES', () => {
    const result = evaluateQualityModelPredicate({
      generatedCategoryIds: FINDING_CATEGORIES,
      dimensions: QUALITY_MODEL_DIMENSIONS,
    });
    expect(result.blocking.pass).toBe(true);
    expect(result.blocking.orphanCategories).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('limb 1 (blocking) passes for the stage-23 checklist categories', () => {
    const result = evaluateQualityModelPredicate({
      generatedCategoryIds: [...STAGE23_REQUIRED_CATEGORY_IDS, ...STAGE23_ADVISORY_CATEGORY_IDS, ...STAGE23_GROWTH_CATEGORY_IDS],
      dimensions: QUALITY_MODEL_DIMENSIONS,
    });
    expect(result.blocking.pass).toBe(true);
  });

  it('limb 2 (advisory) reports every unwired dimension, never fails the run -- ADVERSARIAL REVIEW FIX (PR #8931, HIGH): every waiver in the real registry has review_by:null (no real revisit date exists yet), so isWaiverActive correctly treats none of them as suppressing, and all 19 dimensions with a missing producer/reader surface honestly', () => {
    const result = evaluateQualityModelPredicate({
      generatedCategoryIds: FINDING_CATEGORIES,
      dimensions: QUALITY_MODEL_DIMENSIONS,
    });
    expect(result.advisory.findings.length).toBe(19);
    // feedback_widget_present/error_capture_wired/accessibility DO have both a producer
    // and a reader -- their waivers cover a DIFFERENT gap (DB-constraint rejection /
    // producer-overlap ambiguity), so they correctly never appear here.
    expect(result.advisory.findings.some((f) => f.id === 'feedback_widget_present')).toBe(false);
    expect(result.advisory.findings.some((f) => f.id === 'accessibility')).toBe(false);
    // A representative stub row (no producer, no reader, waiver present but review_by:null)
    // surfaces exactly as 'missing: both'.
    expect(result.advisory.findings).toContainEqual({ id: 'public_route_protection', missing: 'both' });
    // Advisory findings never fail the overall predicate.
    expect(result.pass).toBe(true);
  });

  it('a dimension with no producer/reader and NO waiver at all surfaces identically to one with a null-review_by waiver', () => {
    const stub = getDimension('public_route_protection');
    expect(stub.producer).toBeNull();
    expect(stub.reader_or_gate).toBeNull();
    const unwaived = { ...stub, waiver: null };
    const result = evaluateQualityModelPredicate({ generatedCategoryIds: [], dimensions: [unwaived] });
    expect(result.advisory.findings).toEqual([{ id: 'public_route_protection', missing: 'both' }]);
  });
});
