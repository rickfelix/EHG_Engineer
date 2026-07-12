// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-2) — quality gate tests.
import { describe, it, expect } from 'vitest';
import { assessBrandGenomeConformance, screenForFabrication, runQualityGate } from './quality-gate.js';

describe('assessBrandGenomeConformance', () => {
  it('rejects an asset with no brand_source_refs (real, mechanical check)', () => {
    const result = assessBrandGenomeConformance({ brand_source_refs: [] });
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('NO_BRAND_SOURCE_REFS');
  });

  it('rejects even with brand_source_refs present — pixel-level conformance is honestly unimplemented, never a fabricated pass', () => {
    const result = assessBrandGenomeConformance({ brand_source_refs: ['s17-artifact-1'] });
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('PIXEL_CONFORMANCE_CHECK_NOT_IMPLEMENTED');
  });
});

describe('screenForFabrication (AC-1)', () => {
  it('rejects stub/test-mode output mechanically — the acceptance-criterion case', () => {
    const stub = { provenance: { testMode: true }, asset: { kind: 'watermarked-stub' } };
    const result = screenForFabrication(stub);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('STUB_OUTPUT_REJECTED');
  });

  it('rejects a real (non-stub) generation too — claims_registry is honestly unwired, never a fabricated pass', () => {
    const real = { provenance: { testMode: false }, asset: { kind: 'generated' } };
    const result = screenForFabrication(real);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('CLAIMS_REGISTRY_NOT_WIRED');
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

  it('currently blocks ALL assets by honest design (both stages fail-closed pending real infra) — never a false-pass', () => {
    // This is the explicit, documented current state: neither judge is fully implemented, so
    // nothing is falsely marked quality-approved. A future PR wiring the pixel comparator and
    // claims_registry should change these reasons/results, at which point this test's intent
    // shifts to "genuinely good assets pass, bad ones don't" — but until then, fail-closed.
    const wellFormedGenerationResult = { provenance: { testMode: false }, asset: { kind: 'generated' } };
    const wellFormedStoredAsset = { brand_source_refs: ['s17-artifact-1', 's17-artifact-2'] };
    const result = runQualityGate(wellFormedGenerationResult, wellFormedStoredAsset);
    expect(result.pass).toBe(false);
    expect(result.stages.brandGenome.reason).toBe('PIXEL_CONFORMANCE_CHECK_NOT_IMPLEMENTED');
    expect(result.stages.antiFabrication.reason).toBe('CLAIMS_REGISTRY_NOT_WIRED');
  });
});
