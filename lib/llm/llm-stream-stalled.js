/**
 * LLMStreamStalled — typed error for inactive LLM streaming responses.
 *
 * Thrown when an Anthropic streaming call has not produced a token within
 * the configured inter-chunk threshold. Distinct from a clean wall-clock
 * TIMEOUT: the connection is still alive but the server stopped emitting
 * tokens (the failure mode that motivated this watchdog —
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM A).
 *
 * Cross-bundle robustness: prefer `err.name === 'LLMStreamStalled'` over
 * `instanceof` — monorepo / bundler quirks can produce multiple Error
 * subclass instances at runtime.
 */
export class LLMStreamStalled extends Error {
  constructor({
    msSinceLastToken = 0,
    threshold = 0,
    callerLabel = 'unknown',
    lastTokenAt = null,
  } = {}) {
    super(
      `LLM stream stalled: no token for ${msSinceLastToken}ms ` +
      `(threshold=${threshold}ms, caller=${callerLabel})`
    );
    this.name = 'LLMStreamStalled';
    this.msSinceLastToken = msSinceLastToken;
    this.threshold = threshold;
    this.callerLabel = callerLabel;
    this.lastTokenAt = lastTokenAt;
  }
}
