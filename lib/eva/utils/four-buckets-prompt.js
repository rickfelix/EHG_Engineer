/**
 * Four Buckets Epistemic Classification - Prompt Fragment
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-B (FR-1)
 *
 * Shared prompt fragment injected into all 25 EVA analysis steps.
 * Instructs LLM to classify each key claim as fact/assumption/simulation/unknown.
 *
 * @module lib/eva/utils/four-buckets-prompt
 */

/**
 * Returns the Four Buckets classification instruction fragment.
 * Append this to the end of any analysis step's system prompt.
 *
 * @returns {string} Prompt fragment (~150 tokens)
 */
export function getFourBucketsPrompt() {
  return `

EPISTEMIC CLASSIFICATION (Four Buckets):
For each key claim in your output, add an "epistemicClassification" array to your JSON response.
Each entry must have: { "claim": "<the claim>", "bucket": "<fact|assumption|simulation|unknown>", "evidence": "<basis for classification>" }

Bucket definitions:
- fact: Directly stated in input data or verifiable from provided sources
- assumption: Inferred from data but requires validation; not directly stated
- simulation: Modeled or projected outcome (forecasts, estimates, scenarios)
- unknown: Insufficient data to classify; flagged for further research

Include 3-8 classifications covering your most significant claims.`;
}
