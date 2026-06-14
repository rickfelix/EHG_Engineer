/**
 * Per-venture D1 write-ceiling kill-switch.
 *
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C (FR-3).
 *
 * REUSES the existing pipeline CircuitBreaker (lib/eva/pipeline-runner/
 * circuit-breaker.js) READ-ONLY — we import the class and drive it through its
 * PUBLIC API only (recordFailure / isOpen / reset / status). We do NOT modify
 * circuit-breaker.js (a snapshot test in the suite proves zero diff). The
 * CircuitBreaker has no public manual-open method, so a D1 ceiling breach is
 * fed as repeated failures until the breaker's own evaluation opens the circuit
 * — the breaker's documented "open = should stop processing" semantics are
 * exactly the halt signal a kill-switch needs.
 *
 * @module lib/venture-deploy/d1-kill-switch
 */

import { CircuitBreaker } from '../eva/pipeline-runner/circuit-breaker.js';

/**
 * Create a per-venture kill-switch wrapping one CircuitBreaker instance.
 * @param {string} ventureId
 * @param {object} [config] — forwarded to CircuitBreaker (read-only reuse)
 */
export function createVentureKillSwitch(ventureId, config = {}) {
  const breaker = new CircuitBreaker(config);

  return {
    ventureId,
    breaker,

    /**
     * Trip the kill-switch on a D1 write-ceiling breach. Drives the breaker via
     * its public API until it reports open. Bounded so it always terminates.
     * @param {string} [reason]
     * @returns {boolean} true once the breaker is open (halted)
     */
    trip(reason = 'd1-write-ceiling exceeded') {
      // Drive the breaker open via its failure-rate path (>=5 failures over the
      // rolling window opens it under any threshold < 1). Bound to windowSize+5
      // so it always terminates — we do NOT chase the daily-cost-cap path (that
      // would require simulating dailyCostCap calls and break on an Infinity cap).
      let guard = (breaker.config?.windowSize ?? 20) + 5;
      while (!breaker.isOpen() && guard-- > 0) {
        breaker.recordFailure(new Error(`[${ventureId}] ${reason}`));
      }
      // FAIL-LOUD: a kill-switch that could not reach the open state must NOT
      // silently return false (that would fail OPEN for a safety control).
      if (!breaker.isOpen()) {
        throw new Error(`[${ventureId}] kill-switch failed to trip — breaker never opened (reason: ${reason}). `
          + 'This indicates a CircuitBreaker config that cannot open (e.g. failureThreshold >= 1); refusing to fail open.');
      }
      return true;
    },

    /** True when the venture's automated deploys must be halted. */
    isHalted() {
      return breaker.isOpen();
    },

    /** Clear the kill-switch (operator-initiated recovery). */
    reset() {
      breaker.reset();
    },

    /** Current breaker status for monitoring / the guardrail-state record. */
    status() {
      return breaker.status();
    },
  };
}

export default { createVentureKillSwitch };
