/**
 * I4 seeded fixture — value-authenticity regression canary
 * (docs/design/value-authenticity-system-design.md §1-L1, §10.1 "APA must
 * prove itself"; §4.1 "MarketLens replay"). SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001.
 *
 * A different KIND of calibration fixture than the I1-I3 HTML/PNG
 * visual-judgment pairs in docs/design/apa-calibration-fixtures/ (those are
 * Fable/judge calibration for the L5 UI/UX layer; this is a code-level
 * value-engine behavioral stub for the L1 layer). Kept in lib/apa/fixtures/
 * rather than forced into the I1-I3 manifest's html_native/capture_png
 * schema, which does not fit a pure-JS fixture.
 *
 * Synthesizes the design doc's origin incident (MarketLens
 * `src/services/personaGeneration.js`: an FNV-1a hash of input text mapped
 * to a fixed persona catalogue / WTP band, presented as if derived from
 * real market research) — a deterministic stub that is (a) input-SENSITIVE
 * (any input change moves the hash) but (b) NOT input-RESPONSIVE (the
 * direction of movement is uncorrelated with the input's meaning), and (c)
 * has no external dependency and never reaches any declared source.
 *
 * `stubPersonaEngine` is the SEEDED DEFECT this fixture exists to catch.
 * `realPersonaEngine` is a comparison "honest" implementation the ladder
 * must NOT flag, proving the ladder discriminates rather than over-firing.
 *
 * @module lib/apa/fixtures/value-authenticity-i4-marketlens-stub
 */

/** FNV-1a 32-bit hash, matching the design doc's described origin-incident mechanism. */
function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const WTP_BANDS = ['low', 'medium', 'high', 'premium'];

/**
 * The SEEDED DEFECT: a pure function of `input.description` text — no
 * external dependency, never reaches any declared "market research" source.
 * Presents its output as if it were derived from real research (the product-
 * level claim), but T0 finds no external dependency and T1 finds the
 * declared source was never reached.
 * @param {{description: string, budget?: number}} input
 * @returns {{wtpBandIndex: number, wtpBand: string, claim: string}}
 */
export function stubPersonaEngine(input) {
  const hash = fnv1aHash(input.description ?? '');
  const wtpBandIndex = hash % WTP_BANDS.length;
  return {
    wtpBandIndex,
    wtpBand: WTP_BANDS[wtpBandIndex],
    claim: 'WTP derived from real market research',
  };
}

/**
 * The comparison "honest" implementation: WTP band index derives
 * monotonically from a real, external-dependency-bearing input signal
 * (budget), which the ladder must NOT flag.
 * @param {{description: string, budget?: number}} input
 * @returns {{wtpBandIndex: number, wtpBand: string, claim: string}}
 */
export function realPersonaEngine(input) {
  const budget = input.budget ?? 0;
  const wtpBandIndex = Math.min(WTP_BANDS.length - 1, Math.floor(budget / 2500));
  return {
    wtpBandIndex,
    wtpBand: WTP_BANDS[wtpBandIndex],
    claim: 'WTP derived from real market research',
  };
}

export const STUB_ENGINE_SOURCE_TEXT = stubPersonaEngine.toString();
export const REAL_ENGINE_SOURCE_TEXT = `${realPersonaEngine.toString()}\n// external dependency: budget is sourced from venture_artifacts market-research corpus via supabase.from('venture_artifacts')`;

export default { stubPersonaEngine, realPersonaEngine, STUB_ENGINE_SOURCE_TEXT, REAL_ENGINE_SOURCE_TEXT };
