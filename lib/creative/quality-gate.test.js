// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-2) — quality gate tests.
import { describe, it, expect } from 'vitest';
import { assessBrandGenomeConformance, screenForFabrication, runQualityGate } from './quality-gate.js';

describe('assessBrandGenomeConformance', () => {
  it('rejects an asset with no brand_source_refs (real, mechanical check)', () => {
    const result = assessBrandGenomeConformance({ brand_source_refs: [] });
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('NO_BRAND_SOURCE_REFS');
  });

  it('MVP interim (SD-...-001-A FR-4): passes with brand_source_refs present — structural check only, deeper pixel comparison remains unimplemented', () => {
    const result = assessBrandGenomeConformance({ brand_source_refs: ['s17-artifact-1'] });
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('MVP_STRUCTURAL_CHECK_PASSED');
  });
});

describe('screenForFabrication (AC-1)', () => {
  it('rejects stub/test-mode output mechanically — the acceptance-criterion case, never weakened by the MVP interim check', () => {
    const stub = { provenance: { testMode: true }, asset: { kind: 'watermarked-stub' } };
    const result = screenForFabrication(stub);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('STUB_OUTPUT_REJECTED');
  });

  it('MVP interim (SD-...-001-A FR-4): passes a real, clean generation via the keyword deny-list screen', () => {
    const real = { provenance: { testMode: false, prompt: 'a photo of a mountain landscape' }, asset: { kind: 'generated' } };
    const result = screenForFabrication(real);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('MVP_KEYWORD_SCREEN_PASSED');
  });

  it('MVP interim: rejects a real generation whose prompt contains a denied fabrication keyword', () => {
    const real = { provenance: { testMode: false, prompt: 'a guaranteed weight-loss result photo' }, asset: { kind: 'generated' } };
    const result = screenForFabrication(real);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('FABRICATION_KEYWORD_MATCH');
    expect(result.matchedKeyword).toBe('guaranteed');
  });
});

describe('runQualityGate', () => {
  it('AC-1: a stubbed/placeholder provider response fails the gate mechanically, not silently accepted', () => {
    const stubGenerationResult = { provenance: { testMode: true }, asset: { kind: 'watermarked-stub' } };
    const storedAsset = { brand_source_refs: [] };
    const result = runQualityGate(stubGenerationResult, storedAsset);
    expect(result.pass).toBe(false);
    expect(result.stages.antiFabrication.reason).toBe('STUB_OUTPUT_REJECTED');
  });

  it('SD-...-001-A FR-4: a well-formed, real, clean generation now passes the MVP-scoped gate end-to-end', () => {
    const wellFormedGenerationResult = { provenance: { testMode: false, prompt: 'a hero image of a mountain trail' }, asset: { kind: 'generated' } };
    const wellFormedStoredAsset = { brand_source_refs: ['s17-artifact-1', 's17-artifact-2'] };
    const result = runQualityGate(wellFormedGenerationResult, wellFormedStoredAsset);
    expect(result.pass).toBe(true);
    expect(result.stages.brandGenome.reason).toBe('MVP_STRUCTURAL_CHECK_PASSED');
    expect(result.stages.antiFabrication.reason).toBe('MVP_KEYWORD_SCREEN_PASSED');
  });

  it('a real generation with a denied fabrication keyword still fails the gate overall', () => {
    const generationResult = { provenance: { testMode: false, prompt: 'clinically proven skin cream' }, asset: { kind: 'generated' } };
    const storedAsset = { brand_source_refs: ['s17-artifact-1'] };
    const result = runQualityGate(generationResult, storedAsset);
    expect(result.pass).toBe(false);
    expect(result.stages.antiFabrication.reason).toBe('FABRICATION_KEYWORD_MATCH');
  });
});
