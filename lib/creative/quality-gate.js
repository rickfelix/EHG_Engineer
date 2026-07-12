// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-2) — quality + anti-fabrication gate on
// generated assets. Two stages per the PRD: (1) brand-genome conformance, (2) anti-fabrication
// screening. Judged on the asset's actual output, never on the generation prompt's description
// of it (an asset judged by its own prompt is the decorative-computation class with a paintbrush).
//
// HONEST-GAUGE NOTE: full brand-genome pixel/palette conformance and claims-registry
// text-in-image screening both need infrastructure this repo does not have yet (no
// claims_registry table — confirmed absent, lib/apa/standing-assessment-round.mjs:30; no
// pixel-level brand-token comparator). Rather than fabricate a pass for checks that can't
// actually run, both stages FAIL CLOSED with a distinct, honest reason when their deeper
// check is unwired — an asset is NOT usable until it genuinely passes, never silently
// approved by an unimplemented judge (S-4 gauge substrate: NO-DATA over fabricated success).
// What IS real and mechanical now: rejecting stub/test-mode output outright (AC-1) and
// verifying brand-source provenance is present and non-empty before deeper conformance can
// even be attempted.

/**
 * Stage 1: brand-genome conformance. Structural check now (brand_source_refs present and
 * non-empty, referencing real S17 design-system artifacts); the deeper palette/typography/tone
 * pixel comparison is NOT yet implemented — fails closed with a distinct reason rather than a
 * fabricated pass.
 * @param {{brand_source_refs?: any[], provenance?: object}} asset
 * @returns {{pass: boolean, reason: string}}
 */
export function assessBrandGenomeConformance(asset) {
  const refs = asset?.brand_source_refs;
  if (!Array.isArray(refs) || refs.length === 0) {
    return { pass: false, reason: 'NO_BRAND_SOURCE_REFS' };
  }
  // Structural check passes; the pixel-level palette/typography/tone comparison against S17
  // artifacts is genuinely unimplemented — honest fail-closed, not a fabricated pass.
  return { pass: false, reason: 'PIXEL_CONFORMANCE_CHECK_NOT_IMPLEMENTED' };
}

/**
 * Stage 2: anti-fabrication screening. A stubbed/placeholder provider response (test-mode
 * output — generateAsset() defaults there) is rejected mechanically, always (AC-1): a stub is
 * never a real generation and can never be judged authentic. Real generated output cannot yet
 * be screened against a claims registry (unwired) — fails closed with a distinct reason.
 * @param {{provenance?: {testMode?: boolean}, asset?: {kind?: string}}} generationResult
 * @returns {{pass: boolean, reason: string}}
 */
export function screenForFabrication(generationResult) {
  const isStub = generationResult?.provenance?.testMode === true
    || generationResult?.asset?.kind === 'watermarked-stub';
  if (isStub) {
    return { pass: false, reason: 'STUB_OUTPUT_REJECTED' };
  }
  // A real (non-stub) generation cannot yet be screened for synthesized social proof / fake
  // testimonials / nonexistent-feature screenshots — claims_registry is unwired. Fail closed.
  return { pass: false, reason: 'CLAIMS_REGISTRY_NOT_WIRED' };
}

/**
 * Runs both quality-gate stages. Passes ONLY if both stages genuinely pass — an asset failing
 * either stage is not usable (referenceable by a channel step), matching AC-1/AC-2.
 * @param {object} generationResult — the {asset, provenance, cost} shape from generateAsset()
 * @param {object} storedAsset — the creative_assets row shape (brand_source_refs etc.)
 * @returns {{pass: boolean, stages: {brandGenome: object, antiFabrication: object}}}
 */
export function runQualityGate(generationResult, storedAsset) {
  const brandGenome = assessBrandGenomeConformance(storedAsset);
  const antiFabrication = screenForFabrication(generationResult);
  return { pass: brandGenome.pass && antiFabrication.pass, stages: { brandGenome, antiFabrication } };
}
